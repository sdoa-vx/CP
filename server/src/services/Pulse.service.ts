import { emit, subscribe, subscribeAll, unsubscribe, unsubscribeAll } from "../engine/events";

import fs from "fs";
import path from "path";

export interface RuntimeOracle {
  getRuntimeForModule(moduleId: string): string;
}

export class ManifestRuntimeOracle implements RuntimeOracle {
  getRuntimeForModule(moduleId: string): string {
    if (moduleId.endsWith(".service") || moduleId.includes("engine")) return "TypeScript";
    
    const tryTs = path.join(process.cwd(), "portfolio", "substrate", `${moduleId}.ts`);
    const tryJs = path.join(process.cwd(), "portfolio", "substrate", `${moduleId}.js`);
    
    if (fs.existsSync(tryTs)) return "TypeScript";
    if (fs.existsSync(tryJs)) return "JavaScript";
    
    return "TypeScript"; // default to engine runtime
  }
}


function percentile(sortedArr: number[], p: number) {
  if (!sortedArr.length) return 0;
  const idx = Math.ceil((p / 100) * sortedArr.length) - 1;
  return sortedArr[Math.max(0, idx)];
}

export interface PulseSampleBucket {
  moduleId: string;
  commandId: string;
  latencies: number[];
  errors: number;
  total: number;
  lastSeen: string | null;
}

export class PulseService {
  static MANIFEST = {
    id: "Pulse.workflow",
    type: "workflow",
    layer: 3,
    runtime: "TypeScript",
    version: "5.0.0",
    operationalRole: "savant"
  };

  private _busUnsub: Array<() => void> = [];
  private _snapshotSeq = 0;
  private _samples = new Map<string, PulseSampleBucket>();
  private _eventCounts = new Map<string, number>();
  private _snapshots: any[] = [];
  private _oracle: RuntimeOracle = new ManifestRuntimeOracle();

  private _thresholds = {
    p95LatencyMs: 500,
    errorRatePct: 10,
    minSamples: 5
  };

  async init() {
    // Pulse initiates passively, no explicit setup needed here
  }

  async run(payload?: { flush?: boolean }) {
    const { flush = false } = payload ?? {};

    this._subscribeEventBus();

    const snapshot = this._buildSnapshot();
    this._storeSnapshot(snapshot);

    if (flush) this._samples.clear();

    try {
      emit("pulse:snapshotTaken", {
        snapshotId: snapshot.id,
        moduleCount: snapshot.modules.length,
        sampleCount: snapshot.totalSamples,
        takenAt: snapshot.takenAt
      });

      const ranking = this._computeRuntimeRanking(snapshot);
      if (ranking.length > 0) {
        emit("pulse:runtimeRanked", { ranking });
      }
    } catch (_) {}

    return { snapshot };
  }

  async dispose() {
    this._unsubscribeEventBus();
    this._samples.clear();
    this._eventCounts.clear();
  }

  recordSample({ moduleId, commandId, durationMs, success }: { moduleId: string, commandId: string, durationMs: number, success: boolean }) {
    if (!moduleId) return;
    const key = `${moduleId}::${commandId ?? "*"}`;
    if (!this._samples.has(key)) {
      this._samples.set(key, { moduleId, commandId, latencies: [], errors: 0, total: 0, lastSeen: null });
    }
    const bucket = this._samples.get(key)!;
    bucket.latencies.push(durationMs);
    bucket.total++;
    if (!success) bucket.errors++;
    bucket.lastSeen = new Date().toISOString();

    if (bucket.latencies.length > 1000) bucket.latencies.shift();

    this._checkAnomaly(moduleId, bucket);
  }

  getModuleProfile({ moduleId }: { moduleId: string }) {
    const profiles = this._buildModuleProfiles();
    const found = profiles.find(p => p.moduleId === moduleId);
    return found ?? null;
  }

  getTopByLatency({ n = 5, percentileTarget = 95 } = {}) {
    const profiles = this._buildModuleProfiles();
    const key = `p${percentileTarget}` as keyof typeof profiles[0];
    const sorted = profiles
      .filter(p => p.sampleCount >= this._thresholds.minSamples)
      .sort((a, b) => ((b as any)[key] ?? 0) - ((a as any)[key] ?? 0))
      .slice(0, n);
    return { modules: sorted, percentileTarget };
  }

  getTopByErrorRate({ n = 5, threshold = 0 } = {}) {
    const profiles = this._buildModuleProfiles();
    const sorted = profiles
      .filter(p => p.sampleCount >= this._thresholds.minSamples && p.errorRatePct > threshold)
      .sort((a, b) => b.errorRatePct - a.errorRatePct)
      .slice(0, n);
    return { modules: sorted };
  }

  getRuntimeComparison() {
    const byRuntime = new Map<string, { latencies: number[], errors: number, total: number }>();

    for (const [key, bucket] of this._samples) {
      const runtime = this._oracle.getRuntimeForModule(bucket.moduleId);
      if (!byRuntime.has(runtime)) {
        byRuntime.set(runtime, { latencies: [], errors: 0, total: 0 });
      }
      const agg = byRuntime.get(runtime)!;
      agg.latencies.push(...bucket.latencies);
      agg.errors += bucket.errors;
      agg.total += bucket.total;
    }

    const comparison: Record<string, any> = {};
    for (const [runtime, agg] of byRuntime) {
      const sorted = [...agg.latencies].sort((a, b) => a - b);
      comparison[runtime] = {
        p50: percentile(sorted, 50),
        p95: percentile(sorted, 95),
        p99: percentile(sorted, 99),
        sampleCount: agg.total,
        errorRatePct: agg.total > 0 ? Math.round((agg.errors / agg.total) * 100 * 10) / 10 : 0
      };
    }

    return { comparison };
  }

  reset() {
    this._samples.clear();
    this._eventCounts.clear();
  }

  getSnapshot() {
    return this._snapshots.length > 0 ? this._snapshots[this._snapshots.length - 1] : null;
  }

  private _buildSnapshot() {
    const takenAt = new Date().toISOString();
    const id = `pulse-${++this._snapshotSeq}-${Date.now()}`;
    const modules = this._buildModuleProfiles();
    const eventThroughput = Object.fromEntries(this._eventCounts);
    const totalSamples = modules.reduce((acc, m) => acc + m.sampleCount, 0);

    const memRaw = process.memoryUsage?.() ?? { heapUsed: 0, heapTotal: 0, rss: 0, external: 0 };
    const memory = {
      heapUsedMb: Math.round((memRaw.heapUsed ?? 0) / 1024 / 1024 * 10) / 10,
      heapTotalMb: Math.round((memRaw.heapTotal ?? 0) / 1024 / 1024 * 10) / 10,
      rssMb: Math.round((memRaw.rss ?? 0) / 1024 / 1024 * 10) / 10,
      externalMb: Math.round((memRaw.external ?? 0) / 1024 / 1024 * 10) / 10
    };

    return { id, takenAt, modules, eventThroughput, totalSamples, memory };
  }

  private _buildModuleProfiles() {
    const profiles = [];
    for (const [, bucket] of this._samples) {
      const sorted = [...bucket.latencies].sort((a, b) => a - b);
      profiles.push({
        moduleId: bucket.moduleId,
        commandId: bucket.commandId,
        sampleCount: bucket.total,
        p50: percentile(sorted, 50),
        p95: percentile(sorted, 95),
        p99: percentile(sorted, 99),
        min: sorted[0] ?? 0,
        max: sorted[sorted.length - 1] ?? 0,
        avg: sorted.length ? Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length) : 0,
        errorCount: bucket.errors,
        errorRatePct: bucket.total > 0 ? Math.round((bucket.errors / bucket.total) * 100 * 10) / 10 : 0,
        lastSeen: bucket.lastSeen
      });
    }
    return profiles.sort((a, b) => b.p95 - a.p95);
  }

  private _computeRuntimeRanking(snapshot: any) {
    const byRuntime = new Map<string, { p95s: number[], count: number }>();
    for (const m of snapshot.modules) {
      const rt = "Unknown";
      if (!byRuntime.has(rt)) byRuntime.set(rt, { p95s: [], count: 0 });
      byRuntime.get(rt)!.p95s.push(m.p95);
      byRuntime.get(rt)!.count++;
    }
    return [...byRuntime.entries()]
      .map(([runtime, { p95s, count }]) => ({
        runtime,
        avgP95: Math.round(p95s.reduce((a, b) => a + b, 0) / (p95s.length || 1)),
        moduleCount: count
      }))
      .sort((a, b) => a.avgP95 - b.avgP95);
  }

  private _storeSnapshot(snapshot: any) {
    this._snapshots.push(snapshot);
    if (this._snapshots.length > 100) this._snapshots.shift();
  }

  private _checkAnomaly(moduleId: string, bucket: PulseSampleBucket) {
    if (bucket.total < this._thresholds.minSamples) return;

    // Statistical Drift Engine (Z-score approach)
    const latencies = bucket.latencies;
    const mean = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const variance = latencies.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / latencies.length;
    const stdDev = Math.sqrt(variance);

    const latest = latencies[latencies.length - 1];
    
    // Calculate Z-Score
    if (stdDev > 0) {
      const zScore = (latest - mean) / stdDev;
      if (zScore > 2.0) { // More than 2 standard deviations = anomaly
         try {
           emit("pulse:anomalyDetected", {
             moduleId, 
             metric: "latency_zscore",
             severity: zScore > 3.0 ? "high" : "medium",
             value: Math.round(zScore * 100) / 100, 
             threshold: 2.0
           });
         } catch (_) {}
      }
    }

    const errorRate = (bucket.errors / bucket.total) * 100;
    if (errorRate > this._thresholds.errorRatePct) {
      try {
        emit("pulse:anomalyDetected", {
          moduleId, 
          metric: "error_rate_pct",
          severity: errorRate > 25 ? "high" : "medium",
          value: Math.round(errorRate * 10) / 10,
          threshold: this._thresholds.errorRatePct
        });
      } catch (_) {}
    }
  }

  private _subscribeEventBus() {
    if (this._busUnsub.length > 0) return;

    const onChronicle = (payload: any) => {
      // payload matches chronicle:entryRecorded event
      if (!payload?.type?.startsWith("command:")) return;
      const parts = payload.type.replace("command:", "").split(".");
      if (parts.length >= 2) {
        this.recordSample({
          moduleId: parts.slice(0, -1).join("."),
          commandId: parts[parts.length - 1],
          durationMs: 0,
          success: true
        });
      }
    };

    const onAnyEvent = (eventName: string) => {
      this._eventCounts.set(eventName, (this._eventCounts.get(eventName) ?? 0) + 1);
    };

    const onInterpreterDispatch = (payload: any) => {
      if (payload.resolvedModule && payload.durationMs != null) {
        this.recordSample({ 
          moduleId: payload.resolvedModule, 
          commandId: payload.resolvedCommand, 
          durationMs: payload.durationMs, 
          success: true 
        });
      }
    };

    subscribe("chronicle:entryRecorded", onChronicle);
    subscribe("interpreter:dispatched", onInterpreterDispatch);
    subscribeAll(onAnyEvent);

    this._busUnsub.push(
      () => unsubscribe("chronicle:entryRecorded", onChronicle),
      () => unsubscribe("interpreter:dispatched", onInterpreterDispatch),
      () => unsubscribeAll(onAnyEvent)
    );
  }

  private _unsubscribeEventBus() {
    this._busUnsub.forEach(fn => fn());
    this._busUnsub = [];
  }
}

export const Pulse = new PulseService();
