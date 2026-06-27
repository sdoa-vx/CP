// ──────────────────────────────────────────────────────────────────
// File:    Pulse.workflow.js
// Version: 5.0.0
// Updated: 2026-06-17T00:00:00Z
// Changes: Relocated to canonical sdoavx/ structure; fixed require path for ResponseFormatter
// ──────────────────────────────────────────────────────────────────
// Last modified: 2026-06-01 00:00 UTC
// Pulse.workflow.js — SDOA v5.0 Workflow (NodeJS)
// Validated by: ProbationOfficer.workflow.rs
//
// Change log:
//   5.0.0 — Initial implementation. Telemetry aggregator for the live portfolio.
//            Intercepts EventBus command invocations via Chronicle or direct hooks,
//            records per-module latency samples, computes rolling p50/p95/p99
//            percentiles, tracks error rates, event throughput, and memory footprint.
//            Writes structured snapshots to the telemetry store for Triage to query.

"use strict";

const ResponseFormatter = require('../services/ResponseFormatter.service');

// ── Percentile calculator ────────────────────────────────────────
function percentile(sortedArr, p) {
  if (!sortedArr.length) return 0;
  const idx = Math.ceil((p / 100) * sortedArr.length) - 1;
  return sortedArr[Math.max(0, idx)];
}

class PulseWorkflow {
  static MANIFEST = {
    // ── Identity ──────────────────────────────
    id:              "Pulse.workflow",
    type:            "workflow",
    layer:           3,
    runtime:         "NodeJS",
    version:         "5.0.0",
    operationalRole: "savant",

    // ── Dependencies ──────────────────────────
    requires:  [
      "Chronicle.service",
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
          description: "Take a full telemetry snapshot across all tracked modules and write it to the store. Called by Triage on a schedule or on-demand.",
          input:  { flush: "boolean?" },
          output: "object"   // TelemetrySnapshot
        },
        recordSample: {
          description: "Record a single latency sample for a module command. Called by middleware hooks.",
          input: {
            moduleId:   "string",
            commandId:  "string",
            durationMs: "number",
            success:    "boolean"
          },
          output: "void"
        },
        getModuleProfile: {
          description: "Return the current telemetry profile for a single module.",
          input:  { moduleId: "string" },
          output: "object"   // ModuleProfile
        },
        getTopByLatency: {
          description: "Return the N modules with the highest p95 command latency.",
          input:  { n: "number?", percentileTarget: "number?" },
          output: "object[]"
        },
        getTopByErrorRate: {
          description: "Return the N modules with the highest error rate (errors / total calls).",
          input:  { n: "number?", threshold: "number?" },
          output: "object[]"
        },
        getRuntimeComparison: {
          description: "Compare average p95 latency across runtimes (NodeJS, Rust, Python, Browser).",
          input:  {},
          output: "object"   // { [runtime]: { p50, p95, p99, sampleCount } }
        },
        reset: {
          description: "Clear all telemetry samples. Does not clear the persistent snapshot store.",
          input:  {},
          output: "void"
        }
      },
      events: {
        "pulse:snapshotTaken": {
          payload: { snapshotId: "string", moduleCount: "number", sampleCount: "number", takenAt: "string" }
        },
        "pulse:anomalyDetected": {
          payload: { moduleId: "string", metric: "string", value: "number", threshold: "number" }
        },
        "pulse:runtimeRanked": {
          payload: { ranking: "object[]" }
        }
      },
      accepts: {
        "chronicle:entryRecorded": {
          description: "Intercepts Chronicle command entries to auto-extract latency samples."
        },
        "interpreter:dispatched": {
          description: "Records Interpreter dispatch latency as a Pulse sample."
        }
      },
      slots: {}
    },

    docs: {
      description: "Telemetry aggregator. Collects per-module command latency samples (p50/p95/p99), error rates, event bus throughput, and memory footprint per runtime. Writes structured snapshots to an in-memory time-series store. Feeds Triage.workflow.js with real performance fingerprints so routing decisions are data-driven rather than heuristic.",
      author: "ProtoAI Core Architecture Group",
      sdoa:   "5.0.0"
    }
  };

  // ── Private State ─────────────────────────────────────────────
  _chronicle  = null;
  _oracle     = null;
  _registry   = null;
  _busUnsub   = [];
  _snapshotSeq = 0;

  // Per-module sample buckets
  // Map<moduleId, { latencies: number[], errors: number, total: number, lastSeen: string }>
  _samples = new Map();

  // Per-event throughput counters  Map<eventName, number>
  _eventCounts = new Map();

  // Snapshot store (rolling, capped at 100)
  _snapshots = [];

  // Anomaly thresholds (configurable)
  _thresholds = {
    p95LatencyMs:  500,    // alert if p95 > 500ms
    errorRatePct:  10,     // alert if error rate > 10%
    minSamples:    5       // minimum samples before anomaly detection kicks in
  };

  // ── Lifecycle ──────────────────────────────────────────────────

  async init(registry) {
    this._registry  = registry;
    this._chronicle = registry.get("Chronicle.service");
    this._oracle    = registry.get("Oracle.service");
  }

  async run(payload) {
    const { flush = false } = payload ?? {};

    // Wire EventBus intercepts on first run
    this._subscribeEventBus();

    const snapshot = this._buildSnapshot();
    this._storeSnapshot(snapshot);

    if (flush) this._samples.clear();

    this._emit("pulse:snapshotTaken", {
      snapshotId:  snapshot.id,
      moduleCount: snapshot.modules.length,
      sampleCount: snapshot.totalSamples,
      takenAt:     snapshot.takenAt
    });

    // Runtime ranking after snapshot
    const ranking = this._computeRuntimeRanking(snapshot);
    if (ranking.length > 0) {
      this._emit("pulse:runtimeRanked", { ranking });
    }

    return ResponseFormatter.ok({ snapshot });
  }

  async dispose() {
    this._unsubscribeEventBus();
    this._samples.clear();
    this._eventCounts.clear();
    this._chronicle = null;
    this._oracle    = null;
  }

  // ── Public Commands ────────────────────────────────────────────

  recordSample({ moduleId, commandId, durationMs, success }) {
    if (!moduleId) return;
    const key = `${moduleId}::${commandId ?? "*"}`;
    if (!this._samples.has(key)) {
      this._samples.set(key, { moduleId, commandId, latencies: [], errors: 0, total: 0, lastSeen: null });
    }
    const bucket = this._samples.get(key);
    bucket.latencies.push(durationMs);
    bucket.total++;
    if (!success) bucket.errors++;
    bucket.lastSeen = new Date().toISOString();

    // Keep latency window at 1000 samples max per bucket
    if (bucket.latencies.length > 1000) bucket.latencies.shift();

    // Anomaly check
    this._checkAnomaly(moduleId, bucket);
  }

  getModuleProfile({ moduleId }) {
    const profiles = this._buildModuleProfiles();
    const found    = profiles.find(p => p.moduleId === moduleId);
    return ResponseFormatter.ok(found ?? null);
  }

  getTopByLatency({ n = 5, percentileTarget = 95 } = {}) {
    const profiles = this._buildModuleProfiles();
    const key      = `p${percentileTarget}`;
    const sorted   = profiles
      .filter(p => p.sampleCount >= this._thresholds.minSamples)
      .sort((a, b) => (b[key] ?? 0) - (a[key] ?? 0))
      .slice(0, n);
    return ResponseFormatter.ok({ modules: sorted, percentileTarget });
  }

  getTopByErrorRate({ n = 5, threshold = 0 } = {}) {
    const profiles = this._buildModuleProfiles();
    const sorted   = profiles
      .filter(p => p.sampleCount >= this._thresholds.minSamples && p.errorRatePct > threshold)
      .sort((a, b) => b.errorRatePct - a.errorRatePct)
      .slice(0, n);
    return ResponseFormatter.ok({ modules: sorted });
  }

  getRuntimeComparison() {
    const byRuntime = new Map();

    // Pull runtime info from Oracle
    const surface = this._oracle?.dumpSurface({}) ?? [];
    const runtimeMap = new Map(); // moduleId → runtime
    for (const entry of surface) {
      if (entry.schema?.runtime) runtimeMap.set(entry.moduleId, entry.schema.runtime);
    }

    for (const [key, bucket] of this._samples) {
      const runtime = runtimeMap.get(bucket.moduleId) ?? "Unknown";
      if (!byRuntime.has(runtime)) {
        byRuntime.set(runtime, { latencies: [], errors: 0, total: 0 });
      }
      const agg = byRuntime.get(runtime);
      agg.latencies.push(...bucket.latencies);
      agg.errors += bucket.errors;
      agg.total  += bucket.total;
    }

    const comparison = {};
    for (const [runtime, agg] of byRuntime) {
      const sorted = [...agg.latencies].sort((a, b) => a - b);
      comparison[runtime] = {
        p50:          percentile(sorted, 50),
        p95:          percentile(sorted, 95),
        p99:          percentile(sorted, 99),
        sampleCount:  agg.total,
        errorRatePct: agg.total > 0 ? Math.round((agg.errors / agg.total) * 100 * 10) / 10 : 0
      };
    }

    return ResponseFormatter.ok({ comparison });
  }

  reset() {
    this._samples.clear();
    this._eventCounts.clear();
  }

  // ── Snapshot Building ──────────────────────────────────────────

  _buildSnapshot() {
    const takenAt = new Date().toISOString();
    const id      = `pulse-${++this._snapshotSeq}-${Date.now()}`;
    const modules = this._buildModuleProfiles();
    const eventThroughput = Object.fromEntries(this._eventCounts);
    const totalSamples = modules.reduce((acc, m) => acc + m.sampleCount, 0);

    // Memory usage (Node.js process-level)
    const memRaw = process.memoryUsage?.() ?? {};
    const memory = {
      heapUsedMb:  Math.round((memRaw.heapUsed  ?? 0) / 1024 / 1024 * 10) / 10,
      heapTotalMb: Math.round((memRaw.heapTotal ?? 0) / 1024 / 1024 * 10) / 10,
      rssMb:       Math.round((memRaw.rss       ?? 0) / 1024 / 1024 * 10) / 10,
      externalMb:  Math.round((memRaw.external  ?? 0) / 1024 / 1024 * 10) / 10
    };

    return { id, takenAt, modules, eventThroughput, totalSamples, memory };
  }

  _buildModuleProfiles() {
    const profiles = [];
    for (const [, bucket] of this._samples) {
      const sorted = [...bucket.latencies].sort((a, b) => a - b);
      profiles.push({
        moduleId:     bucket.moduleId,
        commandId:    bucket.commandId,
        sampleCount:  bucket.total,
        p50:          percentile(sorted, 50),
        p95:          percentile(sorted, 95),
        p99:          percentile(sorted, 99),
        min:          sorted[0] ?? 0,
        max:          sorted[sorted.length - 1] ?? 0,
        avg:          sorted.length ? Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length) : 0,
        errorCount:   bucket.errors,
        errorRatePct: bucket.total > 0 ? Math.round((bucket.errors / bucket.total) * 100 * 10) / 10 : 0,
        lastSeen:     bucket.lastSeen
      });
    }
    return profiles.sort((a, b) => b.p95 - a.p95);
  }

  _computeRuntimeRanking(snapshot) {
    const byRuntime = new Map();
    for (const m of snapshot.modules) {
      const rt = "Unknown";
      if (!byRuntime.has(rt)) byRuntime.set(rt, { p95s: [], count: 0 });
      byRuntime.get(rt).p95s.push(m.p95);
      byRuntime.get(rt).count++;
    }
    return [...byRuntime.entries()]
      .map(([runtime, { p95s, count }]) => ({
        runtime,
        avgP95: Math.round(p95s.reduce((a, b) => a + b, 0) / (p95s.length || 1)),
        moduleCount: count
      }))
      .sort((a, b) => a.avgP95 - b.avgP95);
  }

  _storeSnapshot(snapshot) {
    this._snapshots.push(snapshot);
    if (this._snapshots.length > 100) this._snapshots.shift();
  }

  // ── Anomaly Detection ──────────────────────────────────────────

  _checkAnomaly(moduleId, bucket) {
    if (bucket.total < this._thresholds.minSamples) return;

    const sorted = [...bucket.latencies].sort((a, b) => a - b);
    const p95    = percentile(sorted, 95);

    if (p95 > this._thresholds.p95LatencyMs) {
      this._emit("pulse:anomalyDetected", {
        moduleId, metric: "p95_latency_ms",
        value: p95, threshold: this._thresholds.p95LatencyMs
      });
    }

    const errorRate = (bucket.errors / bucket.total) * 100;
    if (errorRate > this._thresholds.errorRatePct) {
      this._emit("pulse:anomalyDetected", {
        moduleId, metric: "error_rate_pct",
        value: Math.round(errorRate * 10) / 10,
        threshold: this._thresholds.errorRatePct
      });
    }
  }

  // ── EventBus Intercepts ────────────────────────────────────────

  _subscribeEventBus() {
    if (this._busUnsub.length > 0) return; // already subscribed
    const bus = this._registry?.get?.("EventBus.service");
    if (!bus) return;

    const onChronicle = (entry) => {
      if (!entry?.type?.startsWith("command:")) return;
      const parts = entry.type.replace("command:", "").split(".");
      if (parts.length >= 2) {
        this.recordSample({
          moduleId:   parts.slice(0, -1).join("."),
          commandId:  parts[parts.length - 1],
          durationMs: 0,
          success:    true
        });
      }
    };

    const onAnyEvent = (eventName) => {
      this._eventCounts.set(eventName, (this._eventCounts.get(eventName) ?? 0) + 1);
    };

    const onInterpreterDispatch = ({ resolvedModule, resolvedCommand, durationMs }) => {
      if (resolvedModule && durationMs != null) {
        this.recordSample({ moduleId: resolvedModule, commandId: resolvedCommand, durationMs, success: true });
      }
    };

    bus.on("chronicle:entryRecorded", onChronicle);
    bus.on("interpreter:dispatched",  onInterpreterDispatch);

    if (bus.onAny) {
      bus.onAny(onAnyEvent);
      this._busUnsub.push(() => bus.offAny?.(onAnyEvent));
    }

    this._busUnsub.push(
      () => bus.off?.("chronicle:entryRecorded", onChronicle),
      () => bus.off?.("interpreter:dispatched",  onInterpreterDispatch)
    );
  }

  _unsubscribeEventBus() {
    this._busUnsub.forEach(fn => fn());
    this._busUnsub = [];
  }

  _emit(eventName, payload) {
    try {
      const bus = this._registry?.get?.("EventBus.service");
      bus?.emit?.(eventName, payload);
    } catch (_) {}
  }
}

module.exports = PulseWorkflow;
