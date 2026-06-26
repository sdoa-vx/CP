import fs from "node:fs";
import path from "node:path";
import { db } from "../fisp/database";

export const MANIFEST = {
  id: "telemetry.ts",
  type: "module",
  layer: 4,
  runtime: "TypeScript",
  version: "1.0.0",
  operationalRole: "infrastructure",
  optimization: { priority: "stability" },
  capabilities: [
    "telemetry"
  ],
  dependencies: [
    "node:fs",
    "node:path",
    "../fisp/database"
  ],
  docs: "Auto-generated enriched SDOA manifest via static analysis"
};



export type EngineState = "idle" | "scanning" | "syncing" | "error";

export interface DetectorHits {
  uiPrimitive: number;
  workflow: number;
  schema: number;
  token: number;
  engine: number;
  sdoaPrimitive: number;
  sdoaWorkflow: number;
  sdoaSchema: number;
  sdoaToken: number;
  sdoaEngine: number;
  // Recognized SDOA modules are bucketed by their declared type (sdoaService,
  // sdoaAdapter, sdoaFeature, sdoaAuthority, ...). The portfolio is dominated by
  // these, so they must be first-class — not silently dropped because they
  // aren't one of the five fixed detectors above.
  [key: string]: number;
}

export interface TelemetrySnapshot {
  engineState: EngineState;
  lastScan: string | null;
  queueDepth: number;
  astCacheSize: number;
  sqliteSize: number;
  pendingSync: number;
  detectorHits: DetectorHits;
  syncStatus: "ok" | "error" | "pending" | "idle";
  uptime: number;
}

export interface TelemetryPoint {
  ts: number;
  astCacheSize: number;
  queueDepth: number;
  detectorHits: number;
}

const RING_SIZE = 60;
const timeSeries: TelemetryPoint[] = [];
let lastSeriesAt = 0;

const state: TelemetrySnapshot = {
  engineState: "idle",
  lastScan: (() => {
    try {
      const row = db.prepare("SELECT value FROM metadata_store WHERE key = 'lastScan'").get() as { value: string };
      return row ? row.value : null;
    } catch { return null; }
  })(),
  queueDepth: 0,
  astCacheSize: 0,
  sqliteSize: 0,
  pendingSync: 0,
  detectorHits: { uiPrimitive: 0, workflow: 0, schema: 0, token: 0, engine: 0, sdoaPrimitive: 0, sdoaWorkflow: 0, sdoaSchema: 0, sdoaToken: 0, sdoaEngine: 0 },
  syncStatus: "idle",
  uptime: 0,
};

function readSqliteSize(): number {
  try {
    const dbPath = process.env.SDOA_DB || path.join(process.cwd(), ".sdoa", "pipeline.db");
    return fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0;
  } catch { return 0; }
}

function readQueueDepth(): number {
  try {
    const row = db.prepare("SELECT COUNT(*) as c FROM offline_queue").get() as { c: number };
    return row?.c ?? 0;
  } catch { return 0; }
}

function pushTimeSeries() {
  const now = Date.now();
  if (now - lastSeriesAt < 60_000) return;
  lastSeriesAt = now;
  const totalHits = Object.values(state.detectorHits).reduce((a, b) => a + b, 0);
  timeSeries.push({
    ts: now,
    astCacheSize: state.astCacheSize,
    queueDepth: state.queueDepth,
    detectorHits: totalHits,
  });
  if (timeSeries.length > RING_SIZE) timeSeries.shift();
}

export const telemetry = {
  get(): TelemetrySnapshot {
    state.uptime = Math.round(process.uptime());
    state.sqliteSize = readSqliteSize();
    state.queueDepth = readQueueDepth();
    state.pendingSync = readQueueDepth(); // same source — offline_queue IS the pending sync list
    pushTimeSeries();
    return { ...state, detectorHits: { ...state.detectorHits } };
  },

  getSeries(): TelemetryPoint[] {
    return [...timeSeries];
  },

  setState(s: EngineState) {
    state.engineState = s;
  },

  recordScan() {
    const timestamp = new Date().toISOString();
    state.lastScan = timestamp;
    state.engineState = "idle";
    try {
      db.prepare("INSERT OR REPLACE INTO metadata_store (key, value) VALUES ('lastScan', ?)").run(timestamp);
    } catch (err) {
      console.warn("[Telemetry] Failed to persist lastScan to DB:", err);
    }
  },

  setAstCacheSize(n: number) {
    state.astCacheSize = n;
  },

  setSyncStatus(s: "ok" | "error" | "pending" | "idle") {
    state.syncStatus = s;
  },

  hitDetector(name: string) {
    state.detectorHits[name] = (state.detectorHits[name] || 0) + 1;
  },

  clearCache() {
    state.astCacheSize = 0;
    state.engineState = "idle";
  },

  resetDetectorHits() {
    state.detectorHits = { uiPrimitive: 0, workflow: 0, schema: 0, token: 0, engine: 0, sdoaPrimitive: 0, sdoaWorkflow: 0, sdoaSchema: 0, sdoaToken: 0, sdoaEngine: 0 };
  },

  reset() {
    Object.assign(state, {
      engineState: "idle",
      lastScan: null,
      astCacheSize: 0,
      detectorHits: { uiPrimitive: 0, workflow: 0, schema: 0, token: 0, engine: 0, sdoaPrimitive: 0, sdoaWorkflow: 0, sdoaSchema: 0, sdoaToken: 0, sdoaEngine: 0 },
      syncStatus: "idle" as const,
    });
  },
};
