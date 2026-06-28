// ──────────────────────────────────────────────────────────────────
// File:    Chronicle.service.js
// Version: 5.0.0
// Updated: 2026-06-17T00:00:00Z
// Changes: Relocated to canonical sdoavx/ structure
// ──────────────────────────────────────────────────────────────────
// Last modified: 2026-06-01 00:00 UTC
// Chronicle.service.js — SDOA v5.0 Service (Universal)
//
// Change log:
//   5.0.0 — Initial implementation. Append-only, SHA-256 hash-chained audit ledger.
//            Records every EventBus emission, StateStore mutation, and command
//            invocation as a Chronicle entry. Supports full deterministic replay
//            from any checkpoint. Chain integrity verifiable at any time.

"use strict";

const crypto = require("crypto");

class ChronicleService {
  static MANIFEST = {
    // ── Identity ──────────────────────────────
    id:              "Chronicle.service",
    type:            "service",
    layer:           3,
    runtime:         "Universal",
    version:         "5.0.0",
    operationalRole: "savant",

    // ── Dependencies ──────────────────────────
    requires:  [],
    dataFiles: [],

    // ── Lifecycle ─────────────────────────────
    lifecycle: ["init", "run", "dispose"],

    // ── Action Surface ────────────────────────
    actions: {
      commands: {
        record: {
          description: "Append a new entry to the ledger. Returns the entry's chain ID.",
          input:  { type: "string", payload: "object", source: "string?" },
          output: "string"
        },
        replay: {
          description: "Return all entries from a given chain ID onward (inclusive). Omit fromId to replay from genesis.",
          input:  { fromId: "string?" },
          output: "object[]"
        },
        verify: {
          description: "Walk the full chain and confirm every SHA-256 link is intact. Returns true if valid.",
          input:  {},
          output: "boolean"
        },
        getEntry: {
          description: "Retrieve a single entry by its chain ID.",
          input:  { id: "string" },
          output: "object"
        },
        snapshot: {
          description: "Return a signed summary of the current chain tail for checkpoint storage.",
          input:  {},
          output: "object"
        },
        clear: {
          description: "Wipe the in-memory ledger. Does NOT reset the persistent store. For testing only.",
          input:  {},
          output: "void"
        }
      },
      events: {
        "chronicle:entryRecorded": {
          payload: { id: "string", type: "string", source: "string", sequenceNo: "number" }
        },
        "chronicle:chainVerified": {
          payload: { valid: "boolean", entryCount: "number", checkedAt: "string" }
        },
        "chronicle:chainTampered": {
          payload: { failedAtId: "string", sequenceNo: "number" }
        }
      },
      accepts: {
        "eventbus:emission": {
          description: "Auto-records any event emitted on the EventBus when Chronicle is wired to intercept."
        },
        "statestore:mutation": {
          description: "Auto-records StateStore mutations when the Captain wires Chronicle in."
        }
      },
      slots: {}
    },

    // ── Documentation ─────────────────────────
    docs: {
      description: "Immutable, SHA-256 hash-chained audit ledger. Every recorded event carries a cryptographic link to the previous entry, making the chain tamper-evident. Supports full session replay, checkpoint snapshots, and chain integrity verification. Pairs with Timeline.prim.js for visual inspection.",
      author: "ProtoAI Core Architecture Group",
      sdoa: "5.0.0"
    }
  };

  // ── Private State ────────────────────────────
  _chain       = [];   // Array<ChronicleEntry>
  _index       = new Map();  // id → ChronicleEntry
  _sequenceNo  = 0;
  _registry    = null;
  _genesisHash = "0000000000000000000000000000000000000000000000000000000000000000";

  // ── Lifecycle ────────────────────────────────

  async init(registry) {
    this._registry = registry;
  }

  async run() {
    // Chronicle is passive — it records on demand.
    // Active interception of EventBus/StateStore is wired by Captain.service.js.
    return { status: "ready", chainLength: this._chain.length };
  }

  async dispose() {
    this._chain  = [];
    this._index  = new Map();
    this._sequenceNo = 0;
  }

  // ── Core API ─────────────────────────────────

  /**
   * record({ type, payload, source })
   * Appends a new, hash-chained entry to the ledger.
   * Returns the new entry's chain ID (SHA-256 hex string).
   */
  record({ type, payload = {}, source = "unknown" } = {}) {
    if (!type) throw new Error("Chronicle.record: `type` is required.");

    const prevHash   = this._chain.length > 0
      ? this._chain[this._chain.length - 1].hash
      : this._genesisHash;

    const sequenceNo = ++this._sequenceNo;
    const timestamp  = new Date().toISOString();

    // Deterministic serialization for hashing
    const hashInput = JSON.stringify({ prevHash, sequenceNo, timestamp, type, source, payload });
    const hash      = this._sha256(hashInput);

    const entry = {
      id:         hash,
      prevHash,
      sequenceNo,
      timestamp,
      type,
      source,
      payload:    structuredClone ? structuredClone(payload) : JSON.parse(JSON.stringify(payload))
    };

    this._chain.push(entry);
    this._index.set(hash, entry);

    // Notify — non-blocking, best-effort
    this._emit("chronicle:entryRecorded", {
      id: hash, type, source, sequenceNo
    });

    return hash;
  }

  /**
   * replay({ fromId? })
   * Returns all entries from the entry with the given ID onward (inclusive).
   * Omit fromId to replay from genesis (full chain).
   */
  replay({ fromId } = {}) {
    if (!fromId) return this._chain.map(e => this._safeClone(e));

    const startEntry = this._index.get(fromId);
    if (!startEntry) throw new Error(`Chronicle.replay: entry "${fromId}" not found.`);

    const startIdx = this._chain.indexOf(startEntry);
    return this._chain.slice(startIdx).map(e => this._safeClone(e));
  }

  /**
   * verify()
   * Walks the full chain and validates every SHA-256 link.
   * Returns true if the chain is intact, false if tampered.
   * Emits chronicle:chainVerified or chronicle:chainTampered.
   */
  verify() {
    let prevHash = this._genesisHash;

    for (const entry of this._chain) {
      const hashInput = JSON.stringify({
        prevHash:   entry.prevHash,
        sequenceNo: entry.sequenceNo,
        timestamp:  entry.timestamp,
        type:       entry.type,
        source:     entry.source,
        payload:    entry.payload
      });
      const expectedHash = this._sha256(hashInput);

      if (entry.prevHash !== prevHash || entry.id !== expectedHash) {
        this._emit("chronicle:chainTampered", {
          failedAtId: entry.id,
          sequenceNo: entry.sequenceNo
        });
        this._emit("chronicle:chainVerified", {
          valid: false,
          entryCount: this._chain.length,
          checkedAt: new Date().toISOString()
        });
        return false;
      }

      prevHash = entry.id;
    }

    this._emit("chronicle:chainVerified", {
      valid: true,
      entryCount: this._chain.length,
      checkedAt: new Date().toISOString()
    });
    return true;
  }

  /**
   * getEntry({ id })
   * Returns a single entry by chain ID, or null if not found.
   */
  getEntry({ id } = {}) {
    const entry = this._index.get(id);
    return entry ? this._safeClone(entry) : null;
  }

  /**
   * snapshot()
   * Returns a signed summary of the current chain tail.
   * Use for checkpoint storage — replay from this point forward.
   */
  snapshot() {
    const tail        = this._chain[this._chain.length - 1] ?? null;
    const snapshotAt  = new Date().toISOString();
    const signInput   = JSON.stringify({ tailId: tail?.id ?? null, snapshotAt, length: this._chain.length });

    return {
      tailId:      tail?.id ?? null,
      sequenceNo:  this._sequenceNo,
      chainLength: this._chain.length,
      snapshotAt,
      signature:   this._sha256(signInput)  // Integrity seal on the snapshot itself
    };
  }

  /**
   * clear()
   * Wipes the in-memory chain. For testing only — does not touch persistence.
   */
  clear() {
    this._chain      = [];
    this._index      = new Map();
    this._sequenceNo = 0;
  }

  // ── Convenience Wrappers (for Captain to wire) ─────────────

  /**
   * recordEvent(eventName, payload, source)
   * Thin wrapper for auto-recording EventBus emissions.
   */
  recordEvent(eventName, payload = {}, source = "EventBus") {
    return this.record({ type: `event:${eventName}`, payload, source });
  }

  /**
   * recordMutation(key, oldValue, newValue, source)
   * Thin wrapper for auto-recording StateStore mutations.
   */
  recordMutation(key, oldValue, newValue, source = "StateStore") {
    return this.record({
      type:    `mutation:${key}`,
      payload: { key, oldValue, newValue },
      source
    });
  }

  /**
   * recordCommand(moduleId, commandId, params, source)
   * Thin wrapper for auto-recording command invocations.
   */
  recordCommand(moduleId, commandId, params = {}, source = "EventBus") {
    return this.record({
      type:    `command:${moduleId}.${commandId}`,
      payload: { moduleId, commandId, params },
      source
    });
  }

  // ── Private Helpers ──────────────────────────

  _sha256(input) {
    return crypto.createHash("sha256").update(input, "utf8").digest("hex");
  }

  _safeClone(entry) {
    return structuredClone ? structuredClone(entry) : JSON.parse(JSON.stringify(entry));
  }

  _emit(eventName, payload) {
    try {
      // Node.js context: if registry exposes an EventBus service, use it
      const bus = this._registry?.get?.("EventBus.service");
      if (bus?.emit) {
        bus.emit(eventName, payload);
      }
    } catch (_) {
      // Chronicle must never throw on emit failure — the ledger comes first
    }
  }
}

module.exports = ChronicleService;
