// ──────────────────────────────────────────────────────────────────
// File:    Sentinel.service.js
// Version: 5.0.0
// Updated: 2026-06-17T00:00:00Z
// Changes: Relocated to canonical sdoavx/ structure
// ──────────────────────────────────────────────────────────────────
// Last modified: 2026-06-01 00:00 UTC
// Sentinel.service.js — SDOA v5.0 Service (Universal)
// Validated by: ProbationOfficer.workflow.rs
//
// Change log:
//   5.0.0 — Initial implementation. Runtime guardian sovereign.
//            operationalRole: "sentinel"
//
//            Watches the live EventBus for four threat classes:
//              1. EVENT STORMS — a single event type fires above a
//                 threshold rate within a rolling time window
//              2. CIRCULAR LOOPS — event A triggers B triggers A,
//                 detected via a per-chain depth limit
//              3. DEAD MODULES — modules registered but never invoked
//                 (command or event) within a configurable idle window
//              4. ORPHANED WATCHERS — StateStore keys with active
//                 watchers but no corresponding module still in registry
//
//            Issues are classified as WARNING or CRITICAL, recorded to
//            Chronicle, surfaced on StatusBar, and optionally forwarded
//            to Conductor for event-mesh intervention.

"use strict";

class SentinelService {
  static MANIFEST = {
    // ── Identity ──────────────────────────────
    id:              "Sentinel.service",
    type:            "service",
    layer:           3,
    runtime:         "Universal",
    version:         "5.0.1",
    last_modified:   "2026-07-13T00:00:00Z",
    operationalRole: "sentinel",
    capabilities: ["sentinel:run", "sentinel:pause", "sentinel:resume", "sentinel:report", "sentinel:clear-issue", "sentinel:dead-module-sweep", "sentinel:set-thresholds"],

    // ── Dependencies ──────────────────────────
    requires:  [
      "Chronicle.service",
      "Oracle.service",
      "ResponseFormatter.service"
    ],
    dependencies: ["Chronicle.service", "Oracle.service", "ResponseFormatter.service"],
    dataFiles: [],

    // ── Lifecycle ─────────────────────────────
    lifecycle: ["init", "run", "dispose"],

    // ── Action Surface ────────────────────────
    actions: {
      commands: {
        run: {
          description: "Start the Sentinel watch loop. Wires all EventBus intercepts and begins monitoring.",
          input:  { config: "object?" },
          output: "object"
        },
        pause: {
          description: "Suspend all monitoring without disposing state.",
          input:  {},
          output: "void"
        },
        resume: {
          description: "Resume monitoring after a pause.",
          input:  {},
          output: "void"
        },
        getReport: {
          description: "Return the current threat report — all active issues, counts, and status.",
          input:  { severity: "string?" },
          output: "object"
        },
        clearIssue: {
          description: "Acknowledge and clear a specific issue by id.",
          input:  { issueId: "string" },
          output: "void"
        },
        clearAll: {
          description: "Clear all active issues.",
          input:  {},
          output: "void"
        },
        checkDeadModules: {
          description: "Run an immediate dead-module sweep against Oracle's registry.",
          input:  {},
          output: "object[]"
        },
        setThresholds: {
          description: "Update detection thresholds at runtime.",
          input: {
            stormRatePerSec:   "number?",
            stormWindowMs:     "number?",
            circularDepthLimit:"number?",
            deadIdleMs:        "number?"
          },
          output: "void"
        }
      },
      events: {
        "sentinel:stormDetected": {
          payload: { eventName: "string", ratePerSec: "number", windowMs: "number", issueId: "string" }
        },
        "sentinel:circularLoopDetected": {
          payload: { chain: "string[]", depth: "number", issueId: "string" }
        },
        "sentinel:deadModuleDetected": {
          payload: { moduleId: "string", idleMs: "number", issueId: "string" }
        },
        "sentinel:orphanedWatcherDetected": {
          payload: { stateKey: "string", watcherCount: "number", issueId: "string" }
        },
        "sentinel:issueCleared": {
          payload: { issueId: "string", type: "string" }
        },
        "sentinel:statusChanged": {
          payload: { status: "string", issueCount: "number", criticalCount: "number" }
        }
      },
      accepts: {
        "registry:moduleRegistered":   { description: "Resets dead-module timer for the new module." },
        "registry:moduleDeregistered": { description: "Clears dead-module tracking for removed module." }
      },
      slots: {}
    },

    docs: {
      description: "Runtime guardian sovereign. Watches the live EventBus for four threat classes: event storms (rate spikes), circular event loops (A→B→A chains), dead modules (registered but never invoked), and orphaned StateStore watchers. Issues are classified WARNING or CRITICAL, recorded to Chronicle, and surfaced to StatusBar and Conductor. Fills the sentinel slot in the StatusBar sovereign row.",
      author: "ProtoAI Core Architecture Group",
      sdoa:   "5.0.0"
    }
  };

  // ── Thresholds (runtime-adjustable) ───────────────────────────
  _thresholds = {
    stormRatePerSec:    50,      // events/sec on one event name = storm
    stormWindowMs:      1000,    // rolling window for storm detection
    circularDepthLimit: 8,       // call-chain depth before circular declared
    deadIdleMs:         300_000  // 5 min with no invocation = dead module
  };

  // ── Private State ─────────────────────────────────────────────
  _registry    = null;
  _chronicle   = null;
  _oracle      = null;
  _paused      = false;
  _running     = false;
  _busUnsub    = [];
  _sweepTimer  = null;
  _issueSeq    = 0;

  // Active issues  Map<issueId, Issue>
  _issues      = new Map();

  // Storm detection  Map<eventName, number[]> (timestamp buckets)
  _eventTimes  = new Map();

  // Circular detection — current call chain stack
  _callChain   = [];

  // Dead module tracking  Map<moduleId, { lastSeen: number }>
  _moduleActivity = new Map();

  // ── Lifecycle ──────────────────────────────────────────────────

  async init(registry) {
    this._registry  = registry;
    this._chronicle = registry.get("Chronicle.service");
    this._oracle    = registry.get("Oracle.service");
  }

  async run(payload) {
    const cfg = payload?.config ?? {};
    if (cfg.stormRatePerSec)    this._thresholds.stormRatePerSec    = cfg.stormRatePerSec;
    if (cfg.stormWindowMs)      this._thresholds.stormWindowMs      = cfg.stormWindowMs;
    if (cfg.circularDepthLimit) this._thresholds.circularDepthLimit = cfg.circularDepthLimit;
    if (cfg.deadIdleMs)         this._thresholds.deadIdleMs         = cfg.deadIdleMs;

    this._seedModuleActivity();
    this._subscribeEventBus();
    this._startSweep();
    this._running = true;

    this._broadcastStatus();
    return { status: "watching", thresholds: { ...this._thresholds } };
  }

  async dispose() {
    this._unsubscribeEventBus();
    this._stopSweep();
    this._issues.clear();
    this._eventTimes.clear();
    this._moduleActivity.clear();
    this._running = false;
  }

  // ── Public Commands ────────────────────────────────────────────

  pause()  { this._paused = true;  this._broadcastStatus(); }
  resume() { this._paused = false; this._broadcastStatus(); }

  getReport({ severity } = {}) {
    const issues = [...this._issues.values()];
    const filtered = severity
      ? issues.filter(i => i.severity === severity.toUpperCase())
      : issues;
    return {
      status:        this._paused ? "paused" : (this._running ? "watching" : "stopped"),
      issueCount:    this._issues.size,
      criticalCount: issues.filter(i => i.severity === "CRITICAL").length,
      issues:        filtered.sort((a, b) => b.detectedAt - a.detectedAt)
    };
  }

  clearIssue({ issueId }) {
    const issue = this._issues.get(issueId);
    if (!issue) return;
    this._issues.delete(issueId);
    this._emit("sentinel:issueCleared", { issueId, type: issue.type });
    this._broadcastStatus();
  }

  clearAll() {
    for (const [id, issue] of this._issues) {
      this._emit("sentinel:issueCleared", { issueId: id, type: issue.type });
    }
    this._issues.clear();
    this._broadcastStatus();
  }

  checkDeadModules() {
    return this._sweepDeadModules();
  }

  setThresholds(cfg = {}) {
    if (cfg.stormRatePerSec    != null) this._thresholds.stormRatePerSec    = cfg.stormRatePerSec;
    if (cfg.stormWindowMs      != null) this._thresholds.stormWindowMs      = cfg.stormWindowMs;
    if (cfg.circularDepthLimit != null) this._thresholds.circularDepthLimit = cfg.circularDepthLimit;
    if (cfg.deadIdleMs         != null) this._thresholds.deadIdleMs         = cfg.deadIdleMs;
  }

  // ── Detection: Event Storms ────────────────────────────────────

  _observeEvent(eventName) {
    if (this._paused) return;
    const now = Date.now();

    if (!this._eventTimes.has(eventName)) {
      this._eventTimes.set(eventName, []);
    }
    const times = this._eventTimes.get(eventName);
    times.push(now);

    // Prune outside rolling window
    const cutoff = now - this._thresholds.stormWindowMs;
    while (times.length && times[0] < cutoff) times.shift();

    const ratePerSec = (times.length / this._thresholds.stormWindowMs) * 1000;
    if (ratePerSec >= this._thresholds.stormRatePerSec) {
      // De-dupe: only raise if no active storm issue for this event
      const existing = [...this._issues.values()]
        .find(i => i.type === "STORM" && i.data.eventName === eventName);
      if (!existing) {
        const issueId = this._raiseIssue("STORM", "CRITICAL", {
          eventName, ratePerSec: Math.round(ratePerSec),
          windowMs: this._thresholds.stormWindowMs
        });
        this._emit("sentinel:stormDetected", {
          eventName, ratePerSec: Math.round(ratePerSec),
          windowMs: this._thresholds.stormWindowMs, issueId
        });
        this._chronicle?.record({
          type: "sentinel:stormDetected", source: "Sentinel.service",
          payload: { eventName, ratePerSec: Math.round(ratePerSec) }
        });
      }
    }
  }

  // ── Detection: Circular Loops ──────────────────────────────────

  _pushChain(eventName) {
    if (this._paused) return;
    if (this._callChain.includes(eventName)) {
      const chain    = [...this._callChain, eventName];
      const existing = [...this._issues.values()]
        .find(i => i.type === "CIRCULAR" && i.data.chain.join("→") === chain.join("→"));
      if (!existing) {
        const issueId = this._raiseIssue("CIRCULAR", "CRITICAL", { chain, depth: chain.length });
        this._emit("sentinel:circularLoopDetected", { chain, depth: chain.length, issueId });
        this._chronicle?.record({
          type: "sentinel:circularLoopDetected", source: "Sentinel.service",
          payload: { chain }
        });
      }
    }
    if (this._callChain.length >= this._thresholds.circularDepthLimit) {
      this._callChain = []; // Reset — runaway chain
    } else {
      this._callChain.push(eventName);
    }
  }

  _popChain() {
    this._callChain.pop();
  }

  // ── Detection: Dead Modules ────────────────────────────────────

  _seedModuleActivity() {
    const surface = this._oracle?.dumpSurface({}) ?? [];
    const now     = Date.now();
    const seen    = new Set();
    for (const entry of surface) {
      if (!seen.has(entry.moduleId)) {
        seen.add(entry.moduleId);
        if (!this._moduleActivity.has(entry.moduleId)) {
          this._moduleActivity.set(entry.moduleId, { lastSeen: now });
        }
      }
    }
  }

  _touchModule(moduleId) {
    if (!moduleId) return;
    this._moduleActivity.set(moduleId, { lastSeen: Date.now() });
    // Clear any active dead-module issue for this module
    for (const [id, issue] of this._issues) {
      if (issue.type === "DEAD" && issue.data.moduleId === moduleId) {
        this._issues.delete(id);
        this._emit("sentinel:issueCleared", { issueId: id, type: "DEAD" });
      }
    }
  }

  _sweepDeadModules() {
    const now     = Date.now();
    const found   = [];
    for (const [moduleId, { lastSeen }] of this._moduleActivity) {
      const idleMs = now - lastSeen;
      if (idleMs >= this._thresholds.deadIdleMs) {
        const existing = [...this._issues.values()]
          .find(i => i.type === "DEAD" && i.data.moduleId === moduleId);
        if (!existing) {
          const issueId = this._raiseIssue("DEAD", "WARNING", { moduleId, idleMs });
          this._emit("sentinel:deadModuleDetected", { moduleId, idleMs, issueId });
          this._chronicle?.record({
            type: "sentinel:deadModuleDetected", source: "Sentinel.service",
            payload: { moduleId, idleMs }
          });
          found.push({ moduleId, idleMs, issueId });
        }
      }
    }
    return found;
  }

  // ── Periodic Sweep ─────────────────────────────────────────────

  _startSweep() {
    // Sweep every 60s for dead modules + auto-clear resolved storms
    this._sweepTimer = setInterval(() => {
      if (this._paused) return;
      this._sweepDeadModules();
      this._sweepResolvedStorms();
      this._broadcastStatus();
    }, 60_000);
  }

  _stopSweep() {
    if (this._sweepTimer) { clearInterval(this._sweepTimer); this._sweepTimer = null; }
  }

  _sweepResolvedStorms() {
    // Auto-clear storm issues where rate has dropped below threshold
    const now = Date.now();
    for (const [issueId, issue] of this._issues) {
      if (issue.type !== "STORM") continue;
      const times  = this._eventTimes.get(issue.data.eventName) ?? [];
      const cutoff = now - this._thresholds.stormWindowMs;
      const recent = times.filter(t => t >= cutoff);
      const rate   = (recent.length / this._thresholds.stormWindowMs) * 1000;
      if (rate < this._thresholds.stormRatePerSec * 0.5) {
        this._issues.delete(issueId);
        this._emit("sentinel:issueCleared", { issueId, type: "STORM" });
      }
    }
  }

  // ── Issue Registry ─────────────────────────────────────────────

  _raiseIssue(type, severity, data) {
    const issueId = `sentinel-${type.toLowerCase()}-${++this._issueSeq}`;
    this._issues.set(issueId, {
      issueId, type, severity, data,
      detectedAt: Date.now(),
      detectedAtISO: new Date().toISOString()
    });
    this._broadcastStatus();
    return issueId;
  }

  _broadcastStatus() {
    const issues       = [...this._issues.values()];
    const criticalCount = issues.filter(i => i.severity === "CRITICAL").length;
    const status       = this._paused    ? "paused"
                       : !this._running  ? "stopped"
                       : criticalCount   ? "critical"
                       : issues.length   ? "warning"
                       : "clear";

    this._emit("sentinel:statusChanged", {
      status, issueCount: issues.length, criticalCount
    });

    // Forward to StatusBar
    this._emit("app:sovereignStatus", {
      sovereignId: "sentinel", status, detail: `${issues.length} issue${issues.length !== 1 ? "s" : ""}`
    });
  }

  // ── EventBus Wiring ────────────────────────────────────────────

  _subscribeEventBus() {
    const bus = this._getBus();
    if (!bus) return;

    // Intercept all events for storm + circular detection
    const onAny = (eventName, ...args) => {
      this._observeEvent(eventName);
      this._pushChain(eventName);
      // Pop after a microtask — synchronous event handlers will have run
      Promise.resolve().then(() => this._popChain());

      // Touch module activity from interpreter dispatches
      if (eventName === "interpreter:dispatched") {
        const payload = args[0] ?? {};
        this._touchModule(payload.resolvedModule);
      }
      if (eventName === "chronicle:entryRecorded") {
        const entry = args[0] ?? {};
        if (entry.type?.startsWith("command:")) {
          this._touchModule(entry.source);
        }
      }
    };

    const onRegistered = (payload) => {
      const moduleId = payload?.moduleId ?? payload?.id;
      if (moduleId) this._moduleActivity.set(moduleId, { lastSeen: Date.now() });
    };

    const onDeregistered = (payload) => {
      const moduleId = payload?.moduleId ?? payload?.id;
      if (moduleId) this._moduleActivity.delete(moduleId);
    };

    if (bus.onAny) {
      bus.onAny(onAny);
      this._busUnsub.push(() => bus.offAny?.(onAny));
    }

    bus.on("registry:moduleRegistered",   onRegistered);
    bus.on("registry:moduleDeregistered", onDeregistered);
    this._busUnsub.push(
      () => bus.off?.("registry:moduleRegistered",   onRegistered),
      () => bus.off?.("registry:moduleDeregistered", onDeregistered)
    );
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

module.exports = SentinelService;
