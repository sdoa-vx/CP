// ──────────────────────────────────────────────────────────────────
// File:    SleeveBase.module.js
// Version: 1.8.0
// Updated: 2026-07-14T00:00:00Z
// Changes: Phase 5 (oversized-file split) — decomposed four bolted-on
//          amendment subsystems into prototype mixins, applied via
//          Object.assign(SleeveBase.prototype, ...) below:
//            SleeveTransportNegotiation.utility.js  (Amendment 4.1)
//            SleeveSandbox.utility.js               (Amendment 3.5)
//            SleeveModelTraining.utility.js         (Amendment 4.4)
//            SleeveBoundaryBatching.utility.js      (Amendment 4.5)
//          This file now carries only the sovereign lifecycle contract
//          (init/run/dispose), the subclass-override contract, Amendment
//          3.1 telemetry base fields, Amendment 3.2 auto-discovery, and
//          Amendment 3.3 model-info emission. Public API and behavior
//          are unchanged — every method removed from this file is still
//          reachable as this.methodName() via the prototype, so
//          subclasses can still override any documented hook
//          (_callExternal, _healthCheck, _teardown, _probeTransport,
//          _executeBatch, _trainLoRA, _validateLoRA, _loadAdapter,
//          _discoverCommands) exactly as before. Full pre-split amendment
//          history (4.5 Batching, 4.4 Training Pipeline, 4.1 Transport
//          Negotiation, 3.5 Sandbox Mode) is preserved in each mixin's
//          own file header and in git log.
// ──────────────────────────────────────────────────────────────────
// SleeveBase.module.js — SDOA v5 Sleeve (NodeJS)
//
// Abstract base class for all SDOA v5.5 Sleeve sovereigns. Defines the
// three-phase lifecycle contract (init/run/dispose), canonical boundary
// telemetry (sleeve:init, sleeve:run, sleeve:boundaryCall,
// sleeve:boundaryFault, sleeve:health, sleeve:disposed), auto-discovery,
// and the subclass-override contract that concrete sleeves implement.
// ──────────────────────────────────────────────────────────────────
"use strict";

const { randomUUID } = require("crypto");

const SleeveTransportNegotiation = require("./SleeveTransportNegotiation.utility");
const SleeveSandbox              = require("./SleeveSandbox.utility");
const SleeveModelTraining        = require("./SleeveModelTraining.utility");
const SleeveBoundaryBatching     = require("./SleeveBoundaryBatching.utility");

const TELEMETRY_VERSION = "5.5";

class SleeveBase {
  static MANIFEST = {
    id:           "SleeveBase.module",
    type:         "sleeve",
    layer:        3,
    runtime:      "NodeJS",
    version:      "1.8.0",
    capabilities: [
      "sleeve.lifecycle.init", "sleeve.lifecycle.run", "sleeve.lifecycle.dispose",
      "sleeve.discovery", "sleeve.telemetry"
    ],
    dependencies: [
      "SleeveTransportNegotiation.utility",
      "SleeveSandbox.utility",
      "SleeveModelTraining.utility",
      "SleeveBoundaryBatching.utility"
    ],
    docs: {
      description: "Abstract base class for all SDOA v5.5 Sleeve sovereigns — lifecycle contract (init/run/dispose), canonical boundary telemetry, auto-discovery, and the subclass-override contract. Transport negotiation, sandbox mode, model training, and boundary batching/compression are contributed via prototype mixins (see dependencies) as of the Phase 5 oversized-file split; this file itself is now under the Layer 3 line cap."
    },
    last_modified: "2026-07-14T00:00:00Z"
  };

  _registry     = null;
  _formatter    = null;
  _pathResolver = null;
  _triage       = null;
  _resolvedPath = null;
  _healthy      = false;

  // Amendment 4.4 — model training state (methods live in SleeveModelTraining.utility.js)
  _adapterRegistry = new Map();  // adapterId → { state, loss, score, passed, proposalId }
  _upgradeUnsub    = null;       // unsub handle for coach:modelUpgradeApproved

  // Amendment 4.1 — transport negotiation state (methods live in SleeveTransportNegotiation.utility.js)
  _activeTransport = null;   // set at init(); updated by negotiateTransport()

  // Amendment 3.5 — sandbox state (methods live in SleeveSandbox.utility.js)
  _sandboxMode  = false;
  _replayMode   = false;
  _fixtures     = new Map();   // command|"*" → response | fn(cmd,payload)→response

  // ── Lifecycle ──────────────────────────────────────────────────

  async init(registry) {
    this._registry     = registry;
    this._formatter    = registry.get("ResponseFormatter.service");
    this._pathResolver = registry.get("PathResolver.service");
    this._triage       = registry.get("Triage.workflow");

    const manifest = this.constructor.MANIFEST;
    const external = manifest?.external ?? {};

    if (external.path && external.path !== "auto") {
      this._resolvedPath = this._pathResolver?.resolve?.(external.path) ?? external.path;
    }

    // Amendment 4.1: seed active transport from first declared option
    const transports = external.transports ?? [external.transport].filter(Boolean);
    this._activeTransport = transports[0] ?? external.transport ?? null;

    try {
      await this._healthCheck();
      this._healthy = true;
    } catch (err) {
      this._healthy = false;
    }

    // Amendment 4.4: subscribe to approval events for this sleeve only
    try {
      const bus = registry.get("EventBus.service");
      if (bus) {
        const onApproved = async (event) => {
          if (event.moduleId !== manifest.id) return;
          const entry = this._adapterRegistry.get(event.adapterId);
          if (entry) entry.state = "fielding";
          try { await this._loadAdapter(event.adapterId); if (entry) entry.state = "fielded"; }
          catch (_) { if (entry) entry.state = "loadFailed"; }
        };
        bus.on("coach:modelUpgradeApproved", onApproved);
        this._upgradeUnsub = () => bus.off?.("coach:modelUpgradeApproved", onApproved);
      }
    } catch (_) {}

    // sleeve:init — always emitted, healthy or not (Amendment 3.1)
    this._emit("sleeve:init", {
      ...this._base(manifest, external),
      healthy:      this._healthy,
      resolvedPath: this._resolvedPath ?? null
    });

    // Amendment 4.1: probe available transports at init if multiple declared
    if (transports.length > 1) {
      try { await this.negotiateTransport("init"); } catch (_) {}
    }
  }

  async run({ command, payload } = {}) {
    const manifest = this.constructor.MANIFEST;
    const external = manifest?.external ?? {};
    const allowed  = external.commands ?? [];
    const base     = this._base(manifest, external);

    if (!command) {
      return this._fail("run: command is required");
    }

    if (allowed.length > 0 && !allowed.includes(command)) {
      return this._fail(
        `${manifest.id}: command "${command}" is not in external.commands [${allowed.join(", ")}]`
      );
    }

    // Amendment 3.5: sandbox intercept — never touches external system
    if (this._sandboxMode) return this._runSandbox(command, payload ?? {});

    // Amendment 4.5: automatic payload compression when external.compression === true
    let effectivePayload = payload ?? {};
    if (external.compression === true && effectivePayload && typeof effectivePayload === "object") {
      effectivePayload = this.compressPayload(effectivePayload, command);
    }

    const correlationId = randomUUID();

    // sleeve:run — pre-call trace (Amendment 3.1)
    this._emit("sleeve:run", { ...base, command, correlationId });

    const t0 = Date.now();
    let result;

    try {
      // Amendment 4.1: pass active transport so subclasses can dispatch per-transport
      const raw = await this._callExternal(command, effectivePayload, this._activeTransport);
      result    = this._normalize(raw);
    } catch (err) {
      result = this._fail(err.message);
    }

    const durationMs = Date.now() - t0;

    // sleeve:boundaryCall — completion (Amendment 3.1, expanded from v5.4)
    this._emit("sleeve:boundaryCall", {
      ...base,
      command,
      durationMs,
      ok: result.ok ?? false,
      correlationId
    });

    // sleeve:boundaryFault — fault-only stream for Triage / Cartographer (Amendment 3.1)
    if (!result.ok) {
      this._emit("sleeve:boundaryFault", {
        ...base,
        command,
        durationMs,
        error: result.error ?? "unknown fault",
        correlationId
      });
      // Amendment 4.1: auto-renegotiate transport async after any fault
      const transports = external.transports ?? [];
      if (transports.length > 1) {
        Promise.resolve().then(() => this.negotiateTransport("fault").catch(() => {}));
      }
    }

    // Pulse latency tracking
    try {
      this._registry?.get?.("Pulse.workflow")?.recordSample?.({
        moduleId:  manifest.id,
        commandId: command,
        durationMs,
        success:   result.ok ?? false
      });
    } catch (_) {}

    return result;
  }

  async dispose() {
    const manifest = this.constructor.MANIFEST;
    const external = manifest?.external ?? {};

    try { await this._teardown(); } catch (_) {}

    this._emit("sleeve:disposed", {
      ...this._base(manifest, external),
      reason: null
    });

    this._registry     = null;
    this._formatter    = null;
    this._pathResolver = null;
    this._triage        = null;
    this._resolvedPath  = null;
    this._healthy       = false;
    try { this._upgradeUnsub?.(); } catch (_) {}
    this._upgradeUnsub    = null;
    this._adapterRegistry.clear();
    this._activeTransport = null;   // Amendment 4.1
    // Amendment 3.5: always exit sandbox on dispose — no leaked intercept
    this._sandboxMode  = false;
    this._replayMode   = false;
    this._fixtures.clear();
  }

  // ── Subclass contract ──────────────────────────────────────────

  // Amendment 4.1: transport is the currently active transport (from negotiation).
  // Subclasses that support multiple transports use it to dispatch the call correctly.
  async _callExternal(command, payload, transport) {
    throw new Error(`${this.constructor.name}: _callExternal() not implemented`);
  }

  async _healthCheck() {}

  async _teardown() {}

  // ── Amendment 3.3 — Model info emission ───────────────────────
  // Called by AI model sleeves (AiSleeve, QwenSleeve, PolicySleeve)
  // after resolving the model at init() or after a health check.
  // Non-model sleeves never need to call this.
  _emitModelInfo(modelVersion = null, modelHash = null, declaredCapabilities = []) {
    const manifest = this.constructor.MANIFEST;
    const external = manifest?.external ?? {};
    this._emit("sleeve:modelInfo", {
      ...this._base(manifest, external),
      modelVersion:         modelVersion ?? null,
      modelHash:            modelHash ?? null,
      declaredCapabilities: declaredCapabilities ?? []
    });
  }

  // ── Amendment 3.2 — Sleeve Auto-Discovery ─────────────────────
  // Probe the external system for available commands, compute the
  // undeclared subset, and emit sleeve:commandDiscovered as a proposal.
  // Coach receives the event and routes a manifest amendment through
  // ProbationOfficer → Registrar.fieldChampion(). This method never
  // writes the manifest directly — the sleeve cannot self-approve.
  async runDiscovery() {
    const manifest = this.constructor.MANIFEST;
    const external = manifest?.external ?? {};
    const base     = this._base(manifest, external);

    const currentCommands   = external.commands ?? [];
    let   discoveredCommands = [];

    try {
      discoveredCommands = await this._discoverCommands();
    } catch (err) {
      // Discovery failure is non-fatal — log and return empty proposal
      console.warn(`[${manifest.id}] _discoverCommands() failed: ${err.message}`);
      return { proposalId: null, undeclaredCommands: [] };
    }

    const valid     = discoveredCommands.filter(c => /^[a-zA-Z][a-zA-Z0-9_/.-]*$/.test(c));
    const undeclared = valid.filter(c => !currentCommands.includes(c)).slice(0, 10);

    if (undeclared.length === 0) {
      return { proposalId: null, undeclaredCommands: [] };
    }

    const proposalId = randomUUID();

    this._emit("sleeve:commandDiscovered", {
      ...base,
      currentCommands,
      discoveredCommands: valid,
      undeclaredCommands: undeclared,
      proposalId
    });

    return { proposalId, undeclaredCommands: undeclared };
  }

  // Override: return the list of commands available on the external system.
  // This is a lightweight probe — not a full call. Return [] if the
  // external system has no introspection capability.
  async _discoverCommands() {
    return [];
  }

  // Called by subclasses on a health-check interval to emit sleeve:health
  // (Amendment 3.1 — periodic health event, not only on failure)
  async _emitHealth(latencyMs = null, detail = null) {
    const manifest = this.constructor.MANIFEST;
    const external = manifest?.external ?? {};
    this._emit("sleeve:health", {
      ...this._base(manifest, external),
      healthy:   this._healthy,
      latencyMs: latencyMs ?? null,
      detail:    detail ?? null
    });
  }

  // ── Normalization ──────────────────────────────────────────────

  _normalize(raw) {
    if (raw === null || raw === undefined) {
      return { ok: false, error: "External system returned empty response" };
    }
    if (typeof raw === "object" && "ok" in raw) return raw;
    if (typeof raw === "string") return { ok: true, data: { text: raw } };
    return { ok: true, data: raw };
  }

  _fail(message) {
    return { ok: false, error: message };
  }

  // ── Utilities ──────────────────────────────────────────────────

  // Canonical base fields required on every telemetry event (Amendment 3.1).
  // Amendment 4.1: transport uses _activeTransport so telemetry reflects
  // the transport actually in use, not only the MANIFEST declaration.
  _base(manifest, external) {
    return {
      moduleId:  manifest.id,
      system:    external.system ?? "unknown",
      transport: this._activeTransport ?? external.transport ?? "unknown",
      timestamp: new Date().toISOString(),
      _sdoa:     TELEMETRY_VERSION
    };
  }

  _emit(eventName, payload) {
    try {
      const bus = this._registry?.get?.("EventBus.service");
      bus?.emit?.(eventName, payload);
    } catch (_) {}
  }
}

// Prototype mixins — see file header for why this split uses
// Object.assign onto SleeveBase.prototype rather than composed helper
// instances (subclass-override hooks must stay on SleeveBase's own
// prototype chain).
Object.assign(
  SleeveBase.prototype,
  SleeveTransportNegotiation.mixin,
  SleeveSandbox.mixin,
  SleeveModelTraining.mixin,
  SleeveBoundaryBatching.mixin
);

module.exports = SleeveBase;
