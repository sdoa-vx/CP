import { Router } from "../utils/Router";
import { db } from "../fisp/database";

// ============================================================
// dashboardProposalRoutes.ts — SDOA v5 Route Group | layer 3
// Updated: 2026-07-14
// Extracted from dashboard.ts (Phase 5 — oversized-file split).
//
// Carries the proposal/pipeline endpoints: GET /api/status, GET
// /api/proposals/:id, GET /api/proposals, GET /api/pipeline, GET
// /api/proposals-json, GET /api/pr-status. All read-only against the
// local SQLite proposals/pr_metadata tables — no shared mutable state,
// so this file takes no ctx and needs no companion module.
// ============================================================

export const MANIFEST = {
  id: "dashboardProposalRoutes.ts",
  type: "module",
  layer: 4,
  runtime: "TypeScript",
  version: "1.0.0",
  operationalRole: "infrastructure",
  optimization: { priority: "stability" },
  capabilities: [
    "registerProposalRoutes"
  ],
  dependencies: [
    "../utils/Router",
    "../fisp/database"
  ],
  docs: "Auto-generated enriched SDOA manifest via static analysis. Extracted from dashboard.ts as part of the Phase 5 oversized-file split (proposal/pipeline endpoints)."
};

export function registerProposalRoutes(router: Router) {
  router.get("/api/status", (req, res) => {
    const proposals = db.prepare('SELECT id, status, timestamp FROM proposals ORDER BY timestamp DESC').all();
    const queuedCount = proposals.filter((p: any) => p.status === "queued").length;
    const acceptedCount = proposals.filter((p: any) => p.status === "accepted").length;
    const rejectedCount = proposals.filter((p: any) => p.status === "rejected").length;
    const peers = (process.env.FEDERATION_PEERS || '').split(',').filter(Boolean);
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({
      uptime: process.uptime(),
      proposals: { total: proposals.length, queued: queuedCount, accepted: acceptedCount, rejected: rejectedCount },
      federation: { peers }
    }));
  });

  router.get("/api/proposals/:id", (req, res) => {
    const id = req.url!.split("/").pop();
    const proposal = db.prepare('SELECT * FROM proposals WHERE id = ?').get(id) as any;
    if (!proposal) {
      res.statusCode = 404;
      return res.end("<p>Proposal not found.</p>");
    }
    const data = JSON.parse(proposal.data);
    const innovations = data.innovations || [];

    const prMeta = db.prepare('SELECT * FROM pr_metadata WHERE proposalId = ?').get(id) as any;
    const prHtml = prMeta?.prUrl
      ? `<p><strong>PR Status:</strong> OPEN (<a href="${prMeta.prUrl}" target="_blank">View PR</a>)</p>`
      : `<p><strong>PR Status:</strong> <span class="badge rejected">PR not created</span></p>`;

    let ciHtml = `<p><strong>CI Checks:</strong> <span class="badge queued">Pending/Unknown</span></p>`;
    if (prMeta?.ci_status) {
      const badgeClass = prMeta.ci_status === 'success' ? 'accepted' : 'rejected';
      const logsLink = prMeta.ci_log_url ? ` (<a href="${prMeta.ci_log_url}" target="_blank">View Logs</a>)` : '';
      ciHtml = `<p><strong>CI Checks:</strong> <span class="badge ${badgeClass}">${prMeta.ci_status}</span>${logsLink}</p>`;
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(`
      <div style="margin-top: 2rem; border-top: 1px solid #333; padding-top: 1rem;">
        <h3>Envelope: ${proposal.id}</h3>
        <p><strong>Status:</strong> <span class="badge ${proposal.status}">${proposal.status}</span></p>
        <p><strong>Origin:</strong> ${data.origin || 'Unknown'}</p>
        <p><strong>Timestamp:</strong> ${new Date(data.timestamp || proposal.timestamp).toLocaleString()}</p>
        <p><strong>Summary:</strong> ${data.summary || 'No summary provided.'}</p>
        <p><strong>Motivation:</strong> ${data.motivation || 'No motivation provided.'}</p>
        <p><strong>Reviewer Notes:</strong> ${proposal.notes || 'None'}</p>
        <p><strong>Metrics:</strong>
          Signature: ${data.signature ? 'Valid' : 'Missing'} |
          Innovations: ${innovations.length}
        </p>
        ${prHtml}
        ${ciHtml}

        <h4>Innovations [${innovations.length}]</h4>
        <pre>${JSON.stringify(innovations, null, 2)}</pre>
      </div>
    `);
  });

  router.get("/api/proposals", (req, res) => {
    const proposals = db.prepare('SELECT id, status, timestamp FROM proposals ORDER BY timestamp DESC LIMIT 20').all();
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    if (proposals.length === 0) return res.end("<tr><td colspan='3'>No proposals found.</td></tr>");
    const htmlRows = proposals.map((p: any) => `
      <tr hx-get="/dashboard/api/proposals/${p.id}" hx-target="#proposal-detail-pane" style="cursor:pointer">
        <td>${p.id}</td>
        <td><span class="badge ${p.status}">${p.status}</span></td>
        <td>${new Date(p.timestamp).toLocaleString()}</td>
      </tr>
    `).join("");
    res.end(htmlRows);
  });

  router.get("/api/pipeline", (req, res) => {
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    try {
      // Pull pipeline data from local SQLite — source of truth, no Supabase needed
      const proposals = db.prepare(`
        SELECT p.id, p.status, p.timestamp, p.data,
               pr.prUrl, pr.ci_status
        FROM proposals p
        LEFT JOIN pr_metadata pr ON pr.proposalId = p.id
        ORDER BY p.timestamp DESC LIMIT 10
      `).all() as any[];

      if (proposals.length === 0) {
        return res.end(`<div style="padding:2rem;color:#8b949e;font-family:monospace;text-align:center;">
          <p>🔬 No proposals in local pipeline yet.</p>
          <p style="font-size:11px;margin-top:8px;">Run a workspace scan to begin detecting innovations.</p>
        </div>`);
      }

      // Also fetch run data if the MCP authority has processed any proposals
      const runs = db.prepare(`
        SELECT runId, status, currentPhase, createdAt, updatedAt
        FROM runs ORDER BY createdAt DESC LIMIT 20
      `).all() as any[];
      const runMap = new Map(runs.map((r: any) => [r.runId, r]));

      const html = proposals.map((p: any) => {
        let envelope: any = {};
        try { envelope = JSON.parse(p.data || '{}'); } catch { /* ignore */ }

        const innovations = envelope.innovations || [];
        const firstName = innovations[0]?.module_suggestion
          || innovations[0]?.id
          || envelope.summary
          || p.id.slice(0, 8);

        const innovationTypes = [...new Set(innovations.map((i: any) => i.type || i.sdoa?.type).filter(Boolean))];
        const typeLabel = innovationTypes.length > 0
          ? innovationTypes.slice(0, 3).join(', ')
          : 'proposal';

        const pStatus = p.status || 'queued';
        const isAccepted = pStatus === 'accepted' || pStatus === 'approved';
        const isRejected = pStatus === 'rejected';
        const isPending = !isAccepted && !isRejected;

        // Pipeline stage inference based on status
        const stage1 = 'accepted'; // envelope received = pre-gate passed
        const stage2 = isRejected ? 'rejected' : (isAccepted ? 'accepted' : 'queued');
        const stage3 = isAccepted ? 'accepted' : (isRejected ? 'queued' : 'queued');
        const stage4 = isAccepted && p.prUrl ? 'accepted' : 'queued';

        const borderColor = isAccepted ? '#238636' : isRejected ? '#da3633' : '#d29922';
        const ciLabel = p.ci_status ? `CI: ${p.ci_status}` : '';
        const prLink = p.prUrl ? ` · <a href="${p.prUrl}" target="_blank" style="color:#58a6ff;">View PR ↗</a>` : '';
        const ts = new Date(p.timestamp).toLocaleString();

        return `
          <div class="card" style="margin-bottom:1rem;border-left:4px solid ${borderColor};padding:1rem;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;">
              <div>
                <h4 style="margin:0 0 4px;font-size:13px;color:#e6edf3;">${firstName}</h4>
                <p style="margin:0;font-size:11px;color:#8b949e;font-family:monospace;">
                  ${typeLabel.toUpperCase()} · ${ts}${ciLabel ? ' · ' + ciLabel : ''}${prLink}
                </p>
              </div>
              <span class="badge ${pStatus}" style="white-space:nowrap;">${pStatus.toUpperCase()}</span>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;align-items:center;">
              <span class="badge ${stage1}" style="font-size:10px;">① Pre-Gate</span>
              <span style="color:#444;">→</span>
              <span class="badge ${stage2}" style="font-size:10px;">② Probation</span>
              <span style="color:#444;">→</span>
              <span class="badge ${stage3}" style="font-size:10px;">③ Canonical Path</span>
              <span style="color:#444;">→</span>
              <span class="badge ${stage4}" style="font-size:10px;">④ PR Worker</span>
            </div>
            ${innovations.length > 0 ? `<p style="font-size:10px;color:#8b949e;margin:8px 0 0;">Innovations: ${innovations.length}</p>` : ''}
          </div>
        `;
      }).join('');

      res.end(html);
    } catch (err: any) {
      res.end(`<p style="color:#da3633;">Pipeline error: ${err.message}</p>`);
    }
  });

  /**
   * GET /api/proposals-json
   * Returns proposals as a keyed object with parsed fields for the Innovation Timeline.
   * Shape: { [id]: { id, type, name, status, lineage, created_at } }
   */
  router.get("/api/proposals-json", (req, res) => {
    res.setHeader("Content-Type", "application/json");
    try {
      const rows = db.prepare(
        'SELECT id, status, timestamp, data FROM proposals ORDER BY timestamp DESC LIMIT 200'
      ).all() as any[];

      const out: Record<string, any> = {};
      for (const row of rows) {
        let envelope: any = {};
        try { envelope = JSON.parse(row.data || '{}'); } catch { /* ignore */ }
        const innovations = envelope.innovations || [];
        const firstName = innovations[0]?.module_suggestion
          || innovations[0]?.id
          || envelope.summary || '';
        const firstType = innovations[0]?.type
          || innovations[0]?.sdoa?.type
          || 'proposal';
        const lineage = innovations[0]?.sdoa?.placement
          || innovations[0]?.sdoa?.layer?.toString()
          || envelope.origin
          || null;
        out[row.id] = {
          id: row.id,
          type: firstType,
          name: firstName || row.id,
          status: row.status || 'queued',
          lineage,
          created_at: row.timestamp,
        };
      }
      res.statusCode = 200;
      res.end(JSON.stringify(out));
    } catch (err: any) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: err.message }));
    }
  });

  router.get("/api/pr-status", (req, res) => {
    const urlParams = new URL(req.url!, "http://localhost");
    const id = urlParams.searchParams.get("id");
    const prMeta = db.prepare('SELECT * FROM pr_metadata WHERE proposalId = ?').get(id) as any;

    if (!prMeta) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ error: "Not found" }));
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ status: prMeta.status, url: prMeta.prUrl }));
  });
}
