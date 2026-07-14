import { Router } from "../utils/Router";
import { db } from "../fisp/database";

// ============================================================
// dashboardGovernanceRoutes.ts — SDOA v5 Route Group | layer 3
// Updated: 2026-07-14
// Extracted from dashboard.ts (Phase 5 — oversized-file split).
//
// Carries the SvelteKit governance/lineage JSON feeds: GET
// /api/innovations-json, GET /api/lineage, GET /api/drift, GET
// /api/governance. All read-only against local SQLite (modules,
// edges, telemetry_history, violations, runs tables) — no shared
// mutable state, so this file takes no ctx.
// ============================================================

export const MANIFEST = {
  id: "dashboardGovernanceRoutes.ts",
  type: "module",
  layer: 4,
  runtime: "TypeScript",
  version: "1.0.0",
  operationalRole: "infrastructure",
  optimization: { priority: "stability" },
  capabilities: [
    "registerGovernanceRoutes"
  ],
  dependencies: [
    "../utils/Router",
    "../fisp/database"
  ],
  docs: "Auto-generated enriched SDOA manifest via static analysis. Extracted from dashboard.ts as part of the Phase 5 oversized-file split (SvelteKit governance/lineage JSON feeds)."
};

export function registerGovernanceRoutes(router: Router) {
  /**
   * GET /api/innovations-json
   * Returns locally-scanned SDOA modules as proposals for the Scan page.
   * Shape: { [id]: { id, module_suggestion, state, capability_surface, reasoning } }
   */
  router.get("/api/innovations-json", (req, res) => {
    res.setHeader("Content-Type", "application/json");
    try {
      const rows = db.prepare(`
        SELECT id, type, layer, sovereignty, manifestJson, updatedAt
        FROM modules ORDER BY updatedAt DESC LIMIT 200
      `).all() as any[];

      const out: Record<string, any> = {};
      for (const row of rows) {
        let mf: any = {};
        try { mf = JSON.parse(row.manifestJson || '{}'); } catch { /* ignore */ }
        out[row.id] = {
          id: row.id,
          module_suggestion: mf.id || row.id,
          state: row.sovereignty === 'sovereign' ? 'sovereign' : 'candidate',
          capability_surface: mf.capabilities || [],
          reasoning: `${row.type || 'module'} · layer ${row.layer || '?'} · ${row.sovereignty || 'unknown sovereignty'}`,
          type: row.type,
          layer: row.layer,
          updatedAt: row.updatedAt,
        };
      }
      res.statusCode = 200;
      res.end(JSON.stringify(out));
    } catch (err: any) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: err.message }));
    }
  });

  /**
   * GET /api/lineage
   * Returns the module dependency tree for the Lineage Tree (Registrar) panel.
   * Nodes are modules grouped by layer; edges come from the edges table.
   */
  router.get("/api/lineage", (req, res) => {
    res.setHeader("Content-Type", "application/json");
    try {
      const modules = db.prepare(`
        SELECT id, type, layer, sovereignty, manifestJson, updatedAt
        FROM modules ORDER BY layer ASC, id ASC LIMIT 500
      `).all() as any[];

      const edges = db.prepare(`
        SELECT fromId, toId, edgeType FROM edges LIMIT 2000
      `).all() as any[];

      const nodes = modules.map((m: any) => {
        let mf: any = {};
        try { mf = JSON.parse(m.manifestJson || '{}'); } catch { /* ignore */ }
        return {
          id: m.id,
          label: mf.id || m.id,
          type: m.type || 'module',
          layer: m.layer || 0,
          sovereignty: m.sovereignty || 'candidate',
          capabilities: mf.capabilities || [],
          operationalRole: mf.operationalRole || null,
          version: mf.version || null,
          updatedAt: m.updatedAt,
        };
      });

      // Group nodes by layer for tree display
      const byLayer: Record<number, any[]> = {};
      for (const n of nodes) {
        const l = n.layer || 0;
        if (!byLayer[l]) byLayer[l] = [];
        byLayer[l].push(n);
      }

      res.statusCode = 200;
      res.end(JSON.stringify({
        nodes,
        edges,
        byLayer,
        totalModules: modules.length,
        totalEdges: edges.length,
      }));
    } catch (err: any) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: err.message }));
    }
  });

  /**
   * GET /api/drift
   * Returns architectural drift time-series from telemetry_history.
   * Drift = delta of total detector hits between consecutive snapshots.
   */
  router.get("/api/drift", (req, res) => {
    res.setHeader("Content-Type", "application/json");
    try {
      const rows = db.prepare(`
        SELECT timestamp, ast_cache_size, queue_depth, detector_hits
        FROM telemetry_history ORDER BY id DESC LIMIT 120
      `).all() as any[];

      const history = rows.reverse().map((r: any) => ({
        timestamp: r.timestamp,
        astCacheSize: r.ast_cache_size,
        queueDepth: r.queue_depth,
        detectorHits: JSON.parse(r.detector_hits || '{}'),
      }));

      // Compute drift score as delta in total hits between snapshots
      const series = history.map((snap: any, i: number) => {
        const totalHits = Object.values(snap.detectorHits as Record<string, number>)
          .reduce((a: number, b: number) => a + b, 0);
        const prevHits = i === 0 ? totalHits
          : Object.values(history[i - 1].detectorHits as Record<string, number>)
              .reduce((a: number, b: number) => a + b, 0);
        const drift = Math.abs(totalHits - prevHits);
        return {
          timestamp: snap.timestamp,
          driftScore: drift,
          totalModules: snap.astCacheSize,
          queueDepth: snap.queueDepth,
          detectorBreakdown: snap.detectorHits,
        };
      });

      // Summary stats
      const driftScores = series.map((s: any) => s.driftScore);
      const maxDrift = driftScores.length ? Math.max(...driftScores) : 0;
      const avgDrift = driftScores.length
        ? Math.round(driftScores.reduce((a: number, b: number) => a + b, 0) / driftScores.length)
        : 0;

      // Also pull recent violations for drift context
      const recentViolations = db.prepare(`
        SELECT severity, COUNT(*) as count FROM violations
        WHERE resolved = 0 GROUP BY severity
      `).all() as any[];

      res.statusCode = 200;
      res.end(JSON.stringify({
        series,
        summary: { maxDrift, avgDrift, snapshots: series.length },
        violations: recentViolations,
      }));
    } catch (err: any) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: err.message }));
    }
  });

  /**
   * GET /api/governance
   * Returns violations grouped by severity for the Sovereign Governance Console.
   */
  router.get("/api/governance", (req, res) => {
    res.setHeader("Content-Type", "application/json");
    try {
      const violations = db.prepare(`
        SELECT v.*, r.status as runStatus, r.currentPhase
        FROM violations v
        LEFT JOIN runs r ON r.runId = v.runId
        ORDER BY v.id DESC LIMIT 500
      `).all() as any[];

      const bySeverity: Record<string, any[]> = { error: [], warn: [], info: [] };
      const byRule: Record<string, number> = {};
      let unresolved = 0;

      for (const v of violations) {
        const sev = v.severity || 'warn';
        if (!bySeverity[sev]) bySeverity[sev] = [];
        bySeverity[sev].push(v);
        byRule[v.rule] = (byRule[v.rule] || 0) + 1;
        if (!v.resolved) unresolved++;
      }

      // Recent runs summary
      const runs = db.prepare(`
        SELECT runId, status, currentPhase, createdAt, updatedAt
        FROM runs ORDER BY createdAt DESC LIMIT 20
      `).all() as any[];

      const runStats = {
        total: runs.length,
        passed: runs.filter((r: any) => r.status === 'done' || r.status === 'success').length,
        failed: runs.filter((r: any) => r.status === 'failed' || r.status === 'error').length,
        running: runs.filter((r: any) => r.status === 'running').length,
      };

      res.statusCode = 200;
      res.end(JSON.stringify({
        total: violations.length,
        unresolved,
        bySeverity,
        byRule,
        recent: violations.slice(0, 50),
        runs: runs.slice(0, 10),
        runStats,
      }));
    } catch (err: any) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: err.message }));
    }
  });
}
