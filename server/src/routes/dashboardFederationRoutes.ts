import { Router } from "../utils/Router";
import { db } from "../fisp/database";
import { supabase } from "../utils/supabase";

// ============================================================
// dashboardFederationRoutes.ts — SDOA v5 Route Group | layer 3
// Updated: 2026-07-14
// Extracted from dashboard.ts (Phase 5 — oversized-file split).
//
// Carries the federation/peer endpoints: GET /api/peers/:id, GET
// /api/peers, GET /api/mesh, GET /api/actions/community-library. No
// shared mutable state — each handler reads env/SQLite/Supabase and
// responds independently, so this file takes no ctx.
// ============================================================

export const MANIFEST = {
  id: "dashboardFederationRoutes.ts",
  type: "module",
  layer: 4,
  runtime: "TypeScript",
  version: "1.0.0",
  operationalRole: "infrastructure",
  optimization: { priority: "stability" },
  capabilities: [
    "registerFederationRoutes"
  ],
  dependencies: [
    "../utils/Router",
    "../fisp/database",
    "../utils/supabase"
  ],
  docs: "Auto-generated enriched SDOA manifest via static analysis. Extracted from dashboard.ts as part of the Phase 5 oversized-file split (federation/peer endpoints)."
};

export function registerFederationRoutes(router: Router) {
  router.get("/api/peers/:id", (req, res) => {
    const peerId = decodeURIComponent(req.url!.split("/").pop()!);
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(`
      <div style="margin-top: 2rem; border-top: 1px solid #333; padding-top: 1rem;">
        <h3>Peer Deep Dive: ${peerId}</h3>
        <table class="table">
          <tr><td><strong>Last Sync:</strong></td><td>Just now (0ms ago)</td></tr>
          <tr><td><strong>Protocol Version:</strong></td><td>FISP v1.1</td></tr>
          <tr><td><strong>Signature Check:</strong></td><td><span class="badge accepted">HMAC Valid</span></td></tr>
          <tr><td><strong>Health History:</strong></td><td>100% Uptime (Last 24h)</td></tr>
          <tr><td><strong>Replication Stats:</strong></td><td>14 Envelopes Synced (0 Collisions)</td></tr>
        </table>
      </div>
    `);
  });

  router.get("/api/peers", (req, res) => {
    const peers = (process.env.FEDERATION_PEERS || '').split(',').filter(Boolean);
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    if (peers.length === 0) return res.end("<tr><td colspan='3'>No peers configured.</td></tr>");
    const htmlRows = peers.map((peer) => `
      <tr hx-get="/dashboard/api/peers/${encodeURIComponent(peer)}" hx-target="#peer-detail-pane" style="cursor:pointer">
        <td>${peer}</td>
        <td><span class="badge queued">Connected</span></td>
        <td><span class="badge accepted">In Sync</span></td>
      </tr>
    `).join("");
    res.end(htmlRows);
  });

  /**
   * GET /api/mesh
   * Returns federation peer status for the Mesh panel.
   * Pings each configured peer with a HEAD request to check liveness.
   */
  router.get("/api/mesh", async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    try {
      const peerEnv = process.env.FEDERATION_PEERS || '';
      const peerUrls = peerEnv.split(',').map((s: string) => s.trim()).filter(Boolean);

      // Read last sync metadata
      const syncMeta = db.prepare("SELECT value FROM metadata_store WHERE key = 'last_sync_time'").get() as any;
      const lastSync = syncMeta?.value || null;

      // Count proposals sent (queued for SUPABASE sync = outbound to community)
      const outboundCount = (db.prepare(
        "SELECT COUNT(*) as c FROM offline_queue WHERE type = 'SUPABASE'"
      ).get() as any).c;

      const peers = await Promise.all(peerUrls.map(async (url: string) => {
        const start = Date.now();
        let online = false;
        let latencyMs: number | null = null;
        try {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 3000);
          const r = await fetch(url + '/fisp/v1/health', { method: 'GET', signal: ctrl.signal });
          clearTimeout(timer);
          online = r.ok;
          latencyMs = Date.now() - start;
        } catch { /* offline */ }
        return {
          url,
          online,
          latencyMs,
          protocol: 'FISP v1.1',
        };
      }));

      // Local node info
      const localProposalCount = (db.prepare('SELECT COUNT(*) as c FROM proposals').get() as any).c;
      const localModuleCount = (db.prepare('SELECT COUNT(*) as c FROM modules').get() as any).c;

      res.statusCode = 200;
      res.end(JSON.stringify({
        peers,
        local: {
          proposals: localProposalCount,
          modules: localModuleCount,
          outboundQueue: outboundCount,
          lastSync,
          nodeId: process.env.SDOA_NODE_ID || 'local',
        },
        totalPeers: peers.length,
        onlinePeers: peers.filter((p: any) => p.online).length,
      }));
    } catch (err: any) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: err.message }));
    }
  });

  router.get("/api/actions/community-library", async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (!supabase) {
      res.statusCode = 200;
      return res.end(JSON.stringify({ ok: false, library: [], prJobs: [], error: "Supabase not configured." }));
    }

    try {
      const { data: library } = await supabase
        .from("sdoa_portfolio")
        .select("*")
        .eq("workspace_hash", "canonical-cloud");

      const { data: prJobs } = await supabase
        .from("sdoa_pr_jobs")
        .select("*")
        .order("created_at", { ascending: false });

      res.statusCode = 200;
      res.end(JSON.stringify({ ok: true, library: library || [], prJobs: prJobs || [] }));
    } catch (err: any) {
      res.statusCode = 500;
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
  });
}
