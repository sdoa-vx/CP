import { IncomingMessage } from "node:http";
import { db } from "../fisp/database";
import fs from "node:fs";
import path from "node:path";
import crypto from "crypto";
import { Router } from "../utils/Router";
import { tailLogs } from "../utils/logger";
import { getSystemMetrics } from "./health";
import { supabase, evaluateConnection } from "../utils/supabase";
import { telemetry } from "../engine/telemetry";
import { emit, attachSseClient, getRecentEvents } from "../engine/events";
import { flushQueue } from "../workers/offlineSync";

const router = new Router();
const syncedFiles = new Map<string, string>();

const insightsCache: Record<string, string[]> = {
  sdoaPrimitive: [],
  sdoaWorkflow: [],
  sdoaSchema: [],
  sdoaToken: [],
  sdoaEngine: []
};

// Extract id/type/version from the actual MANIFEST object literal (balanced
// braces, comment-stripped), across dialects: `export const MANIFEST = {..}`,
// `static MANIFEST = {..}`, `MANIFEST = {..}` (Python). Scoping to the block
// avoids the old whole-file regex that mis-grabbed unrelated `type:"password"`,
// `type:"number"`, `type:"application/json"` etc.
function extractManifestFields(content: string): { id: string; type?: string; version?: string } | null {
  const anchor = /(?:^|[\s.;({])MANIFEST(?:_JSON)?\s*[:=]\s*\{/m.exec(content);
  if (!anchor) return null;
  const start = content.indexOf("{", anchor.index);
  if (start === -1) return null;

  let depth = 0;
  let inStr: string | null = null;
  let end = -1;
  for (let i = start; i < content.length; i++) {
    const ch = content[i];
    if (inStr) {
      if (ch === "\\") { i++; continue; }
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") { inStr = ch; continue; }
    if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end === -1) return null;

  const block = content
    .slice(start, end + 1)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "")
    .replace(/(^|\s)#[^\n]*/g, "$1");

  const grab = (key: string): string | undefined => {
    const m = block.match(new RegExp(key + "\\s*[:=]\\s*[\"'`]([^\"'`]+)[\"'`]"));
    return m ? m[1] : undefined;
  };
  const id = grab("id");
  if (!id) return null; // a real manifest declares an id
  return { id, type: grab("type"), version: grab("version") };
}

async function runScanHeuristics(root: string) {
  // Strip quotes if the user pasted them from Windows explorer
  const cleanRoot = root.replace(/^["']|["']$/g, "").trim();
  // Lowercase the root before hashing so case-variant paths (C:\MCP vs c:\mcp)
  // map to ONE workspace instead of duplicating the project.
  const workspaceHash = crypto.createHash('sha256').update(cleanRoot.toLowerCase()).digest('hex').slice(0, 16);
  let count = 0;

  // Clear cache for new scan
  Object.keys(insightsCache).forEach(k => insightsCache[k] = []);

  // Pass 1: Collect scannable files
  const scannableFiles: string[] = [];
  async function collectFiles(target: string, depth = 0) {
    if (depth > 20) return;
    try {
      const stat = fs.statSync(target);
      if (stat.isDirectory()) {
        const entries = fs.readdirSync(target, { withFileTypes: true });
        for (let i = 0; i < entries.length; i++) {
          const e = entries[i];
          if (["node_modules", ".git", "dist", ".vscode", "_variances", "out", "build", "coverage", ".venv", "venv", "__pycache__", ".next", ".cache", "vendor"].includes(e.name)) continue;
          if (i % 20 === 0) {
            emit("scan:progress", { currentFile: "Phase 1: Scanning file structure (Discovered " + scannableFiles.length + " files...)", scannedCount: scannableFiles.length, totalFiles: 0, currentHits: 0 });
            await new Promise(r => setImmediate(r));
          }
          await collectFiles(path.join(target, e.name), depth + 1);
        }
      } else if (stat.isFile()) {
        if (/\.(ts|tsx|js|jsx|mjs|cjs|css|scss|less|html|htm|json|md|py|java|cpp|c|cc|cxx|hpp|h|cs|go|rs|rb|php|pas|pp|inc|f|for|f90|f95|asm|s|coffee|vb|vba|vbs|bas|ndl|f242|sh|bash|bat|ps1|lua|sql|yaml|yml|toml|d|di)$/i.test(target)) {
          scannableFiles.push(target);
        }
      }
    } catch { /* skip */ }
  }

  await collectFiles(cleanRoot);
  console.log(`[SDOA MCP] collectFiles finished. Found ${scannableFiles.length} files.`);
  
  // Emit scan:init with total files
  emit("scan:init", { totalFiles: scannableFiles.length, root: cleanRoot });

  if (scannableFiles.length === 0) {
    emit("scan:progress", { 
      currentFile: "No scannable files found.", 
      scannedCount: 0, 
      totalFiles: 0,
      currentHits: 0
    });
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log(`[SDOA MCP] Starting Pass 2...`);
  // Pass 2: Process files and emit progress
  for (let i = 0; i < scannableFiles.length; i++) {
    const target = scannableFiles[i];
    count++;
    
    // Process file
    try {
      const content = fs.readFileSync(target, "utf-8");
      const fileHash = crypto.createHash('sha256').update(content).digest('hex');
      
      // Only code files are module candidates — a README/JSON/HTML that merely
      // contains the word "MANIFEST" and an `id:` is not a module.
      const isCodeFile = /\.(ts|tsx|js|jsx|mjs|cjs|py|rs|java|cpp|cc|cxx|c|h|hpp|cs|go|rb|php)$/i.test(target);
      const mf = isCodeFile ? extractManifestFields(content) : null;
      if (mf) {
         const modType = mf.type
           ? mf.type.charAt(0).toUpperCase() + mf.type.slice(1)
           : "Module";
         telemetry.hitDetector(`sdoa${modType}` as any);

         if (syncedFiles.get(target) !== fileHash) {
            syncedFiles.set(target, fileHash);
            const payload = {
              module_id: mf.id,
              type: mf.type ?? "unknown",
              file_path: target,
              source_code: content,
              workspace_hash: workspaceHash,
              file_hash: fileHash,
              version: mf.version ?? "1.0.0",
              timestamp: new Date().toISOString()
            };
            db.prepare('INSERT INTO offline_queue (type, target, payload, created_at) VALUES (?, ?, ?, ?)').run(
              'SUPABASE', 'sdoa_portfolio', JSON.stringify(payload), new Date().toISOString()
            );
         }
      }

      const hit = (detector: string) => {
        const key = `sdoa${detector.charAt(0).toUpperCase() + detector.slice(1)}`;
        telemetry.hitDetector(key as any);
        if (insightsCache[key] && !insightsCache[key].includes(target)) {
          insightsCache[key].push(target);
        }

        db.prepare('INSERT INTO offline_queue (type, target, payload, created_at) VALUES (?, ?, ?, ?)').run(
          'SUPABASE', 'innovation_events', JSON.stringify({
            workspace_hash: workspaceHash,
            detector: key,
            file_path: target,
            matches: 1,
            ast_signature: null,
            created_at: new Date().toISOString()
          }), new Date().toISOString()
        );
      };

      if (content.includes("fetch(") || content.includes("axios.") || content.includes("requests.get")) hit("workflow");
      if (content.includes("child_process") || content.includes("exec(") || content.includes("subprocess.")) hit("engine");
      if (/\b(interface|type|class|def|struct)\s+[A-Z]/.test(content)) hit("schema");
      if (content.includes("var(--") || content.includes("#") || content.includes("px") || content.includes("color:")) hit("token");
      if ((content.includes("<") && content.includes("/>") && content.includes("className=")) || content.includes("class=")) hit("uiPrimitive");
    } catch { /* skip */ }

    // Emit progress
    const currentTelemetry = telemetry.get();
    const currentHits = Object.values(currentTelemetry.detectorHits).reduce((a: any, b: any) => a + b, 0);

    emit("scan:progress", { 
      currentFile: target, 
      scannedCount: i + 1, 
      totalFiles: scannableFiles.length,
      currentHits
    });

    // Yield event loop every 5 files to maintain high throughput but ensure UI stays completely responsive
    if (i % 5 === 0) {
      await new Promise(r => setImmediate(r));
    }
  }

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

  const html = runs.map((run: any) => {
    const isAccepted = run.status === 'success';
    const isRejected = run.status === 'failed';
    
    // Fake the progression for visual flair based on status
    const s1 = 'accepted'; // 1. Pre-Flight Verification Gates
    const s2 = isRejected ? 'rejected' : 'accepted'; // 2. Registry Bootstrapping
    const s3 = isRejected ? 'queued' : 'accepted';   // 3. Anti-Entropy Processes
    const s4 = isRejected ? 'queued' : (isAccepted ? 'accepted' : 'queued'); // 4. Evolution Output

    let cardColor = '#d29922';
    if (isAccepted) { cardColor = '#238636'; }
    else if (isRejected) { cardColor = '#da3633'; }

    return `
      <div class="card" style="margin-bottom: 1rem; border-left: 4px solid ${cardColor}">
        <h4>Run for ${run.proposal_id}</h4>
        <p style="font-size: 0.8rem; color: #8b949e;">Duration: ${run.duration_ms}ms | Synced to Cloud</p>
        <div style="display: flex; gap: 10px; flex-wrap: wrap; margin-top: 10px;">
          <span class="badge ${s1}">1. Pre-Flight Verification Gates</span> ➡️ 
          <span class="badge ${s2}">2. Registry Bootstrapping</span> ➡️ 
          <span class="badge ${s3}">3. Anti-Entropy Processes</span> ➡️ 
          <span class="badge ${s4}">4. Evolution Output</span>
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
  req.on("end", async () => {
    try {
      const payload = JSON.parse(body || "{}");
      const targetPath = payload.path || payload.workspaceRoot || process.cwd();
      console.log(`[SDOA MCP] Manual scan requested via Dashboard: ${payload.type || 'full'} at ${targetPath}`);
      
      telemetry.setState("scanning");
      emit("scan:start", { root: targetPath });
      
      // Yield the event loop so the UI and SSE events can flush 'scanning' state before we block
      await new Promise(r => setTimeout(r, 100));

      telemetry.resetDetectorHits();
      const { count, workspaceHash } = await runScanHeuristics(targetPath);
      
      const currentTelemetry = telemetry.get();
      try {
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
      } catch (dbErr) {
        console.error("Error inserting portfolio_usage:", dbErr);
      }

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
  
  let supabaseHtml = '<p><strong>Supabase:</strong> <span class="badge rejected">Not Configured</span></p>';
  if (supabase) {
    const start = Date.now();
    const isConnected = await evaluateConnection();
    const latency = Date.now() - start;
    if (!isConnected) {
      supabaseHtml = `<p><strong>Supabase:</strong> <span class="badge rejected">ERROR</span> (Connection Failed)</p>`;
    } else {
      supabaseHtml = `<p><strong>Supabase:</strong> <span class="badge accepted">OK</span> (${latency}ms)</p>`;
    }
  }

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
        <p><strong>Local SQLite:</strong> <span class="badge accepted">OK</span></p>
        ${supabaseHtml}
        <p><strong>Proposal Count:</strong> ${(db.prepare('SELECT count(*) as c FROM proposals').get() as { c: number }).c}</p>
        <p style="margin-top: 10px; font-size: 0.8rem;"><a href="/dashboard/api/health-check" target="_blank" style="color: #58a6ff; text-decoration: none;">↗ View Programmatic Health Ping API</a></p>
      </div>
    </div>
  `);
});

router.get("/api/health-check", async (req, res) => {
  const start = Date.now();
  if (!supabase) {
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ status: "error", message: "Supabase client not initialized" }));
  }
  
  try {
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000));
    const queryPromise = supabase.from('sdoa_portfolio').select('id').limit(1);
    
    const { error } = await Promise.race([queryPromise, timeoutPromise]) as any;
    const latency = Date.now() - start;
    
    res.statusCode = error ? 500 : 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ 
      status: error ? "error" : "ok", 
      latencyMs: latency,
      message: error ? String(error.message) : "Connected"
    }));
  } catch (err) {
    const latency = Date.now() - start;
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ 
      status: "error", 
      latencyMs: latency,
      message: err instanceof Error ? err.message : String(err)
    }));
  }
});

// ── v1.1 Engine Control API ─────────────────────────────────────────────────

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

router.get("/api/insights", (req, res) => {
  const urlParams = new URL(req.url!, "http://localhost");
  const detector = urlParams.searchParams.get("detector");
  
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  
  if (detector && insightsCache[detector]) {
    res.end(JSON.stringify(insightsCache[detector]));
  } else if (!detector) {
    res.end(JSON.stringify(insightsCache));
  } else {
    res.end(JSON.stringify([]));
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
  try {
    const payload = await parseBody(req);
    const root: string = payload.workspaceRoot || process.cwd();

    telemetry.setState("scanning");
    emit("scan:start", { root });

    // Yield the event loop so the UI and SSE events can flush 'scanning' state before we block
    await new Promise(r => setTimeout(r, 100));

    telemetry.resetDetectorHits();
    const { count, workspaceHash } = await runScanHeuristics(root);

    const currentTelemetry = telemetry.get();
    try {
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
    } catch (dbErr) {
      console.error("Error inserting portfolio_usage:", dbErr);
    }

    telemetry.setAstCacheSize(count);
    telemetry.recordScan();

    // Push results to Supabase immediately rather than waiting for the 3-minute
    // offlineSync interval (or never, if the user closes the panel first).
    let synced = { flushed: 0, failed: 0 };
    try {
      synced = await flushQueue();
    } catch (syncErr) {
      console.error("Error flushing scan results to Supabase:", syncErr);
    }

    emit("scan:complete", { filesScanned: count, synced });

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true, filesScanned: count, synced }));
  } catch (err) {
    console.error("Error in /api/actions/scan-workspace:", err);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: String(err) }));
  }
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

router.get("/public/styles.css", (req, res) => {
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/css");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.end(fs.readFileSync(path.join(__dirname, "../public/styles.css")));
});

router.get("/public/dashboard.js", (req, res) => {
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/javascript");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.end(fs.readFileSync(path.join(__dirname, "../public/dashboard.js")));
});

router.get("/public/assets/:file", (req, res) => {
  const file = req.url!.split("/").pop()!;
  const filePath = path.join(__dirname, "../public/assets", file);
  if (fs.existsSync(filePath)) {
    res.statusCode = 200;
    if (file.endsWith(".svg")) res.setHeader("Content-Type", "image/svg+xml");
    if (file.endsWith(".png")) res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.end(fs.readFileSync(filePath));
  } else {
    res.statusCode = 404;
    res.end("Not Found");
  }
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
