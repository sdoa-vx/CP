// ──────────────────────────────────────────────────────────────────
// File:    Captain.service.js
// Version: 5.0.1
// Updated: 2026-07-13T00:00:00Z
// Changes: SDOA manifest-compliance pass — added capabilities,
//          dependencies, and last_modified fields.
// ──────────────────────────────────────────────────────────────────
// Last modified: 2026-07-13 00:00 UTC
// Captain.service.js — SDOA v5.0 Service (Universal)

"use strict";

class CaptainService {
  static MANIFEST = {
    // ── Identity ──────────────────────────────
    id:              "Captain.service",
    type:            "service",
    layer:           3,
    runtime:         "Universal",
    version:         "5.0.1",
    operationalRole: "captain",

    // ── Dependencies ──────────────────────────
    requires:  [
      "Chronicle.service",
      "Router.service",
      "Oracle.service",
      "ResponseFormatter.service"
    ],
    capabilities: [
      "boot:sequenceOrchestration",
      "module:lifecycleInit",
      "module:isolation",
      "fallback:protocols",
      "error:globalContainment"
    ],
    dependencies: [
      "Chronicle.service",
      "Router.service",
      "Oracle.service",
      "ResponseFormatter.service"
    ],
    dataFiles: [],

    // ── Lifecycle ─────────────────────────────
    lifecycle: ["init", "run", "dispose"],

    // ── Action Surface ────────────────────────
    actions: {
      commands: {
        run: {
          description: "Execute the full boot sequence. Initializes all registered modules in dependency order.",
          input:  { skipModules: "string[]?", dryRun: "boolean?" },
          output: "object"   // BootReport
        },
        setBackendStatus: {
          description: "Broadcast app:backendStatus to all subscribers.",
          input:  { status: "string", detail: "string?" },
          output: "void"
        },
        getBootReport: {
          description: "Return the most recent boot report.",
          input:  {},
          output: "object"
        },
        isolateModule: {
          description: "Mark a module as isolated — Router will not dispatch to it until cleared.",
          input:  { moduleId: "string", reason: "string?" },
          output: "void"
        },
        clearIsolation: {
          description: "Remove a module from isolation.",
          input:  { moduleId: "string" },
          output: "void"
        },
        triggerFallback: {
          description: "Manually trigger a fallback protocol for a named subsystem.",
          input:  { subsystem: "string" },
          output: "void"
        }
      },
      events: {
        "captain:bootStarted": {
          payload: { moduleCount: "number", bootId: "string" }
        },
        "captain:moduleInitialized": {
          payload: { moduleId: "string", durationMs: "number", order: "number" }
        },
        "captain:moduleInitFailed": {
          payload: { moduleId: "string", error: "string", isolated: "boolean" }
        },
        "captain:bootCompleted": {
          payload: { bootId: "string", succeeded: "number", failed: "number", durationMs: "number" }
        },
        "captain:errorContained": {
          payload: { source: "string", error: "string", type: "string" }
        },
        "captain:moduleIsolated": {
          payload: { moduleId: "string", reason: "string" }
        },
        "captain:fallbackTriggered": {
          payload: { subsystem: "string" }
        }
      },
      accepts: {
        "sentinel:stormDetected":        { description: "Triggers rate-limiting fallback." },
        "sentinel:circularLoopDetected": { description: "Triggers Conductor intervention." },
        "chronicle:chainTampered":       { description: "Triggers security lockdown protocol." },
        "scaffold:moduleGenerated":      { description: "Triggers incremental init of new module." }
      },
      slots: {}
    },

    docs: {
      description: "System State Sovereign. Owns the boot sequence, Chronicle wiring into StateStore and EventBus, the app:backendStatus signal, global error containment, and fallback protocols.",
      author: "ProtoAI Core Architecture Group",
      sdoa:   "5.0.0"
    },
    last_modified: "2026-07-13T00:00:00Z"
  };

  // ── Boot order tiers ───────────────────────────────────────────
  static BOOT_TIERS = {
    "captain":          0,
    "registrar":        1,
    "conductor":        2,
    "oracle":           3,
    "sentinel":         4,
    "assembly-line":    5,
    "triage":           6,
    "coach":            7,
    "probation-officer":8,
    "savant":           20,
    "unknown":          50
  };

  // ── Private State ─────────────────────────────────────────────
  _registry       = null;
  _chronicle      = null;
  _sentinel       = null;
  _conductor      = null;
  _registrar      = null;
  _stateStore     = null;
  _busUnsub       = [];
  _errorHandlers  = [];
  _bootSeq        = 0;
  _lastBootReport = null;
  _backendStatus  = "connecting";
  _isolated       = new Set();

  // ── Lifecycle ──────────────────────────────────────────────────

  async init(registry) {
    this._registry  = registry;
    this._chronicle = registry.get("Chronicle.service");
    this._installErrorContainment();
    this._chronicle?.record({
      type: "captain:init", source: "Captain.service",
      payload: { timestamp: new Date().toISOString() }
    });
  }

  async run(payload) {
    const { skipModules = [], dryRun = false } = payload ?? {};
    const bootId = `boot-${++this._bootSeq}-${Date.now()}`;
    const t0     = Date.now();

    this.setBackendStatus("connecting", "Boot sequence starting…");

    this._sentinel  = this._registry.get("Sentinel.service");
    this._conductor = this._registry.get("Conductor.service");
    this._registrar = this._registry.get("Registrar.service");
    this._stateStore = this._registry.get("StateStore.service")
                    ?? this._registry.get("StateStore.adapter");

    const plan = this._buildBootPlan(skipModules);

    this._emit("captain:bootStarted", { moduleCount: plan.length, bootId });
    this._chronicle?.record({
      type: "captain:bootStarted", source: "Captain.service",
      payload: { bootId, moduleCount: plan.length }
    });

    if (dryRun) {
      return { bootId, plan, dryRun: true };
    }

    let succeeded = 0, failed = 0;

    for (const [order, entry] of plan.entries()) {
      const { moduleId, module } = entry;
      if (this._isolated.has(moduleId)) continue;

      const mt0 = Date.now();
      try {
        if (typeof module.init === "function" && !module._captainInitialized) {
          await module.init(this._registry);
          module._captainInitialized = true;
        }
        const durationMs = Date.now() - mt0;
        succeeded++;

        this._emit("captain:moduleInitialized", { moduleId, durationMs, order });
        this._chronicle?.record({
          type: "captain:moduleInitialized", source: "Captain.service",
          payload: { moduleId, durationMs, order }
        });
      } catch (err) {
        failed++;
        this._handleModuleInitFailure(moduleId, err);
      }
    }

    this._wireChronicle();
    this._subscribeEventBus();
    await this._startSovereignServices();

    const durationMs = Date.now() - t0;
    const report = {
      bootId, succeeded, failed, durationMs,
      isolatedModules: [...this._isolated],
      completedAt: new Date().toISOString()
    };

    this._lastBootReport = report;

    this._emit("captain:bootCompleted", { bootId, succeeded, failed, durationMs });
    this._chronicle?.record({
      type: "captain:bootCompleted", source: "Captain.service",
      payload: report
    });

    this.setBackendStatus(
      failed > 0 ? "degraded" : "ready",
      failed > 0 ? `${failed} module(s) failed` : `${succeeded} modules ready`
    );

    return report;
  }

  async dispose() {
    this._removeErrorContainment();
    this._unsubscribeEventBus();
    this._stateStore = null;
    this._chronicle  = null;
  }

  // ── Public Commands ────────────────────────────────────────────

  setBackendStatus(status, detail = null) {
    this._backendStatus = status;
    this._emit("app:backendStatus", { status, detail });
    this._emit("app:sovereignStatus", {
      sovereignId: "captain",
      status: status === "ready" ? "ready" : status === "connecting" ? "unknown" : "warning",
      detail
    });
  }

  getBootReport() { return this._lastBootReport; }

  isolateModule({ moduleId, reason = null }) {
    this._isolated.add(moduleId);
    this._emit("captain:moduleIsolated", { moduleId, reason: reason ?? "manual isolation" });
    this._chronicle?.record({
      type: "captain:moduleIsolated", source: "Captain.service",
      payload: { moduleId, reason }
    });
  }

  clearIsolation({ moduleId }) {
    this._isolated.delete(moduleId);
    this._emit("app:sovereignStatus", { sovereignId: "captain", status: "ready" });
  }

  triggerFallback({ subsystem }) {
    const fallbacks = {
      chronicle:  () => this._fallbackChronicle(),
      statestore: () => this._fallbackStateStore(),
      router:     () => this._fallbackRouter(),
      eventbus:   () => this._fallbackEventBus()
    };
    const fn = fallbacks[subsystem?.toLowerCase()];
    if (fn) fn();
    this._emit("captain:fallbackTriggered", { subsystem });
  }

  // ── Boot Plan ──────────────────────────────────────────────────

  _buildBootPlan(skipModules) {
    const skip = new Set(skipModules ?? []);
    const all  = typeof this._registry.getAll === "function"
      ? this._registry.getAll()
      : Object.values(this._registry._modules ?? {});

    return all
      .filter(mod => {
        const id = mod?.MANIFEST?.id ?? mod?.id;
        return id && !skip.has(id) && typeof mod.init === "function";
      })
      .map(mod => {
        const manifest = mod?.MANIFEST ?? {};
        const role     = manifest.operationalRole ?? "unknown";
        const tier     = CaptainService.BOOT_TIERS[role] ?? CaptainService.BOOT_TIERS.unknown;
        return { moduleId: manifest.id, module: mod, tier };
      })
      .sort((a, b) => a.tier !== b.tier
        ? a.tier - b.tier
        : a.moduleId.localeCompare(b.moduleId)
      );
  }

  _handleModuleInitFailure(moduleId, err) {
    const manifest = this._registry.get(moduleId)?.MANIFEST;
    const isSovereign = manifest?.operationalRole &&
      manifest.operationalRole !== "savant" &&
      manifest.operationalRole !== "unknown";

    this._emit("captain:moduleInitFailed", {
      moduleId, error: err.message, isolated: !isSovereign
    });
    this._chronicle?.record({
      type: "captain:moduleInitFailed", source: "Captain.service",
      payload: { moduleId, error: err.message }
    });

    if (!isSovereign) {
      this.isolateModule({ moduleId, reason: `init() threw: ${err.message}` });
    } else {
      this.triggerFallback({ subsystem: moduleId.split(".")[0].toLowerCase() });
    }
  }

  // ── Chronicle Wiring ───────────────────────────────────────────

  _wireChronicle() {
    if (!this._chronicle) return;

    const store = this._stateStore;
    if (store && typeof store.watch === "function") {
      const keys = ["currentWorkspace","currentProfile","backendStatus",
                    "attachedFiles","settings","policy","workspaces"];
      keys.forEach(key => {
        store.watch(key, (newValue) => {
          this._chronicle.recordMutation(key, undefined, newValue, "StateStore");
        });
      });
    }

    const bus = this._getBus();
    if (bus?.onAny) {
      const chronicleAll = (eventName, payload) => {
        if (eventName.startsWith("chronicle:")) return;
        this._chronicle.recordEvent(eventName, payload ?? {}, "EventBus");
      };
      bus.onAny(chronicleAll);
      this._busUnsub.push(() => bus.offAny?.(chronicleAll));
    }
  }

  // ── Sovereign Service Startup ──────────────────────────────────

  async _startSovereignServices() {
    const startOrder = [
      "Router.service",
      "Oracle.service",
      "Sentinel.service",
      "Conductor.service",
      "Registrar.service",
      "Triage.workflow",
      "Pulse.workflow"
    ];

    for (const id of startOrder) {
      const svc = this._registry.get(id);
      if (svc && typeof svc.run === "function" && !svc._captainStarted) {
        try {
          await svc.run({});
          svc._captainStarted = true;
        } catch (err) {
          this._handleModuleInitFailure(id, err);
        }
      }
    }
  }

  // ── Fallback Protocols ─────────────────────────────────────────

  _fallbackChronicle() {
    this._chronicle = {
      record: () => {}, recordEvent: () => {},
      recordMutation: () => {}, recordCommand: () => {}
    };
  }

  _fallbackStateStore() {
    const mem = new Map();
    this._stateStore = {
      get: (k) => mem.get(k),
      set: (k, v) => mem.set(k, v),
      watch: () => {}
    };
  }

  _fallbackRouter() {
    this.setBackendStatus("degraded", "Router unavailable — dispatch suspended");
  }

  _fallbackEventBus() {
    this.setBackendStatus("degraded", "EventBus unavailable");
  }

  // ── Global Error Containment ───────────────────────────────────

  _installErrorContainment() {
    if (typeof process === "undefined") return;

    const onUncaught = (err) => {
      this._containError("uncaughtException", err?.message ?? String(err), err?.stack);
    };
    const onRejection = (reason) => {
      this._containError("unhandledRejection", reason?.message ?? String(reason));
    };

    process.on("uncaughtException",  onUncaught);
    process.on("unhandledRejection", onRejection);

    this._errorHandlers = [
      () => process.off("uncaughtException",  onUncaught),
      () => process.off("unhandledRejection", onRejection)
    ];
  }

  _removeErrorContainment() {
    this._errorHandlers.forEach(fn => fn());
    this._errorHandlers = [];
  }

  _containError(type, message, stack = null) {
    this._chronicle?.record({
      type: `captain:${type}`, source: "Captain.service",
      payload: { message, stack }
    });
    this._emit("captain:errorContained", { source: type, error: message, type });
    this._sentinel && this._emit("sentinel:externalError", { type, message });
    this._emit("app:sovereignStatus", {
      sovereignId: "captain",
      status: "warning",
      detail: `${type}: ${message.slice(0, 60)}`
    });
  }

  // ── EventBus Subscriptions ─────────────────────────────────────

  _subscribeEventBus() {
    const bus = this._getBus();
    if (!bus) return;

    const handlers = {
      "sentinel:stormDetected":        ({ eventName }) =>
        this._emit("conductor:suppressEvent", { eventName, durationMs: 5000 }),
      "sentinel:circularLoopDetected": ({ chain }) =>
        this._emit("conductor:breakChain", { chain }),
      "chronicle:chainTampered":       ({ failedAtId }) => {
        this.setBackendStatus("error", "Chronicle chain tampered — security lockdown");
        this._chronicle?.record({
          type: "captain:securityLockdown", source: "Captain.service",
          payload: { failedAtId }
        });
      },
      "scaffold:moduleGenerated":      async ({ portfolioPath }) => {
        const id = require("path").basename(portfolioPath, ".js");
        const mod = this._registry?.get?.(id);
        if (mod && !mod._captainInitialized) {
          try {
            await mod.init(this._registry);
            mod._captainInitialized = true;
          } catch (err) {
            this._handleModuleInitFailure(id, err);
          }
        }
      }
    };

    for (const [event, handler] of Object.entries(handlers)) {
      bus.on(event, handler);
      this._busUnsub.push(() => bus.off?.(event, handler));
    }
  }

  _unsubscribeEventBus() {
    this._busUnsub.forEach(fn => fn());
    this._busUnsub = [];
  }

  _getBus() {
    return this._registry?.get?.("EventBus.service")
        ?? (typeof window !== "undefined" ? window.EventBus : null);
  }

  _emit(eventName, payload) {
    try { this._getBus()?.emit?.(eventName, payload); } catch (_) {}
  }
}

module.exports = CaptainService;
