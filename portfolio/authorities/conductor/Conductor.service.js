// ──────────────────────────────────────────────────────────────────
// File:    Conductor.service.js
// Version: 5.0.1
// Updated: 2026-07-13T00:00:00Z
// Changes: SDOA manifest-compliance pass — added capabilities,
//          dependencies, and last_modified fields.
// ──────────────────────────────────────────────────────────────────
// Last modified: 2026-07-13 00:00 UTC
"use strict";

class ConductorService {
  static MANIFEST = {
    id:              "Conductor.service",
    type:            "service",
    layer:           3,
    runtime:         "NodeJS",
    version:         "5.0.1",
    operationalRole: "conductor",
    requires:  ["Chronicle.service", "ResponseFormatter.service"],
    capabilities: [
      "events:suppression",
      "events:circuitBreaker",
      "events:rateLimiting",
      "events:chainBreaking"
    ],
    dependencies: ["Chronicle.service", "ResponseFormatter.service"],
    dataFiles: [],
    lifecycle: ["init", "run", "dispose"],
    actions: {
      commands: {
        run:              { description: "Start Conductor — subscribe to EventBus and begin monitoring. Returns status.", input: { config: "object?" }, output: "object" },
        suppressEvent:    { description: "Suppress a specific event type for a duration. Conductor will drop/queue events of this type during suppression.", input: { eventName: "string", durationMs: "number?" }, output: "void" },
        breakChain:       { description: "Break a detected circular event chain. Removes all events in the chain from active emission for one suppression cycle.", input: { chain: "string[]" }, output: "void" },
        getCircuitState:  { description: "Return the circuit breaker state for a specific event or all events.", input: { eventName: "string?" }, output: "object" },
        setRateCap:       { description: "Set a per-second rate cap for an event type. Events exceeding the cap are dropped.", input: { eventName: "string", maxPerSec: "number" }, output: "void" },
        clearSuppression: { description: "Manually clear a suppression before its timer expires.", input: { eventName: "string" }, output: "void" }
      },
      events: {
        "conductor:eventSuppressed":  { payload: { eventName: "string", durationMs: "number" } },
        "conductor:chainBroken":      { payload: { chain: "string[]", suppressedCount: "number" } },
        "conductor:circuitOpened":    { payload: { eventName: "string", reason: "string" } },
        "conductor:circuitClosed":    { payload: { eventName: "string" } },
        "conductor:rateLimitHit":     { payload: { eventName: "string", droppedCount: "number" } }
      },
      accepts: {
        "sentinel:stormDetected":        { description: "Triggers suppressEvent for the storm event type." },
        "sentinel:circularLoopDetected": { description: "Triggers breakChain for the detected loop." }
      },
      slots: {}
    },
    docs: {
      description: "Event-Mesh Coordinator sovereign. Manages EventBus circuit breakers, event suppression timers, circular chain breaking, and per-event rate caps. Receives alerts from Sentinel via Captain and responds by suppressing or capping the offending event types. Reports sovereign status to StatusBar.",
      author: "ProtoAI Core Architecture Group",
      sdoa:   "5.0.0"
    },
    last_modified: "2026-07-13T00:00:00Z"
  };

  _registry    = null;
  _chronicle   = null;
  _busUnsub    = [];
  _suppressed      = new Map();
  _circuits        = new Map();
  _rateCaps        = new Map();
  _halfOpenProbes  = new Map();
  _suppressedDrops = new Map();
  _running         = false;

  async init(registry) {
    this._registry  = registry;
    this._chronicle = registry.get("Chronicle.service");
  }

  async run() {
    if (this._running) return { status: "already running" };
    this._running = true;
    this._subscribeEventBus();
    this._broadcastStatus();
    this._chronicle?.record({ type: "conductor:started", source: "Conductor.service", payload: {} });
    return { status: "running" };
  }

  async dispose() {
    this._unsubscribeEventBus();
    for (const [, sup] of this._suppressed) clearTimeout(sup.timer);
    this._suppressed.clear();
    for (const handle of this._halfOpenProbes.values()) clearTimeout(handle);
    this._halfOpenProbes.clear();
    this._circuits.clear();
    this._rateCaps.clear();
    this._suppressedDrops.clear();
    this._running     = false;
    this._registry    = null;
    this._chronicle   = null;
  }

  suppressEvent({ eventName, durationMs = 5000 }) {
    const existing = this._suppressed.get(eventName);
    if (existing) clearTimeout(existing.timer);

    const timer = setTimeout(() => {
      this._suppressed.delete(eventName);
      this._circuits.set(eventName, "HALF_OPEN");
      this._broadcastStatus();
      const probeHandle = setTimeout(() => {
        this._halfOpenProbes.delete(eventName);
        if (this._circuits.get(eventName) === "HALF_OPEN") {
          this._circuits.set(eventName, "CLOSED");
          this._emit("conductor:circuitClosed", { eventName });
          this._broadcastStatus();
        }
      }, 500);
      this._halfOpenProbes.set(eventName, probeHandle);
    }, durationMs);

    this._suppressed.set(eventName, { expiresAt: Date.now() + durationMs, timer });
    this._circuits.set(eventName, "OPEN");
    this._emit("conductor:eventSuppressed", { eventName, durationMs });
    this._emit("conductor:circuitOpened", { eventName, reason: "suppression" });
    this._chronicle?.record({ type: "conductor:suppress", source: "Conductor.service", payload: { eventName, durationMs } });
    this._broadcastStatus();
  }

  breakChain({ chain }) {
    if (!Array.isArray(chain)) return;
    for (const eventName of chain) this.suppressEvent({ eventName, durationMs: 5000 });
    this._emit("conductor:chainBroken", { chain, suppressedCount: chain.length });
    this._chronicle?.record({ type: "conductor:chainBroken", source: "Conductor.service", payload: { chain } });
  }

  getCircuitState({ eventName } = {}) {
    if (eventName) {
      const dropped = this._rateCaps.has(eventName)
        ? this._rateCaps.get(eventName).dropped
        : (this._suppressedDrops.get(eventName) ?? 0);
      return { eventName, state: this._circuits.get(eventName) ?? "CLOSED", dropped };
    }
    return Object.fromEntries(this._circuits);
  }

  setRateCap({ eventName, maxPerSec }) {
    this._rateCaps.set(eventName, { maxPerSec, timestamps: [], dropped: 0 });
  }

  clearSuppression({ eventName }) {
    const existing = this._suppressed.get(eventName);
    if (existing) {
      clearTimeout(existing.timer);
      this._suppressed.delete(eventName);
      this._circuits.set(eventName, "CLOSED");
      this._emit("conductor:circuitClosed", { eventName });
      this._broadcastStatus();
    }
  }

  _subscribeEventBus() {
    const bus = this._getBus();
    if (!bus) return;

    const onStorm = ({ eventName }) => this.suppressEvent({ eventName, durationMs: 5000 });
    const onLoop  = ({ chain })     => this.breakChain({ chain });

    const onAny = (evName) => {
      const now = Date.now();
      const cap = this._rateCaps.get(evName);
      if (cap) {
        cap.timestamps = cap.timestamps.filter(t => now - t < 1000);
        if (cap.timestamps.length >= cap.maxPerSec) {
          cap.dropped++;
          this._emit("conductor:rateLimitHit", { eventName: evName, droppedCount: cap.dropped });
          return;
        }
        cap.timestamps.push(now);
      }
      if (this._suppressed.has(evName)) {
        this._suppressedDrops.set(evName, (this._suppressedDrops.get(evName) ?? 0) + 1);
        this._emit("conductor:rateLimitHit", { eventName: evName, droppedCount: this._suppressedDrops.get(evName) });
      }
    };

    bus.on("sentinel:stormDetected",        onStorm);
    bus.on("sentinel:circularLoopDetected", onLoop);
    if (bus.onAny) {
      bus.onAny(onAny);
      this._busUnsub.push(() => bus.offAny?.(onAny));
    }
    this._busUnsub.push(
      () => bus.off?.("sentinel:stormDetected",        onStorm),
      () => bus.off?.("sentinel:circularLoopDetected", onLoop)
    );
  }

  _unsubscribeEventBus() { this._busUnsub.forEach(fn => fn()); this._busUnsub = []; }

  _broadcastStatus() {
    const suppCount = this._suppressed.size;
    const status    = suppCount > 0 ? "suppressing" : "ready";
    const detail    = suppCount > 0 ? `${suppCount} event(s) suppressed` : "nominal";
    this._emit("app:sovereignStatus", { sovereignId: "conductor", status, detail });
  }

  _getBus() {
    return this._registry?.get?.("EventBus.service") ?? null;
  }

  _emit(eventName, payload) {
    try { this._getBus()?.emit?.(eventName, payload); } catch (_) {}
  }
}

module.exports = ConductorService;
