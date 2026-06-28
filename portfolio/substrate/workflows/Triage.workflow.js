// ──────────────────────────────────────────────────────────────────
// File:    Triage.workflow.js
// Version: 5.2.0
// Updated: 2026-06-27T00:00:00Z
// Changes: Amendment 3.1 — subscribe to sleeve:boundaryFault directly
//          from the EventBus. Circuit breakers now trip on ANY sleeve
//          fault regardless of whether Triage dispatched the call.
//          Previously Triage only tripped circuits from its own catch
//          block; now all invocation paths are covered.
// ──────────────────────────────────────────────────────────────────
"use strict";

class TriageWorkflow {
  static MANIFEST = {
    id:              "Triage.workflow",
    type:            "workflow",
    layer:           3,
    runtime:         "NodeJS",
    version:         "5.2.0",
    operationalRole: "triage",
    requires:  ["Oracle.service", "Pulse.workflow", "Chronicle.service"],
    dataFiles: [],
    lifecycle: ["init", "run", "dispose"],
    actions: {
      commands: {
        run:              { description: "Route an incoming request to the optimal capable module based on live Pulse telemetry. Returns the dispatch result.", input: { capability: "string", payload: "object?", sessionId: "string?", dryRun: "boolean?" }, output: "object" },
        getRoutingTable:  { description: "Return the current routing table — all capabilities mapped to their ranked candidate modules.", input: {}, output: "object[]" },
        setCircuitBreaker:{ description: "Manually open or reset the circuit breaker for a module.", input: { moduleId: "string", state: "string" }, output: "void" },
        getModuleHealth:  { description: "Return the current health status of all tracked modules.", input: {}, output: "object[]" }
      },
      events: {
        "triage:routed":          { payload: { capability: "string", chosenModule: "string", reason: "string", p95Ms: "number" } },
        "triage:circuitOpen":     { payload: { moduleId: "string", errorRatePct: "number" } },
        "triage:circuitReset":    { payload: { moduleId: "string" } },
        "triage:noCapableModule": { payload: { capability: "string" } },
        // v5.1: Sleeve boundary fault — external daemon/API unreachable
        "triage:boundaryFault":   { payload: { moduleId: "string", externalSystem: "string", transport: "string", error: "string" } }
      },
      accepts: {
        "pulse:anomalyDetected":     { description: "Opens circuit breaker for the module with the anomaly." },
        "registry:moduleRegistered": { description: "Rebuilds the routing table when a new module is fielded." },
        "sleeve:boundaryFault":      { description: "Amendment 3.1 — trips the circuit breaker for the faulting sleeve regardless of invocation path." }
      },
      slots: {}
    },
    docs: {
      description: "Intelligent request router. Uses live Pulse telemetry (p95 latency, error rates) and Oracle capability scores to dispatch incoming requests to the optimal module. Implements per-module circuit breakers.",
      author: "ProtoAI Core Architecture Group",
      sdoa:   "5.0.0"
    }
  };

  _registry = null; _oracle = null; _pulse = null; _chronicle = null;
  _routingTable = new Map(); _circuits = new Map(); _busUnsub = [];
  _timers = new Set();
  _errorRateThreshold = 20; _halfOpenAfterMs = 30_000;

  async init(registry) {
    this._registry  = registry;
    this._oracle    = registry.get("Oracle.service");
    this._pulse     = registry.get("Pulse.workflow");
    this._chronicle = registry.get("Chronicle.service");
    this._subscribeEventBus();
  }

  async run({ capability, payload, sessionId, dryRun } = {}) {
    if (!this._routingTable.size) this._buildRoutingTable();

    const candidates = (this._routingTable.get(capability) ?? []).filter(c => {
      const cb = this._circuits.get(c.moduleId);
      return !cb || cb.state === "CLOSED" || cb.state === "HALF_OPEN";
    });

    if (!candidates.length) {
      this._emit("triage:noCapableModule", { capability });
      return { ok: false, error: `No capable module for "${capability}"` };
    }

    const chosen = candidates[0];
    const cb     = this._circuits.get(chosen.moduleId);

    if (dryRun) {
      return { ok: true, data: { chosenModule: chosen.moduleId, reason: "top-ranked", p95Ms: chosen.p95Ms ?? null, errorRatePct: chosen.errorRatePct ?? null, dispatched: false } };
    }

    try {
      const result = await chosen.module?.run?.(payload ?? {});
      this._pulse?.recordSample?.({ moduleId: chosen.moduleId, commandId: "run", durationMs: 0, success: true });
      if (cb?.state === "HALF_OPEN") { cb.state = "CLOSED"; cb.errorCount = 0; this._emit("triage:circuitReset", { moduleId: chosen.moduleId }); }
      this._emit("triage:routed", { capability, chosenModule: chosen.moduleId, reason: "top-ranked", p95Ms: chosen.p95Ms ?? 0 });
      this._chronicle?.record?.({
        type:    "triage:dispatched",
        source:  "Triage.workflow",
        payload: { capability, moduleId: chosen.moduleId, sessionId }
      });
      return result;
    } catch (err) {
      // v5.1: emit boundary fault alert before tripping the circuit (§4.4)
      if (chosen.isBoundary) {
        this._emit("triage:boundaryFault", {
          moduleId:       chosen.moduleId,
          externalSystem: chosen.externalSystem,
          transport:      chosen.transport,
          error:          err?.message ?? "boundary connection failed"
        });
        this._chronicle?.record?.({
          type:    "triage:boundaryFault",
          source:  "Triage.workflow",
          payload: { moduleId: chosen.moduleId, externalSystem: chosen.externalSystem, error: err?.message }
        });
      }
      if (cb?.state === "HALF_OPEN") {
        cb.state = "OPEN";
        cb.openedAt = Date.now();
        const _t = setTimeout(() => {
          this._timers.delete(_t);
          this._halfOpen(chosen.moduleId);
        }, this._halfOpenAfterMs);
        this._timers.add(_t);
      } else {
        this._checkCircuit(chosen.moduleId);
      }
      const fallback = candidates[1];
      if (fallback) return fallback.module?.run?.(payload ?? {});
      return { ok: false, error: err?.message ?? "dispatch failed" };
    }
  }

  async dispose() {
    this._busUnsub.forEach(fn => fn()); this._busUnsub = [];
    this._routingTable.clear(); this._circuits.clear();
    for (const t of this._timers) clearTimeout(t);
    this._timers.clear();
    this._registry  = null;
    this._oracle    = null;
    this._pulse     = null;
    this._chronicle = null;
  }

  getRoutingTable() {
    return [...this._routingTable.entries()].map(([cap, candidates]) => ({
      capability: cap,
      candidates: candidates.map(c => ({
        moduleId: c.moduleId, p95Ms: c.p95Ms ?? null, errorRatePct: c.errorRatePct ?? null,
        score: c.score ?? null, circuit: this._circuits.get(c.moduleId)?.state ?? "CLOSED"
      }))
    }));
  }

  getModuleHealth() {
    const seen = new Set(), health = [];
    for (const [, candidates] of this._routingTable) {
      for (const c of candidates) {
        if (!seen.has(c.moduleId)) { seen.add(c.moduleId); health.push({ moduleId: c.moduleId, p95Ms: c.p95Ms ?? null, errorRatePct: c.errorRatePct ?? null, circuit: this._circuits.get(c.moduleId)?.state ?? "CLOSED" }); }
      }
    }
    return health;
  }

  setCircuitBreaker({ moduleId, state }) {
    if      (state === "open")  this._circuits.set(moduleId, { state: "OPEN",   openedAt: Date.now(), errorCount: 0 });
    else if (state === "reset") { this._circuits.set(moduleId, { state: "CLOSED", openedAt: null, errorCount: 0 }); this._emit("triage:circuitReset", { moduleId }); }
  }

  _buildRoutingTable() {
    this._routingTable.clear();
    const surface = this._oracle?.dumpSurface({}) ?? [], seen = new Set();
    for (const entry of surface) {
      // v5.1: include both "command" and "boundary" surface entries so
      // sleeve external connections get circuit-breaker coverage (§4.4)
      if (entry.surfaceType !== "command" && entry.surfaceType !== "boundary") continue;
      const cap = entry.name, key = `${entry.moduleId}:${cap}`;
      if (!this._routingTable.has(cap)) this._routingTable.set(cap, []);
      if (!seen.has(key)) {
        seen.add(key);
        this._routingTable.get(cap).push({
          moduleId:       entry.moduleId,
          module:         this._registry?.get?.(entry.moduleId),
          description:    entry.description,
          isBoundary:     entry.surfaceType === "boundary",
          externalSystem: entry.schema?.system    ?? null,
          transport:      entry.schema?.transport ?? null,
        });
      }
    }
    for (const [, candidates] of this._routingTable) this._scoreCandidates(candidates);
  }

  _scoreCandidates(candidates) {
    for (const c of candidates) {
      const data = (this._pulse?.getModuleProfile?.({ moduleId: c.moduleId })?.data) ?? {};
      c.p95Ms = data.p95 ?? 0; c.errorRatePct = data.errorRatePct ?? 0;
      c.score = (1 / (c.p95Ms + 1)) * (1 - c.errorRatePct / 100);
    }
    candidates.sort((a, b) => b.score - a.score);
  }

  _checkCircuit(moduleId) {
    if (!this._circuits.has(moduleId)) this._circuits.set(moduleId, { state: "CLOSED", openedAt: null, errorCount: 0 });
    const cb = this._circuits.get(moduleId);
    cb.errorCount++;
    const errRate = (this._pulse?.getModuleProfile?.({ moduleId })?.data ?? {}).errorRatePct ?? 0;
    if (errRate > this._errorRateThreshold || cb.errorCount >= 3) {
      cb.state = "OPEN"; cb.openedAt = Date.now();
      this._emit("triage:circuitOpen", { moduleId, errorRatePct: errRate });
      const _t = setTimeout(() => {
        this._timers.delete(_t);
        this._halfOpen(moduleId);
      }, this._halfOpenAfterMs);
      this._timers.add(_t);
    }
  }

  _halfOpen(moduleId) { const cb = this._circuits.get(moduleId); if (cb?.state === "OPEN") cb.state = "HALF_OPEN"; }

  _subscribeEventBus() {
    if (this._busUnsub.length) return;
    const bus = this._getBus();
    if (!bus) return;
    const onAnomaly = ({ moduleId, metric, value }) => { if (metric === "error_rate_pct" && value > this._errorRateThreshold) this._checkCircuit(moduleId); };
    const onRegister = () => this._buildRoutingTable();
    // Amendment 3.1: sleeve:boundaryFault trips circuit from any call path
    const onBoundaryFault = ({ moduleId, externalSystem, transport, error, command }) => {
      this._checkCircuit(moduleId);
      this._chronicle?.record?.({
        type:    "triage:boundaryFault",
        source:  "Triage.workflow",
        payload: { moduleId, externalSystem, transport, error, command }
      });
    };
    bus.on("pulse:anomalyDetected",     onAnomaly);
    bus.on("registry:moduleRegistered", onRegister);
    bus.on("sleeve:boundaryFault",      onBoundaryFault);
    this._busUnsub.push(
      () => bus.off?.("pulse:anomalyDetected",     onAnomaly),
      () => bus.off?.("registry:moduleRegistered", onRegister),
      () => bus.off?.("sleeve:boundaryFault",      onBoundaryFault)
    );
  }

  _getBus()             { return this._registry?.get?.("EventBus.service"); }
  _emit(event, payload) { try { this._getBus()?.emit?.(event, payload); } catch (_) {} }
}

module.exports = TriageWorkflow;
