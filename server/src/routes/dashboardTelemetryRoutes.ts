import { Router } from "../utils/Router";
import { db } from "../fisp/database";
import { telemetry } from "../engine/telemetry";
import { emit, attachSseClient, getRecentEvents } from "../engine/events";
import { flushQueue } from "../workers/offlineSync";
import { parseBody } from "./dashboardScanEngine";

// ============================================================
// dashboardTelemetryRoutes.ts — SDOA v5 Route Group | layer 3
// Updated: 2026-07-14
// Extracted from dashboard.ts (Phase 5 — oversized-file split).
//
// Carries the engine-control/telemetry endpoints polled by the VS Code
// panel and dashboard charts: GET /api/state, GET /api/telemetry/history,
// GET /api/telemetry, GET /api/events (SSE), POST
// /api/actions/ast-heatmap + GET /api/heatmap, POST /api/actions/extract,
// POST /api/actions/flush-queue.
//
// cachedAstHeatmap is module-level state private to this file (write
// side is the POST route, read side is the GET route, both live here).
// Reuses parseBody() from dashboardScanEngine.ts rather than
// duplicating the tiny JSON-body reader.
// ============================================================

export const MANIFEST = {
  id: "dashboardTelemetryRoutes.ts",
  type: "module",
  layer: 4,
  runtime: "TypeScript",
  version: "1.0.0",
  operationalRole: "infrastructure",
  optimization: { priority: "stability" },
  capabilities: [
    "registerTelemetryRoutes"
  ],
  dependencies: [
    "../utils/Router",
    "../fisp/database",
    "../engine/telemetry",
    "../engine/events",
    "../workers/offlineSync",
    "./dashboardScanEngine"
  ],
  docs: "Auto-generated enriched SDOA manifest via static analysis. Extracted from dashboard.ts as part of the Phase 5 oversized-file split (engine-control/telemetry endpoints)."
};

let cachedAstHeatmap: Record<string, number> = {};

export function registerTelemetryRoutes(router: Router) {
  /** Full live state snapshot — polled by the VS Code panel every 5s */
  router.get("/api/state", (req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(telemetry.get()));
  });

  router.get("/api/telemetry/history", (req, res) => {
    try {
      const rows = db.prepare(`
        SELECT timestamp, ast_cache_size as astCacheSize, queue_depth as queueDepth, detector_hits as detectorHits
        FROM telemetry_history
        ORDER BY id DESC LIMIT 100
      `).all() as any[];

      const history = rows.reverse().map(r => ({
        ...r,
        detectorHits: JSON.parse(r.detectorHits || '{}')
      }));

      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(history));
    } catch (err: any) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: err.message }));
    }
  });

  router.post("/api/actions/extract", async (req, res) => {
    const payload = await parseBody(req);
    const filePath = payload.filePath;

    // Emitting this event so the VS Code extension can pick it up via SSE and pop open the file
    emit("sdoa:extract-request", { filePath });

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true, message: "Extraction request sent to VS Code." }));
  });

  /** Time-series data for dashboard telemetry charts */
  router.get("/api/telemetry", (_req, res) => {
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(telemetry.getSeries()));
  });

  /** SSE stream — ?stream=true keeps connection open */
  router.get("/api/events", (req, res) => {
    const url = new URL(req.url!, "http://localhost");
    if (url.searchParams.get("stream") === "true") {
      attachSseClient(res);
      // Hydrate new SSE client with current proposals so SvelteKit stores populate immediately
      try {
        const rows = db.prepare(
          'SELECT id, status, timestamp, data FROM proposals ORDER BY timestamp DESC LIMIT 100'
        ).all() as any[];
        const proposalFeed: Record<string, any> = {};
        for (const row of rows) {
          let envelope: any = {};
          try { envelope = JSON.parse(row.data || '{}'); } catch { /* ignore */ }
          const innovations = envelope.innovations || [];
          const firstName = innovations[0]?.module_suggestion
            || innovations[0]?.id
            || envelope.summary || '';
          const firstType = innovations[0]?.type || innovations[0]?.sdoa?.type || 'proposal';
          const lineage = innovations[0]?.sdoa?.placement || envelope.origin || null;
          proposalFeed[row.id] = {
            id: row.id,
            type: firstType,
            name: firstName || row.id,
            status: row.status || 'queued',
            lineage,
            created_at: row.timestamp,
          };
        }
        // Small delay so SSE client header flush completes first
        setTimeout(() => {
          emit('proposals:hydrate', proposalFeed);
        }, 150);
      } catch { /* non-fatal */ }
    } else {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(getRecentEvents(100)));
    }
  });

  /** Receives AST scores from the globalAstEngine extension worker */
  router.post("/api/actions/ast-heatmap", async (req, res) => {
    const payload = await parseBody(req);
    cachedAstHeatmap = payload;
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true, count: Object.keys(payload).length }));
  });

  /**
   * Heatmap: serves the AST density/complexity scores synced from the VS Code extension.
   */
  router.get("/api/heatmap", (_req, res) => {
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(cachedAstHeatmap));
  });

  /** Manually triggers the offline sync queue flush */
  router.post("/api/actions/flush-queue", async (_req, res) => {
    const result = await flushQueue();
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true, ...result }));
  });
}
