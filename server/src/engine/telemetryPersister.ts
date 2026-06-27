import { db } from "../fisp/database";
import { telemetry } from "./telemetry";

export const MANIFEST = {
  id: "telemetryPersister.ts",
  type: "module",
  layer: 3,
  runtime: "TypeScript",
  version: "1.0.0",
  operationalRole: "infrastructure",
  optimization: { priority: "stability" },
  capabilities: [
    "persistTelemetry"
  ],
  dependencies: [
    "../fisp/database",
    "./telemetry"
  ],
  docs: "Background worker that snapshots telemetry every minute to SQLite."
};

let interval: NodeJS.Timeout | null = null;

export function startTelemetryPersister() {
  if (interval) return;
  interval = setInterval(() => {
    try {
      const state = telemetry.get();
      db.prepare(`
        INSERT INTO telemetry_history (timestamp, ast_cache_size, queue_depth, detector_hits)
        VALUES (?, ?, ?, ?)
      `).run(
        new Date().toISOString(),
        state.astCacheSize,
        state.queueDepth,
        JSON.stringify(state.detectorHits)
      );
    } catch (e) {
      console.error("[SDOA MCP] Telemetry Persister Error:", e);
    }
  }, 60000); // Once a minute
}

export function stopTelemetryPersister() {
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
}
