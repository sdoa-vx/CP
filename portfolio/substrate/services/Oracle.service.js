// ──────────────────────────────────────────────────────────────────
// File:    Oracle.service.js
// Version: 5.4.0
// Updated: 2026-06-28T00:00:00Z
// Changes: Amendment 4.2 — Autonomous Routing Mesh.
//          _driftCache (moduleId → { penalty, severity, capturedAt }) populated
//          by cartographer:modelDrift and cartographer:boundaryDrift events.
//          _score() now applies drift penalty (-3 high, -8 critical).
//          getDriftPenalty(moduleId) → { penalty, severity } | null.
//          meshStatus() → full sleeve mesh view with live scores + drift flags.
//          oracle:driftPenaltyUpdated event emitted when cache changes.
// Previous: Amendment 3.4 — Multi-Sleeve Routing.
//          New command: rankSleeves({ capability, limit }) — returns all
//          registered sleeve modules that expose the given capability,
//          re-scored live from current Pulse telemetry, sorted by score
//          descending. Used by Triage.run() for real-time ranking before
//          each dispatch. Limit defaults to 10.
// Previous: Phase 5 Item 6 — sleeve capability scoring extended.
//          _score() now factors latency, error rate, and stability
//          (boundaryFault count) for sleeve modules via Pulse.workflow.
//          Pulse is resolved lazily so Oracle stays Universal-runtime.
//          describeModule() now includes externalSystem and
//          externalCommands for sleeve modules.
//          dumpSurface() includes boundary entries for sleeves.
//          query() accepts externalSystem criterion.
//          New command: whoHasBoundary({ system }) — lists sleeves
//          wrapping a given external system.
// ──────────────────────────────────────────────────────────────────
// Last modified: 2026-06-01 00:00 UTC
// Oracle.service.js — SDOA v5.0 Service (Universal)
// Validated by: ProbationOfficer.workflow.rs
//
// Change log:
//   5.0.0 — Initial implementation. Capability query sovereign.
//            Scans the live registry manifest surface and answers:
//              "Who can handle action X?"
//              "Which modules emit event Y?"
//              "Which modules accept event Z?"
//              "Who has capability token C?"
//            Returns scored, ranked candidate lists. Feeds Interpreter.workflow.js,
//            Blueprint.feature.js, Triage.workflow.js, and Coach.workflow.py.

"use strict";

class OracleService {
  static MANIFEST = {
    // ── Identity ──────────────────────────────
    id:              "Oracle.service",
    type:            "service",
    layer:           3,
    runtime:         "Universal",
    version:         "5.4.0",
    operationalRole: "oracle",

    // ── Dependencies ──────────────────────────
    requires:  [],  // Pulse.workflow resolved lazily (not a hard dep)
    dataFiles: [],

    // ── Lifecycle ─────────────────────────────
    lifecycle: ["init", "run", "dispose"],

    // ── Action Surface ────────────────────────
    actions: {
      commands: {
        query: {
          description: "Find modules matching any combination of: capability token, emitted event, accepted event, command name, operational role, runtime, or layer. Returns scored candidates, highest match first.",
          input: {
            capability:      "string?",  // dot-notation token e.g. "data.fetch"
            emitsEvent:      "string?",  // event name e.g. "chronicle:entryRecorded"
            acceptsEvent:    "string?",  // event name e.g. "app:workspaceChanged"
            hasCommand:      "string?",  // command id e.g. "record"
            operationalRole: "string?",  // sovereign role e.g. "coach"
            runtime:         "string?",  // "NodeJS" | "Browser" | "Rust" | etc.
            layer:           "number?",  // 1 | 2 | 3
            fuzzy:           "boolean?"  // default true — partial substring matching
          },
          output: "object[]"  // CandidateResult[]
        },
        describeModule: {
          description: "Return a full human-readable capability summary for a single module by id.",
          input:  { moduleId: "string" },
          output: "object"    // ModuleProfile
        },
        dumpSurface: {
          description: "Return the full flattened capability surface of every registered module. Used by Blueprint and Interpreter to build their context payloads.",
          input:  { layerFilter: "number?", runtimeFilter: "string?" },
          output: "object[]"  // SurfaceEntry[]
        },
        whoEmits: {
          description: "Shorthand: list all modules that emit the given event name.",
          input:  { event: "string" },
          output: "object[]"
        },
        whoAccepts: {
          description: "Shorthand: list all modules that accept the given event name.",
          input:  { event: "string" },
          output: "object[]"
        },
        whoHandles: {
          description: "Shorthand: list all modules that expose the given command name.",
          input:  { command: "string" },
          output: "object[]"
        },
        // v5.4: Sleeve boundary query
        whoHasBoundary: {
          description: "List all sleeve modules that wrap the given external system.",
          input:  { system: "string" },
          output: "object[]"
        },
        // Amendment 3.4: live-scored sleeve ranking for multi-sleeve routing
        rankSleeves: {
          description: "Return all registered sleeve modules that expose the given capability token, re-scored from current Pulse telemetry at call time. Sorted descending by score. Used by Triage for real-time provider ranking before each dispatch.",
          input:  { capability: "string?", limit: "number?" },
          output: "object[]"
        },
        // Amendment 4.2: drift penalty and mesh view
        getDriftPenalty: {
          description: "Return the cached drift penalty for a module from the last Cartographer drift event. Returns null if no drift signal has been received.",
          input:  { moduleId: "string" },
          output: "{ penalty: number, severity: string, capturedAt: number } | null"
        },
        meshStatus: {
          description: "Return a full view of the routing mesh: all sleeves with live Oracle scores, Pulse telemetry, and active drift penalties. Used by Triage for mesh refresh and by dashboards.",
          input:  {},
          output: "object[]"   // MeshEntry[]
        }
      },
      events: {
        "oracle:queryExecuted":        { payload: { queryId: "string", matchCount: "number", durationMs: "number" } },
        "oracle:indexRebuilt":         { payload: { moduleCount: "number", commandCount: "number", eventCount: "number" } },
        "oracle:driftPenaltyUpdated":  { payload: { moduleId: "string", penalty: "number", severity: "string", source: "string" } }
      },
      accepts: {
        "registry:moduleRegistered":   { description: "Triggers an index rebuild when a new module joins the registry." },
        "registry:moduleDeregistered": { description: "Triggers an index rebuild when a module is removed." },
        "cartographer:modelDrift":     { description: "Amendment 4.2 — caches drift penalties per sleeve for use in _score()." },
        "cartographer:boundaryDrift":  { description: "Amendment 4.2 — caches boundary drift penalties per sleeve." }
      },
      slots: {}
    },

    // ── Documentation ─────────────────────────
    docs: {
      description: "Capability query sovereign. Maintains a live, searchable index of every module's manifest surface — commands, events, accepts, capabilities, roles, runtimes, and layers. Any module can ask Oracle what the system can do, who can do it, and who is listening. Feeds Interpreter, Blueprint, Triage, and Coach with the context they need to make intelligent decisions without hardcoded routing logic.",
      author: "ProtoAI Core Architecture Group",
      sdoa:   "5.0.0"
    }
  };

  // ── Private State ─────────────────────────────────────────────
  _registry      = null;
  _index         = null;
  _busUnsub      = [];
  _queryCounter  = 0;
  _pulse         = null;   // resolved lazily — not all runtimes have Pulse
  _driftCache    = new Map();   // Amendment 4.2: moduleId → { penalty, severity, capturedAt }
  _driftCacheTtlMs = 5 * 60 * 1000;  // 5 min; stale entries cleared in _score()

  // ── Lifecycle ──────────────────────────────────────────────────

  async init(registry) {
    this._registry = registry;
    this._rebuildIndex();
  }

  async run() {
    this._subscribeEventBus();
    return { status: "ready", indexedModules: this._index?.modules.length ?? 0 };
  }

  async dispose() {
    this._unsubscribeEventBus();
    this._index = null;
  }

  // ── Public Commands ────────────────────────────────────────────

  /**
   * query(criteria) → CandidateResult[]
   *
   * Scores every module in the index against the supplied criteria.
   * Each matching criterion adds to the module's score. Results are
   * sorted descending — highest score first. Zero-score modules excluded.
   *
   * CandidateResult shape:
   *   { moduleId, score, matchedFields, manifest }
   */
  query(criteria = {}) {
    const t0      = Date.now();
    const queryId = `q-${++this._queryCounter}`;
    const fuzzy   = criteria.fuzzy !== false;

    this._ensureIndex();

    const results = [];

    for (const entry of this._index.modules) {
      const { score, matchedFields } = this._score(entry, criteria, fuzzy);
      if (score > 0) {
        results.push({
          moduleId:      entry.id,
          score,
          matchedFields,
          manifest:      entry.manifest
        });
      }
    }

    results.sort((a, b) => b.score - a.score);

    const durationMs = Date.now() - t0;
    this._emit("oracle:queryExecuted", { queryId, matchCount: results.length, durationMs });

    return results;
  }

  /**
   * describeModule({ moduleId }) → ModuleProfile
   *
   * Returns a structured capability summary for a single module.
   * ModuleProfile shape:
   *   { moduleId, type, layer, runtime, operationalRole, version,
   *     commands[], emittedEvents[], acceptedEvents[], capabilities[],
   *     description }
   */
  describeModule({ moduleId } = {}) {
    this._ensureIndex();
    const entry = this._index.byId.get(moduleId);
    if (!entry) return null;

    const m = entry.manifest;
    const profile = {
      moduleId:        m.id,
      type:            m.type,
      layer:           m.layer,
      runtime:         m.runtime,
      operationalRole: m.operationalRole ?? null,
      version:         m.version,
      commands:        Object.keys(m.actions?.commands ?? {}),
      emittedEvents:   Object.keys(m.actions?.events   ?? {}),
      acceptedEvents:  Object.keys(m.actions?.accepts  ?? {}),
      capabilities:    m.capabilities ?? [],
      description:     m.docs?.description ?? ""
    };

    // v5.4: Expose sleeve external boundary metadata
    if (m.type === "sleeve" && m.external) {
      profile.externalSystem    = m.external.system;
      profile.externalTransport = m.external.transport;
      profile.externalCommands  = m.external.commands ?? [];
    }

    return profile;
  }

  /**
   * dumpSurface({ layerFilter?, runtimeFilter? }) → SurfaceEntry[]
   *
   * Flat list of every capability unit in the registry — one entry per
   * command, event, or accept. Used by Interpreter to build its LLM context
   * and by Blueprint to populate its node graph.
   *
   * SurfaceEntry shape:
   *   { moduleId, surfaceType, name, description, schema }
   *   surfaceType: "command" | "emits" | "accepts"
   */
  dumpSurface({ layerFilter, runtimeFilter } = {}) {
    this._ensureIndex();
    const surface = [];

    for (const entry of this._index.modules) {
      const m = entry.manifest;

      if (layerFilter   != null && m.layer   !== layerFilter)   continue;
      if (runtimeFilter != null && m.runtime !== runtimeFilter) continue;

      for (const [name, def] of Object.entries(m.actions?.commands ?? {})) {
        surface.push({ moduleId: m.id, surfaceType: "command", name, description: def.description ?? "", schema: def });
      }
      for (const [name, def] of Object.entries(m.actions?.events ?? {})) {
        surface.push({ moduleId: m.id, surfaceType: "emits",   name, description: def.description ?? "", schema: def });
      }
      for (const [name, def] of Object.entries(m.actions?.accepts ?? {})) {
        surface.push({ moduleId: m.id, surfaceType: "accepts", name, description: def.description ?? "", schema: def });
      }
      // v5.4: Expose sleeve boundary commands as "boundary" surface entries
      if (m.type === "sleeve" && m.external?.commands) {
        for (const cmd of m.external.commands) {
          surface.push({
            moduleId:    m.id,
            surfaceType: "boundary",
            name:        cmd,
            description: `External ${m.external.system} command via ${m.external.transport}`,
            schema:      { system: m.external.system, transport: m.external.transport }
          });
        }
      }
    }

    return surface;
  }

  /**
   * whoEmits({ event }) → CandidateResult[]
   */
  whoEmits({ event } = {}) {
    return this.query({ emitsEvent: event });
  }

  /**
   * whoAccepts({ event }) → CandidateResult[]
   */
  whoAccepts({ event } = {}) {
    return this.query({ acceptsEvent: event });
  }

  /**
   * whoHandles({ command }) → CandidateResult[]
   */
  whoHandles({ command } = {}) {
    return this.query({ hasCommand: command });
  }

  /**
   * whoHasBoundary({ system }) → CandidateResult[]
   *
   * v5.4: Returns all sleeve modules whose external.system matches.
   */
  whoHasBoundary({ system } = {}) {
    return this.query({ externalSystem: system });
  }

  /**
   * rankSleeves({ capability?, limit? }) → SleeveRankEntry[]
   *
   * Amendment 3.4: live-scored ranking of all sleeve modules, filtered
   * by the given capability token if supplied. Re-reads Pulse telemetry
   * on every call so the rank reflects current health, not the stale
   * state captured at index-build time.
   *
   * Returned fields per entry:
   *   moduleId, score, scoreFactors[], system, transport, capabilities[],
   *   p95Ms, errorRatePct, faultCount
   */
  rankSleeves({ capability, limit = 10 } = {}) {
    this._ensureIndex();
    const results = [];

    for (const entry of this._index.modules) {
      const m = entry.manifest;
      if (m.type !== "sleeve") continue;
      if (capability && !(m.capabilities ?? []).includes(capability)) continue;

      const telemetry  = this._getSleeveTelemetry(m.id);
      let   score      = 10;  // base score — all known sleeves start equal
      const scoreFactors = [];

      if (telemetry) {
        if (telemetry.p95Ms != null) {
          if      (telemetry.p95Ms <  200)  { score += 3; scoreFactors.push("latency(fast)"); }
          else if (telemetry.p95Ms > 2000)  { score -= 3; scoreFactors.push("latency(slow)"); }
        }
        if (telemetry.errorRatePct != null) {
          if      (telemetry.errorRatePct > 20) { score -= 5; scoreFactors.push("errorRate(high)"); }
          else if (telemetry.errorRatePct >  5) { score -= 2; scoreFactors.push("errorRate(elevated)"); }
        }
        if (telemetry.boundaryFaultCount != null) {
          const penalty = Math.min(telemetry.boundaryFaultCount, 5);
          if (penalty > 0) { score -= penalty; scoreFactors.push(`faults(${penalty})`); }
        }
      }

      results.push({
        moduleId:     m.id,
        score,
        scoreFactors,
        system:       m.external?.system    ?? null,
        transport:    m.external?.transport ?? null,
        capabilities: m.capabilities ?? [],
        p95Ms:        telemetry?.p95Ms            ?? null,
        errorRatePct: telemetry?.errorRatePct      ?? null,
        faultCount:   telemetry?.boundaryFaultCount ?? null
      });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, Math.max(1, limit));
  }

  /**
   * getDriftPenalty({ moduleId }) → { penalty, severity, capturedAt } | null
   * Amendment 4.2: read cached Cartographer drift penalty for one module.
   */
  getDriftPenalty({ moduleId } = {}) {
    const entry = this._driftCache.get(moduleId);
    if (!entry) return null;
    if ((Date.now() - entry.capturedAt) >= this._driftCacheTtlMs) {
      this._driftCache.delete(moduleId); return null;
    }
    return entry;
  }

  /**
   * meshStatus() → MeshEntry[]
   * Amendment 4.2: full sleeve mesh view with live score, drift penalty, transport.
   */
  meshStatus() {
    this._ensureIndex();
    const results = [];
    for (const entry of this._index.modules) {
      const m = entry.manifest;
      if (m.type !== "sleeve") continue;
      const tel   = this._getSleeveTelemetry(m.id);
      const drift = this.getDriftPenalty({ moduleId: m.id });
      const { score, matchedFields } = this._score(entry, {}, false);
      results.push({
        moduleId:        m.id,
        score,
        scoreFactors:    matchedFields,
        system:          m.external?.system    ?? null,
        transport:       m.external?.transport ?? null,
        capabilities:    m.capabilities ?? [],
        p95Ms:           tel?.p95Ms           ?? null,
        errorRatePct:    tel?.errorRatePct     ?? null,
        faultCount:      tel?.boundaryFaultCount ?? null,
        driftPenalty:    drift?.penalty        ?? 0,
        driftSeverity:   drift?.severity       ?? null,
        driftCapturedAt: drift?.capturedAt     ?? null
      });
    }
    results.sort((a, b) => b.score - a.score);
    return results;
  }

  // Amendment 4.2: handle Cartographer drift events — update _driftCache
  _onDriftDetected(event) {
    const items = event.driftItems ?? [];
    const SEVERITY_PENALTY = { low: 1, medium: 3, high: 5, critical: 8 };
    for (const item of items) {
      if (!item.moduleId) continue;
      const penalty = SEVERITY_PENALTY[item.severity] ?? 0;
      this._driftCache.set(item.moduleId, {
        penalty,
        severity:    item.severity ?? "low",
        capturedAt:  Date.now()
      });
      if (penalty > 0) {
        this._emit("oracle:driftPenaltyUpdated", {
          moduleId: item.moduleId,
          penalty,
          severity: item.severity,
          source:   event.source ?? "cartographer"
        });
      }
    }
  }

  // ── Index Management ───────────────────────────────────────────

  _rebuildIndex() {
    const modules = this._getAllModules();
    const byId    = new Map();

    let commandCount = 0;
    let eventCount   = 0;

    for (const mod of modules) {
      const manifest = mod?.MANIFEST ?? mod;
      if (!manifest?.id) continue;

      const entry = { id: manifest.id, manifest };
      byId.set(manifest.id, entry);
      commandCount += Object.keys(manifest.actions?.commands ?? {}).length;
      eventCount   += Object.keys(manifest.actions?.events   ?? {}).length;
    }

    this._index = { modules: [...byId.values()], byId };

    this._emit("oracle:indexRebuilt", {
      moduleCount:  byId.size,
      commandCount,
      eventCount
    });
  }

  _ensureIndex() {
    if (!this._index) this._rebuildIndex();
  }

  _getAllModules() {
    if (!this._registry) return [];
    if (typeof this._registry.getAll === "function") return this._registry.getAll();
    if (this._registry._modules) return Object.values(this._registry._modules);
    return [];
  }

  // ── Scoring Engine ─────────────────────────────────────────────

  /**
   * _score(entry, criteria, fuzzy) → { score, matchedFields }
   *
   * Scoring weights:
   *   Exact match on primary identifier  → +10
   *   Exact match on secondary field     → +5
   *   Fuzzy (substring) match            → +2
   *   Each additional criterion matched  → cumulative
   */
  _score(entry, criteria, fuzzy) {
    const m            = entry.manifest;
    let   score        = 0;
    const matchedFields = [];

    // ── capability token ────────────────────
    if (criteria.capability) {
      const caps = m.capabilities ?? [];
      if (caps.includes(criteria.capability)) {
        score += 10; matchedFields.push("capabilities(exact)");
      } else if (fuzzy && caps.some(c => c.includes(criteria.capability))) {
        score += 2;  matchedFields.push("capabilities(fuzzy)");
      }
    }

    // ── emitted event ───────────────────────
    if (criteria.emitsEvent) {
      const events = Object.keys(m.actions?.events ?? {});
      if (events.includes(criteria.emitsEvent)) {
        score += 10; matchedFields.push("events(exact)");
      } else if (fuzzy && events.some(e => e.includes(criteria.emitsEvent))) {
        score += 2;  matchedFields.push("events(fuzzy)");
      }
    }

    // ── accepted event ──────────────────────
    if (criteria.acceptsEvent) {
      const accepts = Object.keys(m.actions?.accepts ?? {});
      if (accepts.includes(criteria.acceptsEvent)) {
        score += 10; matchedFields.push("accepts(exact)");
      } else if (fuzzy && accepts.some(a => a.includes(criteria.acceptsEvent))) {
        score += 2;  matchedFields.push("accepts(fuzzy)");
      }
    }

    // ── command name ────────────────────────
    if (criteria.hasCommand) {
      const cmds = Object.keys(m.actions?.commands ?? {});
      if (cmds.includes(criteria.hasCommand)) {
        score += 10; matchedFields.push("commands(exact)");
      } else if (fuzzy && cmds.some(c => c.includes(criteria.hasCommand))) {
        score += 2;  matchedFields.push("commands(fuzzy)");
      }
    }

    // ── operational role ────────────────────
    if (criteria.operationalRole) {
      if (m.operationalRole === criteria.operationalRole) {
        score += 10; matchedFields.push("operationalRole(exact)");
      } else if (fuzzy && (m.operationalRole ?? "").includes(criteria.operationalRole)) {
        score += 2;  matchedFields.push("operationalRole(fuzzy)");
      }
    }

    // ── runtime ─────────────────────────────
    if (criteria.runtime) {
      if (m.runtime === criteria.runtime) {
        score += 5; matchedFields.push("runtime(exact)");
      } else if (fuzzy && (m.runtime ?? "").toLowerCase().includes(criteria.runtime.toLowerCase())) {
        score += 2; matchedFields.push("runtime(fuzzy)");
      }
    }

    // ── layer ───────────────────────────────
    if (criteria.layer != null) {
      if (m.layer === criteria.layer) {
        score += 5; matchedFields.push("layer(exact)");
      }
    }

    // ── externalSystem (v5.4 sleeve) ────────
    if (criteria.externalSystem) {
      const ext = m.external?.system ?? "";
      if (ext === criteria.externalSystem) {
        score += 10; matchedFields.push("externalSystem(exact)");
      } else if (fuzzy && ext.includes(criteria.externalSystem)) {
        score += 2;  matchedFields.push("externalSystem(fuzzy)");
      }
    }

    // ── Phase 5: Sleeve telemetry scoring ───
    // For sleeve modules, adjust score by latency, error rate,
    // and stability (boundaryFault count). Lower is worse.
    if (m.type === "sleeve") {
      const telemetry = this._getSleeveTelemetry(m.id);
      if (telemetry) {
        // Latency: +3 if p95 < 200ms, -3 if p95 > 2000ms
        if (telemetry.p95Ms != null) {
          if      (telemetry.p95Ms <  200)  { score += 3; matchedFields.push("sleeve:latency(fast)"); }
          else if (telemetry.p95Ms > 2000)  { score -= 3; matchedFields.push("sleeve:latency(slow)"); }
        }
        // Error rate: -5 if >20%, -2 if >5%
        if (telemetry.errorRatePct != null) {
          if      (telemetry.errorRatePct > 20) { score -= 5; matchedFields.push("sleeve:errorRate(high)"); }
          else if (telemetry.errorRatePct >  5) { score -= 2; matchedFields.push("sleeve:errorRate(elevated)"); }
        }
        // Stability: -1 per boundary fault (capped at -5)
        if (telemetry.boundaryFaultCount != null) {
          const penalty = Math.min(telemetry.boundaryFaultCount, 5);
          if (penalty > 0) { score -= penalty; matchedFields.push(`sleeve:faults(${penalty})`); }
        }
      }
    }

    // ── Amendment 4.2: Drift penalty from Cartographer ──────────
    const drift = this._driftCache.get(m.id);
    if (drift && (Date.now() - drift.capturedAt) < this._driftCacheTtlMs) {
      if (drift.penalty > 0) { score -= drift.penalty; matchedFields.push(`drift:${drift.severity}(-${drift.penalty})`); }
    } else if (drift) {
      this._driftCache.delete(m.id);  // evict stale entry
    }

    return { score, matchedFields };
  }

  _getSleeveTelemetry(moduleId) {
    // Resolve Pulse lazily so Oracle stays Universal-runtime
    if (!this._pulse && this._registry) {
      try { this._pulse = this._registry.get?.("Pulse.workflow"); } catch (_) {}
    }
    if (!this._pulse?.getModuleProfile) return null;
    try {
      const profile = this._pulse.getModuleProfile({ moduleId });
      const data    = profile?.data ?? {};
      return {
        p95Ms:             data.p95           ?? null,
        errorRatePct:      data.errorRatePct  ?? null,
        boundaryFaultCount: data.boundaryFaultCount ?? null
      };
    } catch (_) { return null; }
  }

  // ── EventBus Wiring ────────────────────────────────────────────

  _subscribeEventBus() {
    const bus = this._getBus();
    if (!bus) return;

    const onRegistered   = () => this._rebuildIndex();
    const onDeregistered = () => this._rebuildIndex();
    // Amendment 4.2: drift signals from Cartographer populate _driftCache
    const onDrift        = (e) => this._onDriftDetected(e);

    bus.on("registry:moduleRegistered",   onRegistered);
    bus.on("registry:moduleDeregistered", onDeregistered);
    bus.on("cartographer:modelDrift",     onDrift);
    bus.on("cartographer:boundaryDrift",  onDrift);

    this._busUnsub = [
      () => bus.off?.("registry:moduleRegistered",   onRegistered),
      () => bus.off?.("registry:moduleDeregistered", onDeregistered),
      () => bus.off?.("cartographer:modelDrift",     onDrift),
      () => bus.off?.("cartographer:boundaryDrift",  onDrift)
    ];
  }

  _unsubscribeEventBus() {
    this._busUnsub.forEach(fn => fn());
    this._busUnsub = [];
  }

  _getBus() {
    // Universal runtime: try registry first, then browser global
    return this._registry?.get?.("EventBus.service")
        ?? (typeof window !== "undefined" ? window.EventBus : null);
  }

  _emit(eventName, payload) {
    try { this._getBus()?.emit?.(eventName, payload); } catch (_) {}
  }
}

module.exports = OracleService;
