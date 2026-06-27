// ──────────────────────────────────────────────────────────────────
// File:    SleeveBase.module.js
// Version: 1.0.0
// Updated: 2026-06-27T00:00:00Z
// Changes: Phase 5 Track C — canonical lifecycle contract for all
//          Sleeve sovereigns. Extend this class and override
//          _callExternal(command, payload). The base enforces:
//            init()    → resolve path via PathResolver + health check
//            run()     → validate command, call external, normalize,
//                        emit boundary telemetry to Triage
//            dispose() → close connections, emit sleeve:disposed
// ──────────────────────────────────────────────────────────────────
"use strict";

class SleeveBase {
  static MANIFEST = {
    id:              "SleeveBase.module",
    type:            "sleeve",
    layer:           3,
    runtime:         "NodeJS",
    version:         "1.0.0",
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
      commands: {},
      events: {
        "sleeve:disposed": {
          payload: { moduleId: "string" }
        },
        "sleeve:healthCheckFailed": {
          payload: { moduleId: "string", system: "string", error: "string" }
        },
        "sleeve:boundaryCall": {
          payload: { moduleId: "string", command: "string", durationMs: "number", ok: "boolean" }
        }
      },
      accepts: {},
      slots:   {}
    },
    docs: {
      description: "Abstract base class for all SDOA v5.4 Sleeve sovereigns. Enforces the canonical lifecycle contract: path resolution via PathResolver, command validation against external.commands, ResponseFormatter normalization, and Triage telemetry emission.",
      author: "ProtoAI Core Architecture Group",
      sdoa:   "5.4"
    }
  };

  _registry     = null;
  _formatter    = null;
  _pathResolver = null;
  _triage       = null;
  _resolvedPath = null;
  _healthy      = false;

  // ── Lifecycle ──────────────────────────────────────────────────

  async init(registry) {
    this._registry     = registry;
    this._formatter    = registry.get("ResponseFormatter.service");
    this._pathResolver = registry.get("PathResolver.service");
    this._triage       = registry.get("Triage.workflow");

    // Resolve the external path via PathResolver — never raw strings
    const manifest = this.constructor.MANIFEST;
    const external = manifest?.external ?? {};

    if (external.path && external.path !== "auto") {
      this._resolvedPath = this._pathResolver?.resolve?.(external.path) ?? external.path;
    }

    // Optional health check — subclasses override _healthCheck()
    try {
      await this._healthCheck();
      this._healthy = true;
    } catch (err) {
      this._healthy = false;
      this._emit("sleeve:healthCheckFailed", {
        moduleId: manifest.id,
        system:   external.system ?? "unknown",
        error:    err.message
      });
      // Non-fatal: sleeve registers but marks unhealthy
    }
  }

  // run() enforces the full sleeve contract:
  //   1. Validate command ∈ external.commands
  //   2. Delegate to _callExternal() (subclass implements)
  //   3. Normalize response via ResponseFormatter
  //   4. Emit boundary telemetry to Triage
  async run({ command, payload } = {}) {
    const manifest = this.constructor.MANIFEST;
    const external = manifest?.external ?? {};
    const allowed  = external.commands ?? [];

    if (!command) {
      return this._fail("run: command is required");
    }

    if (allowed.length > 0 && !allowed.includes(command)) {
      return this._fail(
        `${manifest.id}: command "${command}" is not in external.commands [${allowed.join(", ")}]`
      );
    }

    const t0 = Date.now();
    let result;

    try {
      const raw = await this._callExternal(command, payload ?? {});
      result    = this._normalize(raw);
    } catch (err) {
      result = this._fail(err.message);
    }

    const durationMs = Date.now() - t0;

    // Emit boundary telemetry to Triage
    this._emit("sleeve:boundaryCall", {
      moduleId:  manifest.id,
      command,
      durationMs,
      ok: result.ok ?? false
    });

    // Notify Pulse if available (for latency tracking)
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

    // Subclass cleanup
    try { await this._teardown(); } catch (_) {}

    this._emit("sleeve:disposed", { moduleId: manifest.id });

    this._registry     = null;
    this._formatter    = null;
    this._pathResolver = null;
    this._triage       = null;
    this._resolvedPath = null;
    this._healthy      = false;
  }

  // ── Subclass contract ──────────────────────────────────────────

  // Override: perform the actual external system call.
  // Must return a value that _normalize() can process.
  async _callExternal(command, payload) {
    throw new Error(`${this.constructor.name}: _callExternal() not implemented`);
  }

  // Override: verify external system is reachable.
  // Throw to mark sleeve as unhealthy.
  async _healthCheck() {}

  // Override: clean up resources (close sockets, kill processes, etc.)
  async _teardown() {}

  // ── Normalization ──────────────────────────────────────────────

  // Normalize any external response to { ok, data } or { ok: false, error }
  _normalize(raw) {
    if (raw === null || raw === undefined) {
      return { ok: false, error: "External system returned empty response" };
    }
    // Already normalized
    if (typeof raw === "object" && "ok" in raw) return raw;
    // Plain string — wrap as data
    if (typeof raw === "string") return { ok: true, data: { text: raw } };
    // Any other value — wrap
    return { ok: true, data: raw };
  }

  _fail(message) {
    return { ok: false, error: message };
  }

  // ── Utilities ──────────────────────────────────────────────────

  _emit(eventName, payload) {
    try {
      const bus = this._registry?.get?.("EventBus.service");
      bus?.emit?.(eventName, payload);
    } catch (_) {}
  }
}

module.exports = SleeveBase;
