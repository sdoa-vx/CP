// ──────────────────────────────────────────────────────────────────
// File:    Triage.workflow.js
// Version: 5.4.0
// Updated: 2026-06-28T00:00:00Z
// Changes: Amendment 4.2 — Autonomous Routing Mesh.
//          DEGRADING circuit state: triggered by sleeve:health{healthy:false},
//          still routes but scored -5; clears on sleeve:health{healthy:true}.
//          Background mesh refresh every 30s: _refreshMesh() rebuilds the
//          routing table, re-scores live, detects champion changes.
//          Champion tracking: _champions Map (capability→moduleId), emits
//          triage:championChanged when best candidate for a capability changes.
//          _scoreCandidates() applies Oracle drift penalty per module.
//          Subscribes to: sleeve:health, sleeve:transportNegotiated,
//          cartographer:modelDrift (schedules immediate refresh).
//          New command: meshStatus(). New events: triage:championChanged,
//          triage:moduleDegrading, triage:meshRefreshed.
// Previous: Amendment 3.4 — Multi-Sleeve Routing.
//          run() now re-scores all candidates from live Pulse telemetry
//          at call time (not stale table-build scores). The single
//          silent fallback (candidates[1]) replaced with a waterfall
//          loop that iterates all viable candidates in score order.
//          New events: triage:sleeveFailover (per failover step) and
//          triage:allSleevesExhausted (when all candidates fail).
//          Both events are Chronicled for Cartographer drift analysis.
// Previous: Amendment 3.1 — subscribe to sleeve:boundaryFault directly
//          from the EventBus. Circuit breakers now trip on ANY sleeve
//          fault regardless of whether Triage dispatched the call.
// ──────────────────────────────────────────────────────────────────
"use strict";

class TriageWorkflow {
  static MANIFEST = {
    id:              "Triage.workflow",
    type:            "workflow",
    layer:           3,
    runtime:         "NodeJS",
    version:         "5.4.1",
    last_modified:   "2026-07-13T00:00:00Z",
    operationalRole: "triage",
    capabilities: ["routing:dispatch", "routing:circuit-breaker", "routing:module-health"],
    requires:  ["Oracle.service", "Pulse.workflow", "Chronicle.service"],
    dependencies: ["Oracle.service", "Pulse.workflow", "Chronicle.service"],
    dataFiles: [],
    lifecycle: ["init", "run", "dispose"],
    actions: {
      commands: {
        run:              { description: "Route an incoming request to the optimal capable module based on live Pulse telemetry. Returns the dispatch result.", input: { capability: "string", payload: "object?", sessionId: "string?", dryRun: "boolean?" }, output: "object" },
        getRoutingTable:  { description: "Return the current routing table — all capabilities mapped to their ranked candidate modules.", input: {}, output: "object[]" },
        setCircuitBreaker:{ description: "Manually open or reset the circuit breaker for a module.", input: { moduleId: "string", state: "string" }, output: "void" },
        getModuleHealth:  { description: "Return the current health status of all tracked modules.", input: {}, output: "object[]" },
        meshStatus:       { description: "Amendment 4.2 — return the full autonomous routing mesh state: champions per capability, DEGRADING modules, mesh version, and last refresh timestamp.", input: {}, output: "object" }
      },
      events: {
        "triage:routed":          { payload: { capability: "string", chosenModule: "string", reason: "string", p95Ms: "number" } },
        "triage:circuitOpen":     { payload: { moduleId: "string", errorRatePct: "number" } },
        "triage:circuitReset":    { payload: { moduleId: "string" } },
        "triage:noCapableModule": { payload: { capability: "string" } },
        // v5.1: Sleeve boundary fault — external daemon/API unreachable
        "triage:boundaryFault":       { payload: { moduleId: "string", externalSystem: "string", transport: "string", error: "string" } },
        // Amendment 3.4: multi-sleeve failover observability
        "triage:sleeveFailover":      { payload: { capability: "string", failedModuleId: "string", failedReason: "string", nextModuleId: "string", attemptNumber: "number", totalCandidates: "number" } },
        "triage:allSleevesExhausted": { payload: { capability: "string", attemptedModules: "string[]", lastError: "string" } },
        // Amendment 4.2: autonomous mesh events
        "triage:championChanged": { payload: { capability: "string", previousChampion: "string|null", newChampion: "string", reason: "string" } },
        "triage:moduleDegrading": { payload: { moduleId: "string", reason: "string" } },
        "triage:meshRefreshed":   { payload: { meshVersion: "number", capabilityCount: "number", changedChampions: "number", timestamp: "string" } }
      },
      accepts: {
        "pulse:anomalyDetected":     { description: "Opens circuit breaker for the module with the anomaly." },
        "registry:moduleRegistered": { description: "Rebuilds the routing table when a new module is fielded." },
        "sleeve:boundaryFault":        { description: "Amendment 3.1 — trips the circuit breaker for the faulting sleeve regardless of invocation path." },
        "sleeve:health":               { description: "Amendment 4.2 — unhealthy sleeve enters DEGRADING state; recovery clears it." },
        "sleeve:transportNegotiated":  { description: "Amendment 4.2 — schedules an immediate mesh refresh when a sleeve switches transport." },
        "cartographer:modelDrift":     { description: "Amendment 4.2 — schedules an immediate mesh refresh when model drift is detected." }
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
  // Amendment 4.2: autonomous mesh state
  _champions     = new Map();   // capability → moduleId (current champion)
  _meshVersion   = 0;
  _lastRefreshAt = null;
  _meshRefreshMs = 30_000;      // background refresh interval
  _meshTimer     = null;

  async init(registry) {
    this._registry  = registry;
    this._oracle    = registry.get("Oracle.service");
    this._pulse     = registry.get("Pulse.workflow");
    this._chronicle = registry.get("Chronicle.service");
    this._subscribeEventBus();
    this._startMeshRefresh();
  }

  async run({ capability, payload, sessionId, dryRun } = {}) {
    if (!this._routingTable.size) this._buildRoutingTable();

    // Amendment 3.4: re-score from live Pulse telemetry before every dispatch
    const all = this._routingTable.get(capability) ?? [];
    this._scoreCandidates(all);

    // Amendment 4.2: DEGRADING modules still route (scored lower by _scoreCandidates)
    const candidates = all.filter(c => {
      const cb = this._circuits.get(c.moduleId);
      return !cb || cb.state === "CLOSED" || cb.state === "HALF_OPEN" || cb.state === "DEGRADING";
    });

    if (!candidates.length) {
      this._emit("triage:noCapableModule", { capability });
      return { ok: false, error: `No capable module for "${capability}"` };
    }

    if (dryRun) {
      const top = candidates[0];
      return { ok: true, data: { chosenModule: top.moduleId, reason: "top-ranked", p95Ms: top.p95Ms ?? null, errorRatePct: top.errorRatePct ?? null, dispatched: false } };
    }

    const attempted = [];

    // Amendment 3.4: waterfall loop — try each candidate in score order
    for (let attempt = 0; attempt < candidates.length; attempt++) {
      const chosen = candidates[attempt];
      const cb     = this._circuits.get(chosen.moduleId);

      try {
        const result = await chosen.module?.run?.(payload ?? {});
        this._pulse?.recordSample?.({ moduleId: chosen.moduleId, commandId: "run", durationMs: 0, success: true });
        if (cb?.state === "HALF_OPEN") { cb.state = "CLOSED"; cb.errorCount = 0; this._emit("triage:circuitReset", { moduleId: chosen.moduleId }); }
        this._emit("triage:routed", {
          capability,
          chosenModule: chosen.moduleId,
          reason:       attempt === 0 ? "top-ranked" : `failover-${attempt}`,
          p95Ms:        chosen.p95Ms ?? 0
        });
        this._chronicle?.record?.({
          type:    "triage:dispatched",
          source:  "Triage.workflow",
          payload: { capability, moduleId: chosen.moduleId, sessionId, attempt }
        });
        return result;
      } catch (err) {
        attempted.push(chosen.moduleId);

        // Boundary fault telemetry (§4.4)
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

        // Circuit trip
        if (cb?.state === "HALF_OPEN") {
          cb.state = "OPEN"; cb.openedAt = Date.now();
          const _t = setTimeout(() => { this._timers.delete(_t); this._halfOpen(chosen.moduleId); }, this._halfOpenAfterMs);
          this._timers.add(_t);
        } else {
          this._checkCircuit(chosen.moduleId);
        }

        // Amendment 3.4: emit failover event and continue to next candidate
        const next = candidates[attempt + 1];
        if (next) {
          this._emit("triage:sleeveFailover", {
            capability,
            failedModuleId:  chosen.moduleId,
            failedReason:    err?.message ?? "unknown",
            nextModuleId:    next.moduleId,
            attemptNumber:   attempt + 1,
            totalCandidates: candidates.length
          });
          this._chronicle?.record?.({
            type:    "triage:sleeveFailover",
            source:  "Triage.workflow",
            payload: { capability, failedModuleId: chosen.moduleId, nextModuleId: next.moduleId, attemptNumber: attempt + 1 }
          });
          continue;
        }

        // All candidates exhausted
        this._emit("triage:allSleevesExhausted", {
          capability,
          attemptedModules: attempted,
          lastError:        err?.message ?? "unknown"
        });
        return { ok: false, error: `All ${candidates.length} candidate(s) exhausted for "${capability}". Last: ${err?.message ?? "unknown"}` };
      }
    }

    return { ok: false, error: `No dispatch completed for "${capability}"` };
  }

  async dispose() {
    this._busUnsub.forEach(fn => fn()); this._busUnsub = [];
    this._routingTable.clear(); this._circuits.clear(); this._champions.clear();
    for (const t of this._timers) clearTimeout(t);
    this._timers.clear();
    if (this._meshTimer) { clearTimeout(this._meshTimer); this._meshTimer = null; }
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
    if      (state === "open")      this._circuits.set(moduleId, { state: "OPEN",      openedAt: Date.now(), errorCount: 0 });
    else if (state === "degrading") this._circuits.set(moduleId, { state: "DEGRADING", openedAt: Date.now(), errorCount: 0 });
    else if (state === "reset")     { this._circuits.set(moduleId, { state: "CLOSED", openedAt: null, errorCount: 0 }); this._emit("triage:circuitReset", { moduleId }); }
  }

  meshStatus() {
    return {
      meshVersion:   this._meshVersion,
      lastRefreshAt: this._lastRefreshAt,
      champions:     Object.fromEntries(this._champions),
      degrading:     [...this._circuits.entries()]
        .filter(([, cb]) => cb.state === "DEGRADING")
        .map(([id, cb]) => ({ moduleId: id, since: new Date(cb.openedAt).toISOString() })),
      capabilities:  this.getRoutingTable()
    };
  }

  // ── Amendment 4.2: Autonomous Mesh Refresh ────────────────────

  _startMeshRefresh() {
    const schedule = () => {
      this._meshTimer = setTimeout(() => {
        this._timers.delete(this._meshTimer);
        this._meshTimer = null;
        if (this._registry) { this._refreshMesh(); schedule(); }
      }, this._meshRefreshMs);
      this._timers.add(this._meshTimer);
    };
    schedule();
  }

  _refreshMesh() {
    this._buildRoutingTable();
    let changed = 0;
    for (const [cap, candidates] of this._routingTable) {
      const top  = candidates[0]?.moduleId ?? null;
      const prev = this._champions.get(cap) ?? null;
      if (top && top !== prev) {
        changed++;
        this._champions.set(cap, top);
        this._emit("triage:championChanged", {
          capability:       cap,
          previousChampion: prev,
          newChampion:      top,
          reason:           "mesh-refresh"
        });
      }
    }
    this._meshVersion++;
    this._lastRefreshAt = new Date().toISOString();
    this._emit("triage:meshRefreshed", {
      meshVersion:      this._meshVersion,
      capabilityCount:  this._routingTable.size,
      changedChampions: changed,
      timestamp:        this._lastRefreshAt
    });
    this._chronicle?.record?.({
      type:    "triage:meshRefreshed",
      source:  "Triage.workflow",
      payload: { meshVersion: this._meshVersion, capabilityCount: this._routingTable.size, changedChampions: changed }
    });
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
      const data  = (this._pulse?.getModuleProfile?.({ moduleId: c.moduleId })?.data) ?? {};
      c.p95Ms     = data.p95 ?? 0;
      c.errorRatePct = data.errorRatePct ?? 0;
      c.score     = (1 / (c.p95Ms + 1)) * (1 - c.errorRatePct / 100);
      // Amendment 4.2: apply Oracle drift penalty
      const drift = this._oracle?.getDriftPenalty?.({ moduleId: c.moduleId });
      if (drift?.penalty > 0) c.score -= drift.penalty * 0.1;  // scale to routing score space
      // Amendment 4.2: DEGRADING state further de-preferences module
      if (this._circuits.get(c.moduleId)?.state === "DEGRADING") c.score -= 0.5;
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
    // Amendment 4.2: health events drive DEGRADING state
    const onHealth = ({ moduleId, healthy }) => {
      if (!moduleId) return;
      if (!healthy) {
        const cb = this._circuits.get(moduleId);
        if (!cb || cb.state === "CLOSED") {
          this._circuits.set(moduleId, { state: "DEGRADING", openedAt: Date.now(), errorCount: 0 });
          this._emit("triage:moduleDegrading", { moduleId, reason: "sleeve:health(unhealthy)" });
        }
      } else {
        const cb = this._circuits.get(moduleId);
        if (cb?.state === "DEGRADING") {
          this._circuits.set(moduleId, { state: "CLOSED", openedAt: null, errorCount: 0 });
          this._emit("triage:circuitReset", { moduleId });
        }
      }
    };
    // Amendment 4.2: transport change or model drift → immediate mesh refresh
    const onTransportChange = () => Promise.resolve().then(() => this._refreshMesh());
    const onModelDrift      = ({ driftItems }) => {
      if (driftItems?.some(i => i.severity === "high" || i.severity === "critical")) {
        Promise.resolve().then(() => this._refreshMesh());
      }
    };
    bus.on("pulse:anomalyDetected",       onAnomaly);
    bus.on("registry:moduleRegistered",   onRegister);
    bus.on("sleeve:boundaryFault",        onBoundaryFault);
    bus.on("sleeve:health",               onHealth);
    bus.on("sleeve:transportNegotiated",  onTransportChange);
    bus.on("cartographer:modelDrift",     onModelDrift);
    this._busUnsub.push(
      () => bus.off?.("pulse:anomalyDetected",      onAnomaly),
      () => bus.off?.("registry:moduleRegistered",  onRegister),
      () => bus.off?.("sleeve:boundaryFault",       onBoundaryFault),
      () => bus.off?.("sleeve:health",              onHealth),
      () => bus.off?.("sleeve:transportNegotiated", onTransportChange),
      () => bus.off?.("cartographer:modelDrift",    onModelDrift)
    );
  }

  _getBus()             { return this._registry?.get?.("EventBus.service"); }
  _emit(event, payload) { try { this._getBus()?.emit?.(event, payload); } catch (_) {} }
}

module.exports = TriageWorkflow;
