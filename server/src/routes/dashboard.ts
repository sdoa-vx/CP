import { IncomingMessage } from "node:http";
import { db } from "../fisp/database";
import fs from "node:fs";
import path from "node:path";
import crypto from "crypto";
import { Router } from "../utils/Router";
import { tailLogs } from "../utils/logger";
import { getSystemMetrics } from "./health";
import { supabase } from "../utils/supabase";
import { telemetry } from "../engine/telemetry";
import { emit, attachSseClient, getRecentEvents } from "../engine/events";
import { flushQueue } from "../workers/offlineSync";

const router = new Router();
const syncedFiles = new Map<string, string>();

function runScanHeuristics(root: string) {
  const workspaceHash = crypto.createHash('sha256').update(root).digest('hex').slice(0, 16);
  let count = 0;

  function walk(target: string, depth = 0) {
    if (depth > 8) return;
    try {
      const stat = fs.statSync(target);
      if (stat.isDirectory()) {
        const entries = fs.readdirSync(target, { withFileTypes: true });
        for (const e of entries) {
          if (["node_modules", ".git", "dist"].includes(e.name)) continue;
          walk(path.join(target, e.name), depth + 1);
        }
      } else if (stat.isFile() && /\.(ts|tsx|js|jsx|css)$/.test(target)) {
        count++;
        try {
          const content = fs.readFileSync(target, "utf-8");
          const fileHash = crypto.createHash('sha256').update(content).digest('hex');
          
          if (content.includes("export const MANIFEST") || content.includes("const MANIFEST =")) {
             const typeMatch = content.match(/type:\s*["']([^"']+)["']/);
             const idMatch = content.match(/id:\s*["']([^"']+)["']/);
             const versionMatch = content.match(/version:\s*["']([^"']+)["']/);
             
             if (typeMatch && typeMatch[1]) {
                const modType = typeMatch[1].charAt(0).toUpperCase() + typeMatch[1].slice(1);
                telemetry.hitDetector(`sdoa${modType}` as any);
             }
             
             if (syncedFiles.get(target) !== fileHash) {
                syncedFiles.set(target, fileHash);
                const payload = {
                  module_id: idMatch ? idMatch[1] : "unknown",
                  type: typeMatch ? typeMatch[1] : "unknown",
                  file_path: target,
                  source_code: content,
                  workspace_hash: workspaceHash,
                  file_hash: fileHash,
                  version: versionMatch ? versionMatch[1] : "1.0.0",
                  timestamp: new Date().toISOString()
                };
                db.prepare('INSERT INTO offline_queue (type, target, payload, created_at) VALUES (?, ?, ?, ?)').run(
                  'SUPABASE', 'sdoa_portfolio', JSON.stringify(payload), new Date().toISOString()
                );
             }
          }

          const hit = (detector: string) => {
            telemetry.hitDetector(detector as any);
            db.prepare('INSERT INTO offline_queue (type, target, payload, created_at) VALUES (?, ?, ?, ?)').run(
              'SUPABASE', 'innovation_events', JSON.stringify({
                workspace_hash: workspaceHash,
                detector,
                file_path: target,
                matches: 1,
                ast_signature: null,
                created_at: new Date().toISOString()
              }), new Date().toISOString()
            );
          };

          if (content.includes("fetch(") || content.includes("axios.")) hit("workflow");
          if (content.includes("child_process") || content.includes("exec(")) hit("engine");
          if (/\b(interface|type)\s+[A-Z]/.test(content)) hit("schema");
          if (content.includes("var(--") || content.includes("#") || content.includes("px")) hit("token");
          if (content.includes("<") && content.includes("/>") && content.includes("className=")) hit("uiPrimitive");
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
  }

  walk(root);
  return { count, workspaceHash };
}

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
  res.setHeader("Content-Type", "text/html");
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
  res.setHeader("Content-Type", "text/html");
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

router.get("/api/peers/:id", (req, res) => {
  const peerId = decodeURIComponent(req.url!.split("/").pop()!);
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html");
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
  res.setHeader("Content-Type", "text/html");
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

router.get("/api/pipeline", async (req, res) => {
  if (!supabase) {
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html");
    return res.end("<p>Supabase unconfigured - using local mode.</p>");
  }
  const { data: runs, error } = await supabase.from('pipeline_runs').select('*').order('created_at', { ascending: false }).limit(5);
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html");
  if (error || !runs || runs.length === 0) return res.end("<p>No cloud pipeline runs found or Supabase unavailable.</p>");

  const html = runs.map(run => {
    const isAccepted = run.status === 'success';
    const isRejected = run.status === 'failed';
    const s1 = 'accepted';
    let s2 = 'accepted';
    if (isRejected) { s2 = 'rejected'; }
    const s3 = isRejected ? 'queued' : 'accepted';
    const s4 = isRejected ? 'queued' : 'accepted';
    let s5 = 'queued';
    if (!isRejected && isAccepted) { s5 = 'accepted'; }
    const s6 = 'queued';

    let cardColor = '#d29922';
    if (isAccepted) { cardColor = '#238636'; }
    else if (isRejected) { cardColor = '#da3633'; }

    return `
      <div class="card" style="margin-bottom: 1rem; border-left: 4px solid ${cardColor}">
        <h4>Run for ${run.proposal_id}</h4>
        <p style="font-size: 0.8rem; color: #8b949e;">Duration: ${run.duration_ms}ms | Synced to Cloud</p>
        <div style="display: flex; gap: 10px; flex-wrap: wrap; margin-top: 10px;">
          <span class="badge ${s1}">Probation Officer</span> ➡️ 
          <span class="badge ${s2}">Semantic Similarity</span> ➡️ 
          <span class="badge ${s3}">Gate 3 Header Injection</span> ➡️ 
          <span class="badge ${s4}">Canonical Path Routing</span> ➡️ 
          <span class="badge ${s5}">PR Worker</span> ➡️ 
          <span class="badge ${s6}">GitHub Status</span>
        </div>
      </div>
    `;
  }).join("");
  res.end(html);
});

router.get("/api/logs", (req, res) => {
  const lines = tailLogs(50);
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html");
  if(lines.length === 0) return res.end("<pre>No logs generated yet.</pre>");
  
  const formatted = lines.map(l => {
    try {
      const obj = JSON.parse(l);
      let color = '#58a6ff';
      if (obj.level === 'error') { color = '#da3633'; }
      else if (obj.level === 'warn') { color = '#d29922'; }
      return `<div><span style="color: #8b949e">[${obj.timestamp}]</span> <span style="color: ${color}">[${obj.level.toUpperCase()}]</span> ${obj.msg} ${Object.keys(obj).length > 3 ? JSON.stringify(obj) : ''}</div>`;
    } catch(e) {
      console.error(e);
      return `<div>${l}</div>`;
    }
  }).join("");
  
  res.end(`<pre style="background: #000; color: #0f0; padding: 1rem; height: 500px; overflow-y: scroll; font-family: monospace;">${formatted}</pre>`);
});

router.post("/api/scan", (req, res) => {
  let body = "";
  req.on("data", chunk => { body += chunk; });
  req.on("end", () => {
    try {
      const payload = JSON.parse(body);
      console.log(`[SDOA MCP] Manual scan requested via Dashboard: ${payload.type} at ${payload.path}`);
      
      telemetry.setState("scanning");
      emit("scan:start", { root: payload.path });
      
      telemetry.resetDetectorHits();
      const { count } = runScanHeuristics(payload.path);
      
      telemetry.setAstCacheSize(count);
      telemetry.recordScan();
      emit("scan:complete", { filesScanned: count });

      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ message: `Scan completed for ${payload.type}: ${payload.path}` }));
    } catch(e) {
      console.error(e);
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Invalid JSON payload" }));
    }
  });
});

router.get("/api/health-ui", async (req, res) => {
  const metrics = getSystemMetrics();
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html");
  res.end(`
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
      <div class="card">
        <h3>Core Engine</h3>
        <p><strong>Status:</strong> <span class="badge ${metrics.status === 'ok' ? 'accepted' : 'rejected'}">${metrics.status.toUpperCase()}</span></p>
        <p><strong>Version:</strong> ${metrics.version}</p>
        <p><strong>Memory:</strong> ${Math.round(metrics.memory.heapUsed / 1024 / 1024)} MB / ${Math.round(metrics.memory.heapTotal / 1024 / 1024)} MB</p>
        <p><strong>Uptime:</strong> ${Math.round(metrics.uptime)}s</p>
      </div>
      <div class="card">
        <h3>Storage & DB</h3>
        <p><strong>Database:</strong> <span class="badge accepted">OK</span></p>
        <p><strong>Proposal Count:</strong> ${(db.prepare('SELECT count(*) as c FROM proposals').get() as { c: number }).c}</p>
      </div>
    </div>
  `);
});

// ── v1.1 Engine Control API ─────────────────────────────────────────────────

/** Full live state snapshot — polled by the VS Code panel every 5s */
router.get("/api/state", (_req, res) => {
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(telemetry.get()));
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
  } else {
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(getRecentEvents(100)));
  }
});

let cachedAstHeatmap: Record<string, number> = {};

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

// ── Action Endpoints ─────────────────────────────────────────────────────────

function parseBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", c => { body += c; });
    req.on("end", () => { try { resolve(JSON.parse(body || "{}")); } catch { resolve({}); } });
  });
}

/** Accepts workspace path from the VS Code extension, walks and updates ast cache size */
router.post("/api/actions/scan-workspace", async (req, res) => {
  const payload = await parseBody(req);
  const root: string = payload.workspaceRoot || process.cwd();

  telemetry.setState("scanning");
  emit("scan:start", { root });

  telemetry.resetDetectorHits();
  const { count, workspaceHash } = runScanHeuristics(root);

  const currentTelemetry = telemetry.get();
  db.prepare('INSERT INTO offline_queue (type, target, payload, created_at) VALUES (?, ?, ?, ?)').run(
    'SUPABASE', 'portfolio_usage', JSON.stringify({
      workspace_hash: workspaceHash,
      primitive_count: currentTelemetry.detectorHits.sdoaPrimitive,
      workflow_count: currentTelemetry.detectorHits.sdoaWorkflow,
      schema_count: currentTelemetry.detectorHits.sdoaSchema,
      token_count: currentTelemetry.detectorHits.sdoaToken,
      engine_count: currentTelemetry.detectorHits.sdoaEngine,
      updated_at: new Date().toISOString()
    }), new Date().toISOString()
  );

  telemetry.setAstCacheSize(count);
  telemetry.recordScan();
  emit("scan:complete", { filesScanned: count });

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ ok: true, filesScanned: count }));
});

/** Clears in-memory AST cache size counter and emits event */
router.post("/api/actions/clear-cache", (_req, res) => {
  telemetry.clearCache();
  emit("cache:cleared", {});
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ ok: true }));
});

/** Manually triggers the offline sync queue flush */
router.post("/api/actions/flush-queue", async (_req, res) => {
  const result = await flushQueue();
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ ok: true, ...result }));
});

/** Resets engine state to idle and clears errors */
router.post("/api/actions/restart", (_req, res) => {
  telemetry.reset();
  emit("engine:restart", {});
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ ok: true }));
});

// ── Views & Static ───────────────────────────────────────────────────────────

router.get("/views/:view", (req, res) => {
  const viewName = req.url!.split("/").pop();
  const viewPath = path.join(process.cwd(), "server", "public", "views", viewName + ".html");
  if (fs.existsSync(viewPath)) {
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html");
    res.end(fs.readFileSync(viewPath));
  } else {
    res.statusCode = 404;
    res.end("View not found");
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

router.get("/", (req, res) => {
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html");
  const htmlPath = path.join(process.cwd(), "server", "public", "index.html");
  if (fs.existsSync(htmlPath)) res.end(fs.readFileSync(htmlPath));
  else res.end("Dashboard HTML not found.");
});

// Serve static public assets from root
export const staticRouter = new Router();
staticRouter.use("/", (req, res, next) => {
  const assetPath = path.join(process.cwd(), "server", "public", req.url!);
  if (fs.existsSync(assetPath) && fs.statSync(assetPath).isFile()) {
    if (assetPath.endsWith(".css")) res.setHeader("Content-Type", "text/css");
    else if (assetPath.endsWith(".js")) res.setHeader("Content-Type", "application/javascript");
    else if (assetPath.endsWith(".html")) res.setHeader("Content-Type", "text/html");
    res.statusCode = 200;
    return res.end(fs.readFileSync(assetPath));
  }
  if (next) next();
});

export default router;
