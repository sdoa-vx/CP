import crypto from "crypto";
import fs from "fs";
import path from "path";
import { emit } from "../engine/events";

export interface ChronicleEntry {
  id: string;
  prevHash: string;
  sequenceNo: number;
  timestamp: string;
  type: string;
  source: string;
  payload: any;
}

export class ChronicleService {
  static MANIFEST = {
    // ── Identity ──────────────────────────────
    id:              "Chronicle.service",
    type:            "service",
    layer:           3,
    runtime:         "TypeScript",
    version:         "5.0.0",
    operationalRole: "savant"
  };

  private _chain: ChronicleEntry[] = [];
  private _index: Map<string, ChronicleEntry> = new Map();
  private _sequenceNo = 0;
  private _genesisHash = "0000000000000000000000000000000000000000000000000000000000000000";
  private _dbPath = path.resolve(process.cwd(), "database", "chronicle.json");

  // ── Lifecycle ────────────────────────────────

  initGenesis() {
    if (!fs.existsSync(path.dirname(this._dbPath))) {
      fs.mkdirSync(path.dirname(this._dbPath), { recursive: true });
    }
  }

  loadFromDisk() {
    if (fs.existsSync(this._dbPath)) {
      try {
        const data = fs.readFileSync(this._dbPath, "utf-8");
        const parsed = JSON.parse(data);
        this._chain = parsed.chain || [];
        this._sequenceNo = parsed.sequenceNo || 0;
        this._index.clear();
        for (const entry of this._chain) {
          this._index.set(entry.id, entry);
        }
      } catch (e) {
        console.error("[Chronicle] Failed to load ledger from disk", e);
      }
    }
  }

  persistToDisk() {
    try {
      const data = JSON.stringify({
        chain: this._chain,
        sequenceNo: this._sequenceNo
      }, null, 2);
      fs.writeFileSync(this._dbPath, data, "utf-8");
    } catch (e) {
      console.error("[Chronicle] Failed to persist ledger to disk", e);
    }
  }

  // ── Core API ─────────────────────────────────

  appendBlock({ type, payload = {}, source = "unknown" }: { type: string, payload?: any, source?: string }) {
    if (!type) throw new Error("Chronicle.appendBlock: `type` is required.");

    const prevHash = this._chain.length > 0
      ? this._chain[this._chain.length - 1].id
      : this._genesisHash;

    const sequenceNo = ++this._sequenceNo;
    const timestamp  = new Date().toISOString();

    const hashInput = JSON.stringify({ prevHash, sequenceNo, timestamp, type, source, payload });
    const hash      = this.hashBlock(hashInput);

    const entry: ChronicleEntry = {
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

    this.persistToDisk();

    try {
      emit("chronicle:entryRecorded", {
        id: hash, type, source, sequenceNo
      });
    } catch (_) {}

    return hash;
  }

  // Alias for backward-compatibility with my earlier plan
  recordEvent(eventName: string, payload = {}, source = "EventBus") {
    return this.appendBlock({ type: `event:${eventName}`, payload, source });
  }

  replay({ fromId }: { fromId?: string } = {}) {
    if (!fromId) return this._chain.map(e => this._safeClone(e));

    const startEntry = this._index.get(fromId);
    if (!startEntry) throw new Error(`Chronicle.replay: entry "${fromId}" not found.`);

    const startIdx = this._chain.indexOf(startEntry);
    return this._chain.slice(startIdx).map(e => this._safeClone(e));
  }

  verifyChain() {
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
      const expectedHash = this.hashBlock(hashInput);

      if (entry.prevHash !== prevHash || entry.id !== expectedHash) {
        return false;
      }

      prevHash = entry.id;
    }

    return true;
  }

  verify() {
    return this.verifyChain();
  }

  hashBlock(input: string) {
    return crypto.createHash("sha256").update(input, "utf8").digest("hex");
  }

  private _safeClone(entry: any) {
    return structuredClone ? structuredClone(entry) : JSON.parse(JSON.stringify(entry));
  }
}

export const Chronicle = new ChronicleService();
// Export lowercase chronicle as well in case other files use it
export const chronicle = Chronicle;
