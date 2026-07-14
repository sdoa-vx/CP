import fs from "node:fs";
import path from "node:path";
import crypto from "crypto";
import { IncomingMessage } from "node:http";
import { Router } from "../utils/Router";
import { db } from "../fisp/database";
import { telemetry } from "../engine/telemetry";
import { emit } from "../engine/events";
import { PrimeDiscovery } from "../services/PrimeDiscovery.service";

// ============================================================
// dashboardScanEngine.ts — SDOA v5 Route Group | layer 3
// Updated: 2026-07-14
// Extracted from dashboard.ts (Phase 5 — oversized-file split).
//
// Carries the workspace scan heuristics engine (MANIFEST extraction +
// detector hits) plus the scan/action routes that read or write its
// state: POST /api/scan, GET /api/insights, POST
// /api/actions/scan-workspace, POST /api/actions/clear-cache, POST
// /api/actions/restart. insightsCache and syncedFiles are module-level
// state private to this file — extractManifestFields/runScanHeuristics
// write them, /api/insights reads them, so both stay colocated here
// rather than being split across files.
//
// parseBody() is also exported since dashboardTelemetryRoutes.ts's
// /api/actions/extract handler needs the same tiny JSON-body reader.
// ============================================================

export const MANIFEST = {
  id: "dashboardScanEngine.ts",
  type: "module",
  layer: 4,
  runtime: "TypeScript",
  version: "1.0.0",
  operationalRole: "infrastructure",
  optimization: { priority: "stability" },
  capabilities: [
    "parseBody",
    "registerScanRoutes"
  ],
  dependencies: [
    "node:fs",
    "node:path",
    "crypto",
    "node:http",
    "../utils/Router",
    "../fisp/database",
    "../engine/telemetry",
    "../engine/events",
    "../services/PrimeDiscovery.service"
  ],
  docs: "Auto-generated enriched SDOA manifest via static analysis. Extracted from dashboard.ts as part of the Phase 5 oversized-file split (workspace scan heuristics engine + scan/action routes)."
};

const syncedFiles = new Map<string, string>();

const insightsCache: Record<string, string[]> = {
  sdoaPrimitive: [],
  sdoaWorkflow: [],
  sdoaSchema: [],
  sdoaToken: [],
  sdoaEngine: []
};

export function parseBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", c => { body += c; });
    req.on("end", () => { try { resolve(JSON.parse(body || "{}")); } catch { resolve({}); } });
  });
}

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

    if (i % 50 === 0) await new Promise(r => setImmediate(r));

    // Process file
    try {
      const content = fs.readFileSync(target, "utf-8");
      const fileHash = crypto.createHash('sha256').update(content).digest('hex');

      let isFileChanged = false;
      if (syncedFiles.get(target) !== fileHash) {
         syncedFiles.set(target, fileHash);
         isFileChanged = true;
      }

      // Only code files are module candidates — a README/JSON/HTML that merely
      // contains the word "MANIFEST" and an `id:` is not a module.
      const isCodeFile = /\.(ts|tsx|js|jsx|mjs|cjs|py|rs|java|cpp|cc|cxx|c|h|hpp|cs|go|rb|php)$/i.test(target);
      const mf = isCodeFile ? extractManifestFields(content) : null;
      if (mf) {
         const modType = mf.type
           ? mf.type.charAt(0).toUpperCase() + mf.type.slice(1)
           : "Module";
         telemetry.hitDetector(`sdoa${modType}` as any);

         if (isFileChanged) {
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
        const isNew = !insightsCache[key]?.includes(target);
        telemetry.hitDetector(key as any);
        if (insightsCache[key] && isNew) {
          insightsCache[key].push(target);
        }

        // Emit a rich per-discovery SSE event so the UI can react with fireworks
        emit('detector:hit', {
          detector: key,
          file: target,
          filePath: target,
          id: mf?.id || null,
          name: mf?.id || target.split(/[\\/]/).pop(),
          type: mf?.type || detector,
          isNew,
          totalHits: (insightsCache[key]?.length || 0)
        });

        if (isFileChanged) {
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
        }
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

export function registerScanRoutes(router: Router) {
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

  /** Accepts workspace path from the VS Code extension, walks and updates ast cache size */
  router.post("/api/actions/scan-workspace", async (req, res) => {
    try {
      const payload = await parseBody(req);
      const root: string = payload.workspaceRoot || process.cwd();

      telemetry.setState("scanning");
      emit("scan:start", { root });

      // Yield the event loop so the UI and SSE events can flush 'scanning' state before we block
      await new Promise(r => setTimeout(r, 100));

      PrimeDiscovery.scanWorkspace(root);

      const sdoaDb = PrimeDiscovery.getDatabase();
      let count = 0;
      if (sdoaDb) {
        try {
          const row = sdoaDb.prepare(`SELECT COUNT(*) as count FROM prime_files`).get() as any;
          if (row) count = row.count;
        } catch (e) {}
      }

      telemetry.setAstCacheSize(count);
      telemetry.recordScan();

      emit("scan:complete", { filesScanned: count, synced: true });

      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: true, filesScanned: count, synced: true }));
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

  /** Resets engine state to idle and clears errors */
  router.post("/api/actions/restart", (_req, res) => {
    telemetry.reset();
    emit("engine:restart", {});
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true }));
  });
}
