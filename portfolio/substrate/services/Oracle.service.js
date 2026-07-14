// ──────────────────────────────────────────────────────────────────
// File:    Oracle.service.js
// Version: 6.0.0
// Updated: 2026-07-13T00:00:00Z
// Changes: Phase 5 (oversized-file split) — extracted the sleeve mesh
//          subsystem (telemetry scoring, drift-penalty cache, rankSleeves,
//          meshStatus) into OracleSleeveMesh.service.js. Oracle now
//          composes it via constructor injection and delegates the
//          sleeve-facing commands. Public API is unchanged.
// Previous: Amendment 4.2 — Autonomous Routing Mesh.
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

const OracleSleeveMesh = require("./OracleSleeveMesh.service");

class OracleService {
  static MANIFEST = {
    id:           "Oracle.service",
    type:         "service",
    layer:        3,
    runtime:      "Universal",
    version:      "6.0.0",
    capabilities: ["oracle.query", "oracle.describeModule", "oracle.dumpSurface", "oracle.sleeveMesh"],
    dependencies: ["OracleSleeveMesh.service"],
    docs: {
      description: "Capability query sovereign — scans the live registry manifest surface to answer 'who can handle X / emits Y / accepts Z / has capability C', returning scored ranked candidates. Sleeve mesh scoring/ranking is delegated to OracleSleeveMesh.service.",
      author: "ProtoAI team"
    },
    last_modified: "2026-07-13T00:00:00Z"
  };

  // ── Private State ─────────────────────────────────────────────
  _registry      = null;
  _index         = null;
  _busUnsub      = [];
  _queryCounter  = 0;
  _mesh          = new OracleSleeveMesh({ getRegistry: () => this._registry });

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
   * Delegates to OracleSleeveMesh — see that module for scoring detail.
   */
  rankSleeves({ capability, limit = 10 } = {}) {
    this._ensureIndex();
    return this._mesh.rankSleeves({ modules: this._index.modules, capability, limit });
  }

  /**
   * getDriftPenalty({ moduleId }) → { penalty, severity, capturedAt } | null
   * Delegates to OracleSleeveMesh.
   */
  getDriftPenalty({ moduleId } = {}) {
    return this._mesh.getDriftPenalty({ moduleId });
  }

  /**
   * meshStatus() → MeshEntry[]
   * Delegates to OracleSleeveMesh, passing this._score as the scoring
   * function so mesh entries use the same score query() would produce.
   */
  meshStatus() {
    this._ensureIndex();
    return this._mesh.meshStatus({
      modules: this._index.modules,
      scoreFn: (entry) => this._score(entry, {}, false)
    });
  }

  // Amendment 4.2: handle Cartographer drift events — delegates cache
  // update to OracleSleeveMesh, passing our own _emit through so the
  // oracle:driftPenaltyUpdated event still fires from Oracle.
  _onDriftDetected(event) {
    this._mesh.onDriftDetected(event, (name, payload) => this._emit(name, payload));
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
   *
   * Sleeve telemetry and drift-penalty adjustments are delegated to
   * OracleSleeveMesh — see telemetryScoreAdjustment / driftScoreAdjustment.
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

    // ── Phase 5 Item 6: Sleeve telemetry scoring (delegated) ────
    if (m.type === "sleeve") {
      const adj = this._mesh.telemetryScoreAdjustment(m);
      score += adj.delta;
      matchedFields.push(...adj.matchedFields);
    }

    // ── Amendment 4.2: Drift penalty from Cartographer (delegated) ──
    const drift = this._mesh.driftScoreAdjustment(m.id);
    score += drift.delta;
    matchedFields.push(...drift.matchedFields);

    return { score, matchedFields };
  }

  // ── EventBus Wiring ────────────────────────────────────────────

  _subscribeEventBus() {
    const bus = this._getBus();
    if (!bus) return;

    const onRegistered   = () => this._rebuildIndex();
    const onDeregistered = () => this._rebuildIndex();
    // Amendment 4.2: drift signals from Cartographer populate the mesh's drift cache
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
