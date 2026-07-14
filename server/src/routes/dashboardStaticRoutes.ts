import fs from "node:fs";
import path from "node:path";
import { Router } from "../utils/Router";
import { db } from "../fisp/database";
import { tailLogs } from "../utils/logger";
import { getSystemMetrics } from "./health";
import { supabase, evaluateConnection } from "../utils/supabase";

// ============================================================
// dashboardStaticRoutes.ts — SDOA v5 Route Group | layer 3
// Updated: 2026-07-14
// Extracted from dashboard.ts (Phase 5 — oversized-file split).
//
// Carries logs/health endpoints (GET /api/logs, /api/health-ui,
// /api/health-check, /api/system/logs) and static asset/view serving
// (GET /public/styles.css, /public/dashboard.js, /public/assets/:file,
// /views/:view, /) plus the standalone staticRouter mounted at
// /public in server/src/index.ts.
//
// staticRouter is re-exported from here rather than from dashboard.ts
// itself, but dashboard.ts still re-exports it under the same name so
// server/src/index.ts's `import dashboardRouter, { staticRouter } from
// "./routes/dashboard"` keeps working unchanged.
// ============================================================

export const MANIFEST = {
  id: "dashboardStaticRoutes.ts",
  type: "module",
  layer: 4,
  runtime: "TypeScript",
  version: "1.0.0",
  operationalRole: "infrastructure",
  optimization: { priority: "stability" },
  capabilities: [
    "registerStaticRoutes",
    "staticRouter"
  ],
  dependencies: [
    "node:fs",
    "node:path",
    "../utils/Router",
    "../fisp/database",
    "../utils/logger",
    "./health",
    "../utils/supabase"
  ],
  docs: "Auto-generated enriched SDOA manifest via static analysis. Extracted from dashboard.ts as part of the Phase 5 oversized-file split (logs/health endpoints + static asset/view serving; also defines staticRouter, mounted at /public in server/src/index.ts)."
};

export function registerStaticRoutes(router: Router) {
  router.get("/api/logs", (req, res) => {
    const lines = tailLogs(50);
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
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
    res.setHeader("Content-Type", "application/json");
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

  router.get("/api/system/logs", (req, res) => {
    const logs = db.prepare('SELECT message, timestamp, level FROM run_log WHERE runId = ? ORDER BY id DESC LIMIT 100').all('system');
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(logs));
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

  router.get("/views/:view", (req, res) => {
    const viewName = req.url!.split("/").pop();
    const viewPath = path.join(process.cwd(), "server", "public", "views", viewName + ".html");
    if (fs.existsSync(viewPath)) {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(fs.readFileSync(viewPath));
    } else {
      res.statusCode = 404;
      res.end("View not found");
    }
  });

  router.get("/", (req, res) => {
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html");
    const htmlPath = path.join(process.cwd(), "server", "public", "index.html");
    if (fs.existsSync(htmlPath)) res.end(fs.readFileSync(htmlPath));
    else res.end("Dashboard HTML not found.");
  });
}

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
