// ──────────────────────────────────────────────────────────────────
// File:    OracleSleeveMesh.service.js
// Version: 1.0.0
// Updated: 2026-07-13T00:00:00Z
// Changes: Extracted from Oracle.service.js (Phase 5 — oversized-file
//          split). Owns the sleeve mesh subsystem: live telemetry-based
//          scoring, drift-penalty caching (Amendment 4.2), and sleeve
//          ranking/mesh-status views (Amendment 3.4/4.2).
// ──────────────────────────────────────────────────────────────────
// OracleSleeveMesh.service.js — SDOA v5 Service (Universal)
//
// Oracle.service.js owns the base capability index and scoring engine.
// This module owns everything specific to "sleeve" modules: live Pulse
// telemetry lookups, drift-penalty caching populated by Cartographer
// events, and the two sleeve-facing read views (rankSleeves, meshStatus).
//
// Oracle composes this via constructor injection (getRegistry callback)
// rather than reaching into Oracle's internals — sovereignty boundary
// stays clean in both directions.

"use strict";

class OracleSleeveMesh {
  static MANIFEST = {
    id:           "OracleSleeveMesh.service",
    type:         "service",
    layer:        3,
    runtime:      "Universal",
    version:      "1.0.0",
    capabilities: ["oracle.sleeveMesh.rank", "oracle.sleeveMesh.status", "oracle.sleeveMesh.driftTracking"],
    dependencies: [],
    docs: {
      description: "Sleeve mesh subsystem for Oracle.service — live Pulse telemetry scoring, Cartographer drift-penalty caching, sleeve ranking and mesh-status views. Extracted from Oracle.service.js as part of the Phase 5 oversized-file split.",
      author: "ProtoAI team"
    },
    last_modified: "2026-07-13T00:00:00Z"
  };

  /**
   * @param {Object} opts
   * @param {() => object|null} opts.getRegistry - returns the current registry
   *   (Oracle sets its own _registry in init(), which happens after this
   *   constructor runs, so this is a callback rather than a direct value).
   */
  constructor({ getRegistry } = {}) {
    this._getRegistry = getRegistry ?? (() => null);
    this._pulse       = null;   // resolved lazily — not all runtimes have Pulse
    this._driftCache  = new Map();   // moduleId → { penalty, severity, capturedAt }
    this._driftCacheTtlMs = 5 * 60 * 1000;  // 5 min; stale entries cleared on read
  }

  // ── Drift Cache (Amendment 4.2) ─────────────────────────────────

  /**
   * getDriftPenalty({ moduleId }) → { penalty, severity, capturedAt } | null
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
   * onDriftDetected(event, emit) — handle Cartographer drift events and
   * update the drift cache. `emit` is Oracle's own emit function, called
   * here so drift events still surface as oracle:driftPenaltyUpdated.
   */
  onDriftDetected(event, emit) {
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
      if (penalty > 0 && typeof emit === "function") {
        emit("oracle:driftPenaltyUpdated", {
          moduleId: item.moduleId,
          penalty,
          severity: item.severity,
          source:   event.source ?? "cartographer"
        });
      }
    }
  }

  /**
   * driftScoreAdjustment(moduleId) → { delta, matchedFields }
   * Ungated by module type — mirrors the original Oracle._score behavior,
   * which applied drift penalty to any module present in the cache.
   */
  driftScoreAdjustment(moduleId) {
    const drift = this._driftCache.get(moduleId);
    if (drift && (Date.now() - drift.capturedAt) < this._driftCacheTtlMs) {
      if (drift.penalty > 0) {
        return { delta: -drift.penalty, matchedFields: [`drift:${drift.severity}(-${drift.penalty})`] };
      }
      return { delta: 0, matchedFields: [] };
    }
    if (drift) this._driftCache.delete(moduleId);  // evict stale entry
    return { delta: 0, matchedFields: [] };
  }

  // ── Telemetry ────────────────────────────────────────────────────

  _getSleeveTelemetry(moduleId) {
    // Resolve Pulse lazily so Oracle stays Universal-runtime
    const registry = this._getRegistry();
    if (!this._pulse && registry) {
      try { this._pulse = registry.get?.("Pulse.workflow"); } catch (_) {}
    }
    if (!this._pulse?.getModuleProfile) return null;
    try {
      const profile = this._pulse.getModuleProfile({ moduleId });
      const data    = profile?.data ?? {};
      return {
        p95Ms:              data.p95            ?? null,
        errorRatePct:       data.errorRatePct   ?? null,
        boundaryFaultCount: data.boundaryFaultCount ?? null
      };
    } catch (_) { return null; }
  }

  /**
   * telemetryScoreAdjustment(manifest) → { delta, matchedFields }
   * Caller (Oracle._score) only invokes this for m.type === "sleeve",
   * mirroring the original inline gate.
   */
  telemetryScoreAdjustment(manifest) {
    const telemetry = this._getSleeveTelemetry(manifest.id);
    let   delta      = 0;
    const matchedFields = [];
    if (telemetry) {
      if (telemetry.p95Ms != null) {
        if      (telemetry.p95Ms <  200)  { delta += 3; matchedFields.push("sleeve:latency(fast)"); }
        else if (telemetry.p95Ms > 2000)  { delta -= 3; matchedFields.push("sleeve:latency(slow)"); }
      }
      if (telemetry.errorRatePct != null) {
        if      (telemetry.errorRatePct > 20) { delta -= 5; matchedFields.push("sleeve:errorRate(high)"); }
        else if (telemetry.errorRatePct >  5) { delta -= 2; matchedFields.push("sleeve:errorRate(elevated)"); }
      }
      if (telemetry.boundaryFaultCount != null) {
        const penalty = Math.min(telemetry.boundaryFaultCount, 5);
        if (penalty > 0) { delta -= penalty; matchedFields.push(`sleeve:faults(${penalty})`); }
      }
    }
    return { delta, matchedFields };
  }

  // ── Sleeve Views (Amendment 3.4 / 4.2) ──────────────────────────

  /**
   * rankSleeves({ modules, capability?, limit? }) → SleeveRankEntry[]
   * `modules` is Oracle's current index.modules array.
   */
  rankSleeves({ modules = [], capability, limit = 10 } = {}) {
    const results = [];

    for (const entry of modules) {
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
        p95Ms:        telemetry?.p95Ms             ?? null,
        errorRatePct: telemetry?.errorRatePct      ?? null,
        faultCount:   telemetry?.boundaryFaultCount ?? null
      });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, Math.max(1, limit));
  }

  /**
   * meshStatus({ modules, scoreFn }) → MeshEntry[]
   * `scoreFn(entry)` is Oracle's own _score bound to (entry, {}, false) —
   * meshStatus needs the same base+drift score Oracle computes for
   * query(), so it's passed in rather than duplicated here.
   */
  meshStatus({ modules = [], scoreFn } = {}) {
    const results = [];
    for (const entry of modules) {
      const m = entry.manifest;
      if (m.type !== "sleeve") continue;
      const tel   = this._getSleeveTelemetry(m.id);
      const drift = this.getDriftPenalty({ moduleId: m.id });
      const { score, matchedFields } = typeof scoreFn === "function"
        ? scoreFn(entry)
        : { score: 0, matchedFields: [] };
      results.push({
        moduleId:        m.id,
        score,
        scoreFactors:    matchedFields,
        system:          m.external?.system    ?? null,
        transport:       m.external?.transport ?? null,
        capabilities:    m.capabilities ?? [],
        p95Ms:           tel?.p95Ms            ?? null,
        errorRatePct:    tel?.errorRatePct      ?? null,
        faultCount:      tel?.boundaryFaultCount ?? null,
        driftPenalty:    drift?.penalty        ?? 0,
        driftSeverity:   drift?.severity       ?? null,
        driftCapturedAt: drift?.capturedAt     ?? null
      });
    }
    results.sort((a, b) => b.score - a.score);
    return results;
  }
}

module.exports = OracleSleeveMesh;
