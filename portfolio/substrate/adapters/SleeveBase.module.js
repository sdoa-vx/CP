// ──────────────────────────────────────────────────────────────────
// File:    SleeveBase.module.js
// Version: 1.4.0
// Updated: 2026-06-28T00:00:00Z
// Changes: Amendment 3.5 — Sleeve Sandbox Mode.
//          enterSandbox({ fixtures? }) — intercepts _callExternal(); real
//            external system is never contacted while sandbox is active.
//          exitSandbox() — restores normal operation.
//          injectFixture(command, response|fn) — add/update a fixture;
//            fn(command, payload) form enables dynamic/stateful responses.
//          replayFromChronicle({ since? }) — loads Chronicle
//            sleeve:boundaryCall history as ordered queues and enters
//            replay+sandbox mode. Each command's queue dequeues in
//            arrival order; exhausted queue → synthetic error.
//          run() in sandbox mode emits sleeve:sandboxRun (NOT
//            sleeve:boundaryCall) — Triage, Cartographer, Pulse never
//            see synthetic data. Chronicle receives sandboxRun entries
//            tagged { sandbox: true, replay: boolean }.
// Previous: Amendment 3.3 — Model Capability Drift.
//          sleeve:modelInfo event added for AI model sleeves.
//          _emitModelInfo(modelVersion, modelHash, capabilities) helper
//          lets model sleeves report version/hash after init so
//          Cartographer.modelDrift() can detect version drift.
// Previous: Amendment 3.2 — Sleeve Auto-Discovery.
//          runDiscovery() probes the external system via _discoverCommands(),
//          computes undeclared commands, and emits sleeve:commandDiscovered.
//          Coach receives the event and routes a manifest amendment through
//          ProbationOfficer → Registrar.fieldChampion(). Sleeves cannot
//          self-approve: discovery is a proposal, not a write.
// Previous: Amendment 3.1 — Boundary Telemetry Standardization (v5.5)
//          All six canonical sleeve events now emit the full base field
//          set (moduleId, system, transport, timestamp, _sdoa: "5.5").
//          New events: sleeve:init, sleeve:run, sleeve:boundaryFault,
//          sleeve:health (periodic). sleeve:healthCheckFailed removed
//          (superseded by sleeve:init + sleeve:health). correlationId
//          links sleeve:run → sleeve:boundaryCall / sleeve:boundaryFault.
// ──────────────────────────────────────────────────────────────────
"use strict";

const { randomUUID } = require("crypto");

const TELEMETRY_VERSION = "5.5";

class SleeveBase {
  static MANIFEST = {
    id:              "SleeveBase.module",
    type:            "sleeve",
    layer:           3,
    runtime:         "NodeJS",
    version:         "1.4.0",
    operationalRole: "savant",
    requires:        ["ResponseFormatter.service", "PathResolver.service"],
    external: {
      system:    "__base__",
      transport: "__base__",
      path:      "auto",
      commands:  []
    },
    lifecycle: ["init", "run", "dispose"],
    actions: {
      commands: {
        discover: {
          description: "Amendment 3.2 — probe the external system for available commands and emit sleeve:commandDiscovered if any are undeclared. Proposal only; Coach routes through ProbationOfficer before any manifest change.",
          input: {},
          output: "Promise<{ proposalId: string|null, undeclaredCommands: string[] }>"
        },
        enterSandbox: {
          description: "Amendment 3.5 — switch the sleeve into sandbox mode. All subsequent run() calls return fixture responses without contacting the external system. Emits sleeve:sandboxRun instead of sleeve:boundaryCall so downstream telemetry consumers (Triage, Cartographer, Pulse) never receive synthetic data.",
          input: { fixtures: "Record<string, any>?" },
          output: "{ ok: true }"
        },
        exitSandbox: {
          description: "Amendment 3.5 — restore the sleeve to normal operation. Clears all fixtures and disables sandbox intercept.",
          input: {},
          output: "{ ok: true }"
        },
        injectFixture: {
          description: "Amendment 3.5 — add or replace a fixture for a command. Value may be a static response object or a function fn(command, payload) => response for dynamic/stateful scenarios. Use '*' as command key for a catch-all wildcard.",
          input: { command: "string", response: "any" },
          output: "{ ok: true }"
        },
        replayFromChronicle: {
          description: "Amendment 3.5 — load Chronicle sleeve:boundaryCall history for this sleeve as ordered replay queues and enter replay+sandbox mode. Each command queue dequeues in arrival order; an exhausted queue returns a synthetic error. Call exitSandbox() to return to real operation.",
          input: { since: "string?" },
          output: "{ ok: boolean, fixtures: number }"
        }
      },
      events: {
        "sleeve:init": {
          payload: { moduleId: "string", system: "string", transport: "string", timestamp: "string", healthy: "boolean", resolvedPath: "string|null", _sdoa: "string" }
        },
        "sleeve:run": {
          payload: { moduleId: "string", system: "string", transport: "string", timestamp: "string", command: "string", correlationId: "string", _sdoa: "string" }
        },
        "sleeve:boundaryCall": {
          payload: { moduleId: "string", system: "string", transport: "string", timestamp: "string", command: "string", durationMs: "number", ok: "boolean", correlationId: "string", _sdoa: "string" }
        },
        "sleeve:boundaryFault": {
          payload: { moduleId: "string", system: "string", transport: "string", timestamp: "string", command: "string", durationMs: "number", error: "string", correlationId: "string", _sdoa: "string" }
        },
        "sleeve:health": {
          payload: { moduleId: "string", system: "string", transport: "string", timestamp: "string", healthy: "boolean", latencyMs: "number|null", detail: "string|null", _sdoa: "string" }
        },
        "sleeve:disposed": {
          payload: { moduleId: "string", system: "string", transport: "string", timestamp: "string", reason: "string|null", _sdoa: "string" }
        },
        "sleeve:modelInfo": {
          payload: { moduleId: "string", system: "string", transport: "string", timestamp: "string", modelVersion: "string|null", modelHash: "string|null", declaredCapabilities: "string[]", _sdoa: "string" }
        },
        "sleeve:commandDiscovered": {
          payload: { moduleId: "string", system: "string", transport: "string", timestamp: "string", currentCommands: "string[]", discoveredCommands: "string[]", undeclaredCommands: "string[]", proposalId: "string", _sdoa: "string" }
        },
        "sleeve:sandboxRun": {
          payload: { moduleId: "string", system: "string", transport: "string", timestamp: "string", command: "string", durationMs: "number", ok: "boolean", replay: "boolean", fixtureKey: "string|null", _sdoa: "string" }
        }
      },
      accepts: {},
      slots:   {}
    },
    docs: {
      description: "Abstract base class for all SDOA v5.5 Sleeve sovereigns. Enforces the canonical lifecycle contract and Amendment 3.1 telemetry standard.",
      author: "ProtoAI Core Architecture Group",
      sdoa:   "5.5"
    }
  };

  _registry     = null;
  _formatter    = null;
  _pathResolver = null;
  _triage       = null;
  _resolvedPath = null;
  _healthy      = false;

  // Amendment 3.5 — sandbox state
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

    try {
      await this._healthCheck();
      this._healthy = true;
    } catch (err) {
      this._healthy = false;
    }

    // sleeve:init — always emitted, healthy or not (Amendment 3.1)
    this._emit("sleeve:init", {
      ...this._base(manifest, external),
      healthy:      this._healthy,
      resolvedPath: this._resolvedPath ?? null
    });
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

    const correlationId = randomUUID();

    // sleeve:run — pre-call trace (Amendment 3.1)
    this._emit("sleeve:run", { ...base, command, correlationId });

    const t0 = Date.now();
    let result;

    try {
      const raw = await this._callExternal(command, payload ?? {});
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
    this._triage       = null;
    this._resolvedPath = null;
    this._healthy      = false;
    // Amendment 3.5: always exit sandbox on dispose — no leaked intercept
    this._sandboxMode  = false;
    this._replayMode   = false;
    this._fixtures.clear();
  }

  // ── Subclass contract ──────────────────────────────────────────

  async _callExternal(command, payload) {
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

  // ── Amendment 3.5 — Sleeve Sandbox Mode ───────────────────────

  // Switch the sleeve into sandbox mode. All run() calls will hit
  // _runSandbox() instead of _callExternal(). Optional fixtures map
  // (command → response|fn) pre-seeds the fixture table.
  enterSandbox({ fixtures } = {}) {
    this._sandboxMode = true;
    this._replayMode  = false;
    this._fixtures.clear();
    if (fixtures && typeof fixtures === "object") {
      for (const [cmd, resp] of Object.entries(fixtures)) {
        this._fixtures.set(cmd, resp);
      }
    }
    return { ok: true };
  }

  // Restore real operation and clear all fixtures.
  exitSandbox() {
    this._sandboxMode = false;
    this._replayMode  = false;
    this._fixtures.clear();
    return { ok: true };
  }

  // Add or replace a single fixture. Use command="*" for a wildcard
  // that matches any command not otherwise registered.
  // Value may be a static response object or fn(command, payload) for
  // dynamic / stateful responses.
  injectFixture(command, response) {
    this._fixtures.set(command, response);
    return { ok: true };
  }

  // Load Chronicle sleeve:boundaryCall history for this sleeve as
  // ordered per-command queues, then enter replay+sandbox mode.
  // Each queue dequeues in arrival order (oldest first); an exhausted
  // queue returns a synthetic error rather than blocking.
  async replayFromChronicle({ since } = {}) {
    const chronicle = this._registry?.get?.("Chronicle.service");
    if (!chronicle?.query) return { ok: false, fixtures: 0 };

    const manifest = this.constructor.MANIFEST;
    const sinceMs  = since ? new Date(since).getTime() : 0;

    const entries = (chronicle.query({ type: "sleeve:boundaryCall" }) ?? [])
      .filter(e => e.payload?.moduleId === manifest.id)
      .filter(e => new Date(e.payload?.timestamp ?? e.recordedAt ?? 0).getTime() >= sinceMs)
      .sort((a, b) => new Date(a.payload?.timestamp ?? 0) - new Date(b.payload?.timestamp ?? 0));

    const queues = {};
    for (const entry of entries) {
      const cmd = entry.payload?.command;
      if (!cmd) continue;
      if (!queues[cmd]) queues[cmd] = [];
      queues[cmd].push(
        entry.payload?.ok !== false
          ? { ok: true,  data:  { replay: true, originalTimestamp: entry.payload?.timestamp } }
          : { ok: false, error: "[replay] original call returned error" }
      );
    }

    this._fixtures.clear();
    let count = 0;
    for (const [cmd, queue] of Object.entries(queues)) {
      // Closure captures queue by reference — dequeues in order
      const q = queue;
      this._fixtures.set(cmd, () =>
        q.length > 0 ? q.shift() : { ok: false, error: `[replay] queue for "${cmd}" exhausted` }
      );
      count += q.length;
    }

    this._sandboxMode = true;
    this._replayMode  = true;
    return { ok: true, fixtures: count };
  }

  // Internal: execute a run() in sandbox mode.
  // Emits sleeve:sandboxRun (NOT sleeve:boundaryCall) — intentional.
  async _runSandbox(command, payload) {
    const manifest   = this.constructor.MANIFEST;
    const external   = manifest?.external ?? {};
    const base       = this._base(manifest, external);
    const t0         = Date.now();

    // Fixture lookup: exact command match, then wildcard
    const fixtureKey = this._fixtures.has(command) ? command
                     : this._fixtures.has("*")     ? "*"
                     :                               null;
    const fixture    = fixtureKey !== null ? this._fixtures.get(fixtureKey) : undefined;

    let result;
    if (fixture === undefined) {
      result = { ok: false, error: `[sandbox] No fixture registered for command "${command}"` };
    } else if (typeof fixture === "function") {
      try   { result = this._normalize(await fixture(command, payload)); }
      catch (err) { result = this._fail(`[sandbox] fixture threw: ${err.message}`); }
    } else {
      result = this._normalize(fixture);
    }

    const durationMs = Date.now() - t0;

    // sleeve:sandboxRun — Chronicle only; NOT consumed by Triage/Cartographer/Pulse
    this._emit("sleeve:sandboxRun", {
      ...base,
      command,
      durationMs,
      ok:         result.ok ?? false,
      replay:     this._replayMode,
      fixtureKey: fixtureKey ?? null
    });

    return result;
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

  // Canonical base fields required on every telemetry event (Amendment 3.1)
  _base(manifest, external) {
    return {
      moduleId:  manifest.id,
      system:    external.system    ?? "unknown",
      transport: external.transport ?? "unknown",
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

module.exports = SleeveBase;
