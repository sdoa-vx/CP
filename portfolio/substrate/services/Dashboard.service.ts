// ──────────────────────────────────────────────────────────────────
// File:    Dashboard.service.ts
// Version: 5.0.0
// Updated: 2026-06-17T00:00:00Z
// Changes: Relocated to canonical sdoavx/ structure
// ──────────────────────────────────────────────────────────────────
// ============================================================
// Dashboard.service.ts — SDOA v5.0 Service
// version: 5.0.0
// Last modified: 2026-06-01 15:30 UTC
// ============================================================

import { SdoaManifest, Registry } from './Registry.service';
import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';

export class DashboardService {
  static MANIFEST: SdoaManifest = {
    id: "Dashboard.service",
    type: "service",
    layer: 3,
    runtime: "NodeJS",
    version: "5.0.1",
    last_modified: "2026-07-13T00:00:00Z",
    operationalRole: "savant",
    requires: ["Registry.service"],
    dependencies: ["Registry.service"],
    capabilities: ["dashboard:sse-stream", "dashboard:serve-ui", "dashboard:blueprint-api", "dashboard:graceful-shutdown"],
    lifecycle: ["init", "dispose"],
    actions: {
      commands: {
        startServer: {
          description: "Starts the real-time monitoring HTTP server",
          input: { port: "number" },
          output: "void"
        }
      }
    },
    optimization: {
      priority: "readability",
      assertionSuite: ""
    },
    docs: {
      description: "Visualizes registry flows, method calls, and healing progress in real-time.",
      author: "ProtoAI team",
      sdoa: "5.0.0"
    }
  };

  private registry!: Registry;
  private server: http.Server | null = null;
  private clients: http.ServerResponse[] = [];
  private eventHistory: any[] = [];
  private port = 3000;
  private isShuttingDown = false;

  async init(registry: Registry): Promise<void> {
    this.registry = registry;

    // Subscribe to registry events and forward to SSE clients
    this.registry.subscribe((event) => {
      // Keep a buffer of the last 100 events
      this.eventHistory.push(event);
      if (this.eventHistory.length > 100) {
        this.eventHistory.shift();
      }

      // Stream to clients
      this.streamToClients(event);
    });

    this.startServer();
  }

  private streamToClients(event: any): void {
    const dataStr = `data: ${JSON.stringify(event)}\n\n`;
    this.clients.forEach(res => {
      res.write(dataStr);
    });
  }

  startServer(port: number = this.port): void {
    this.port = port;
    this.server = http.createServer((req, res) => {
      const url = req.url || '/';

      // SSE connection
      if (url === '/events') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*'
        });

        // Write event history to synchronize client state immediately
        this.eventHistory.forEach(event => {
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        });

        this.clients.push(res);

        req.on('close', () => {
          this.clients = this.clients.filter(client => client !== res);
        });
        return;
      }

      // API Blueprint info
      if (url === '/api/blueprint') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        try {
          const blueprintPath = path.resolve('blueprint.schema.json');
          if (fs.existsSync(blueprintPath)) {
            const data = fs.readFileSync(blueprintPath, 'utf8');
            res.end(data);
          } else {
            res.end(JSON.stringify({ error: 'Blueprint file not generated yet.' }));
          }
        } catch (err) {
          res.end(JSON.stringify({ error: String(err) }));
        }
        return;
      }

      // Shutdown handler
      if (url === '/api/shutdown' || url === '/api/exit') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Server is shutting down.' }));
        this.triggerGracefulShutdown();
        return;
      }

      // Serve Web UI
      if (url === '/' || url === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(this.getDashboardHtml());
        return;
      }

      res.writeHead(404);
      res.end('Not Found');
    });

    this.server.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`Port ${this.port} is in use, retrying on port ${this.port + 1}...`);
        this.startServer(this.port + 1);
      } else {
        console.error('Dashboard server error:', err);
      }
    });

    this.server.listen(this.port, () => {
      console.log(`\nSDOA Monitor Dashboard is running at: http://localhost:${this.port}`);
      console.log(`Open this URL in your web browser for real-time process monitoring.\n`);
    });
  }

  private triggerGracefulShutdown(): void {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;
    console.log('\nShutdown requested from Dashboard. Cleaning up...');

    // Allow response to deliver before exiting
    setTimeout(async () => {
      await this.dispose();
      await this.registry.disposeAll();
      console.log('Process exited gracefully.');
      process.exit(0);
    }, 100);
  }

  async dispose(): Promise<void> {
    if (this.server) {
      this.clients.forEach(client => client.end());
      this.clients = [];
      await new Promise<void>((resolve) => {
        this.server!.close(() => resolve());
      });
      this.server = null;
      console.log('SDOA Monitor Dashboard server stopped.');
    }
  }

  private getDashboardHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SDOA v5 Core Engine Monitor</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Outfit:wght@400;500;600;700&family=Fira+Code:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-primary: #080a13;
      --bg-secondary: rgba(17, 21, 41, 0.7);
      --border-color: rgba(255, 255, 255, 0.08);
      --text-main: #e2e8f0;
      --text-muted: #94a3b8;
      --color-cyan: #06b6d4;
      --color-blue: #3b82f6;
      --color-purple: #a855f7;
      --color-emerald: #10b981;
      --color-red: #ef4444;
      --color-amber: #f59e0b;
      --glass-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
      --glass-glow-cyan: 0 0 15px rgba(6, 182, 212, 0.15);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg-primary);
      background-image:
        radial-gradient(at 10% 10%, rgba(59, 130, 246, 0.1) 0px, transparent 50%),
        radial-gradient(at 90% 90%, rgba(168, 85, 247, 0.08) 0px, transparent 50%),
        radial-gradient(at 50% 10%, rgba(6, 182, 212, 0.08) 0px, transparent 40%);
      background-attachment: fixed;
      font-family: 'Inter', sans-serif;
      color: var(--text-main);
      overflow: hidden;
      height: 100vh;
      display: flex;
      flex-direction: column;
    }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 24px;
      background: rgba(10, 12, 26, 0.8);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--border-color);
      z-index: 10;
    }
    .brand-title {
      font-family: 'Outfit', sans-serif;
      font-weight: 700;
      font-size: 20px;
      letter-spacing: 0.5px;
      background: linear-gradient(135deg, #22d3ee, #818cf8);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .brand-version {
      font-size: 11px;
      padding: 2px 6px;
      background: rgba(6, 182, 212, 0.15);
      border: 1px solid rgba(6, 182, 212, 0.3);
      color: var(--color-cyan);
      border-radius: 4px;
      font-family: 'Fira Code', monospace;
      font-weight: 500;
    }
    .status-panel { display: flex; align-items: center; gap: 16px; }
    .pulse-dot {
      width: 8px; height: 8px; border-radius: 50%;
      background-color: var(--color-emerald);
      box-shadow: 0 0 10px var(--color-emerald);
      animation: pulse 1.5s infinite alternate;
    }
    @keyframes pulse {
      0% { transform: scale(0.9); opacity: 0.6; }
      100% { transform: scale(1.2); opacity: 1; box-shadow: 0 0 14px var(--color-emerald); }
    }
    .pulse-dot.disconnected { background-color: var(--color-red); box-shadow: 0 0 10px var(--color-red); animation: none; }
    .status-text { font-size: 13px; font-weight: 500; color: var(--text-muted); }
    .btn {
      padding: 8px 16px;
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid rgba(239, 68, 68, 0.4);
      color: #f87171;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
      font-family: 'Outfit', sans-serif;
    }
    .btn:hover { background: rgba(239, 68, 68, 0.3); box-shadow: 0 0 12px rgba(239, 68, 68, 0.2); transform: translateY(-1px); }
    .main-container {
      flex: 1;
      display: grid;
      grid-template-columns: 1fr 380px;
      gap: 20px;
      padding: 20px;
      height: calc(100vh - 73px);
      min-height: 0;
    }
    .flowchart-section {
      background: var(--bg-secondary);
      border-radius: 16px;
      border: 1px solid var(--border-color);
      box-shadow: var(--glass-shadow);
      backdrop-filter: blur(16px);
      position: relative;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .section-header {
      padding: 16px 20px;
      border-bottom: 1px solid var(--border-color);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .section-title { font-family: 'Outfit', sans-serif; font-weight: 600; font-size: 16px; color: var(--text-main); }
    .svg-container { flex: 1; position: relative; background: rgba(5, 7, 14, 0.5); overflow: hidden; cursor: grab; }
    .svg-container:active { cursor: grabbing; }
    #flowchartSvg { width: 100%; height: 100%; user-select: none; }
    .sidebar-section { display: flex; flex-direction: column; gap: 20px; min-height: 0; }
    .card {
      background: var(--bg-secondary);
      border-radius: 16px;
      border: 1px solid var(--border-color);
      box-shadow: var(--glass-shadow);
      backdrop-filter: blur(16px);
      display: flex;
      flex-direction: column;
      min-height: 0;
    }
    .progress-card { padding: 20px; flex-shrink: 0; }
    .progress-title-row { display: flex; justify-content: space-between; margin-bottom: 12px; }
    .progress-count { font-family: 'Outfit', sans-serif; font-size: 18px; font-weight: 700; color: var(--color-cyan); }
    .progress-bar-container { width: 100%; height: 8px; background: rgba(255,255,255,0.05); border-radius: 4px; overflow: hidden; margin-bottom: 16px; }
    #progressBar { height: 100%; width: 0%; background: linear-gradient(90deg, var(--color-cyan), var(--color-blue)); border-radius: 4px; transition: width 0.3s cubic-bezier(0.4,0,0.2,1); }
    .stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .stat-box { padding: 12px; border-radius: 10px; background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); text-align: center; }
    .stat-label { font-size: 11px; color: var(--text-muted); margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
    .stat-value { font-family: 'Outfit', sans-serif; font-size: 20px; font-weight: 700; }
    .stat-value.passed { color: var(--color-emerald); }
    .stat-value.failed { color: var(--color-red); }
    .healing-card { padding: 20px; flex-shrink: 0; }
    .healing-header { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
    .healing-status-tag { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 20px; text-transform: uppercase; font-family: 'Outfit', sans-serif; }
    .healing-tag-idle { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: var(--text-muted); }
    .healing-tag-active { background: rgba(245,158,11,0.15); border: 1px solid rgba(245,158,11,0.3); color: var(--color-amber); animation: flash 1s infinite alternate; }
    @keyframes flash { 0% { opacity: 0.6; } 100% { opacity: 1; } }
    .healing-details { font-size: 13px; display: flex; flex-direction: column; gap: 6px; }
    .healing-info-row { display: flex; justify-content: space-between; }
    .healing-info-val { font-weight: 600; font-family: 'Fira Code', monospace; color: var(--text-main); }
    .healing-patch-area { margin-top: 10px; background: rgba(5,7,14,0.6); border: 1px solid var(--border-color); border-radius: 8px; padding: 10px; font-family: 'Fira Code', monospace; font-size: 11px; max-height: 120px; overflow-y: auto; white-space: pre-wrap; color: #cbd5e1; }
    .console-card { flex: 1; min-height: 0; display: flex; flex-direction: column; }
    .console-logs { flex: 1; padding: 16px; background: rgba(5,7,14,0.6); font-family: 'Fira Code', monospace; font-size: 12px; overflow-y: auto; border-bottom-left-radius: 15px; border-bottom-right-radius: 15px; scroll-behavior: smooth; }
    .log-entry { margin-bottom: 8px; line-height: 1.5; border-left: 2px solid transparent; padding-left: 8px; }
    .log-time { color: #64748b; margin-right: 8px; font-size: 11px; }
    .log-entry.call-start { border-color: var(--color-cyan); color: #e0f2fe; }
    .log-entry.call-end.success { border-color: var(--color-emerald); color: #d1fae5; }
    .log-entry.call-end.fail { border-color: var(--color-red); color: #fee2e2; }
    .log-entry.healing { border-color: var(--color-amber); color: #fef3c7; }
    .log-entry.test-pass { border-color: var(--color-emerald); color: var(--color-emerald); font-weight: 500; }
    .log-entry.test-fail { border-color: var(--color-red); color: #fca5a5; font-weight: 500; }
    .log-entry.info { border-color: #64748b; color: var(--text-muted); }
    .node-rect { fill: #13172e; stroke: rgba(255,255,255,0.08); stroke-width: 1.5px; transition: all 0.3s ease; rx: 10px; }
    .node:hover .node-rect { stroke: var(--color-cyan); filter: drop-shadow(0 0 8px rgba(6,182,212,0.3)); cursor: pointer; }
    .node.active .node-rect { stroke: var(--color-cyan); fill: rgba(6,182,212,0.1); filter: drop-shadow(0 0 12px rgba(6,182,212,0.4)); stroke-width: 2px; }
    .node-text-id { fill: var(--text-main); font-family: 'Outfit', sans-serif; font-weight: 600; font-size: 13px; }
    .node-text-type { fill: var(--text-muted); font-family: 'Inter', sans-serif; font-weight: 500; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
    .conn-path { fill: none; stroke: rgba(255,255,255,0.06); stroke-width: 1.5px; transition: all 0.3s ease; }
    .conn-path.active { stroke: var(--color-cyan); stroke-width: 2.5px; filter: drop-shadow(0 0 6px var(--color-cyan)); stroke-dasharray: 8 4; animation: dash 1s linear infinite; }
    @keyframes dash { to { stroke-dashoffset: -20; } }
    .detail-overlay { position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(8,10,19,0.85); backdrop-filter: blur(12px); z-index: 100; display: flex; justify-content: center; align-items: center; opacity: 0; pointer-events: none; transition: opacity 0.25s ease; }
    .detail-overlay.open { opacity: 1; pointer-events: auto; }
    .detail-modal { background: #11152d; border: 1px solid var(--border-color); border-radius: 16px; width: 500px; max-width: 90%; box-shadow: 0 20px 50px rgba(0,0,0,0.5); display: flex; flex-direction: column; overflow: hidden; transform: scale(0.95); transition: transform 0.25s cubic-bezier(0.34,1.56,0.64,1); }
    .detail-overlay.open .detail-modal { transform: scale(1); }
    .detail-header { padding: 20px; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; }
    .detail-title { font-family: 'Outfit', sans-serif; font-weight: 700; font-size: 18px; }
    .close-btn { background: transparent; border: none; color: var(--text-muted); font-size: 20px; cursor: pointer; }
    .close-btn:hover { color: var(--text-main); }
    .detail-body { padding: 20px; overflow-y: auto; max-height: 400px; display: flex; flex-direction: column; gap: 16px; font-size: 14px; }
    .detail-field { display: flex; flex-direction: column; gap: 4px; }
    .detail-field-label { font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
    .detail-field-val { font-weight: 500; }
    .detail-array { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
    .tag { font-family: 'Fira Code', monospace; font-size: 11px; padding: 3px 8px; border-radius: 4px; background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); }
    .tag-cyan { color: var(--color-cyan); background: rgba(6,182,212,0.08); border-color: rgba(6,182,212,0.2); }
  </style>
</head>
<body>
  <header>
    <div class="brand-title">
      SDOA Core Monitor
      <span class="brand-version">v5.0.0</span>
    </div>
    <div class="status-panel">
      <div class="pulse-dot" id="connStatusDot"></div>
      <div class="status-text" id="connStatusText">SSE Synchronizing...</div>
      <button class="btn" id="shutdownBtn">Graceful Shutdown</button>
    </div>
  </header>

  <div class="main-container">
    <div class="flowchart-section">
      <div class="section-header">
        <div class="section-title">SDOA Registry Flowchart</div>
        <div class="status-text">Click nodes to view full manifest data</div>
      </div>
      <div class="svg-container" id="svgContainer">
        <svg id="flowchartSvg">
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="22" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 1 L 10 5 L 0 9 z" fill="rgba(255,255,255,0.15)"/>
            </marker>
            <marker id="arrow-active" viewBox="0 0 10 10" refX="22" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#06b6d4"/>
            </marker>
          </defs>
          <g id="connectionsGroup"></g>
          <g id="nodesGroup"></g>
        </svg>
      </div>
    </div>

    <div class="sidebar-section">
      <div class="card progress-card">
        <div class="progress-title-row">
          <div class="section-title">Test Runner Executions</div>
          <div class="progress-count" id="progressPct">0%</div>
        </div>
        <div class="progress-bar-container">
          <div id="progressBar"></div>
        </div>
        <div class="stats-grid">
          <div class="stat-box"><div class="stat-label">Performed</div><div class="stat-value" id="statPerformed">0</div></div>
          <div class="stat-box"><div class="stat-label">Passed</div><div class="stat-value passed" id="statPassed">0</div></div>
          <div class="stat-box"><div class="stat-label">Failed</div><div class="stat-value failed" id="statFailed">0</div></div>
          <div class="stat-box"><div class="stat-label">Total Suite</div><div class="stat-value" id="statTotal">1,496,146</div></div>
        </div>
      </div>

      <div class="card healing-card">
        <div class="progress-title-row">
          <div class="section-title">AI Compiler Self-Healing</div>
          <span class="healing-status-tag healing-tag-idle" id="healingTag">IDLE</span>
        </div>
        <div class="healing-details" style="margin-top: 10px;">
          <div class="healing-info-row"><span style="color: var(--text-muted);">Failed Expr:</span><span class="healing-info-val" id="healingExpr">-</span></div>
          <div class="healing-info-row"><span style="color: var(--text-muted);">Expected:</span><span class="healing-info-val" style="color: var(--color-emerald);" id="healingExpected">-</span></div>
          <div class="healing-info-row"><span style="color: var(--text-muted);">Received:</span><span class="healing-info-val" style="color: var(--color-red);" id="healingActual">-</span></div>
        </div>
        <div class="healing-patch-area" id="patchDiffArea">Model patch area. Waiting for execution failure...</div>
      </div>

      <div class="card console-card">
        <div class="section-header">
          <div class="section-title">Real-time SDOA Call Traces</div>
        </div>
        <div class="console-logs" id="consoleLogs">
          <div class="log-entry info"><span class="log-time">[SYSTEM]</span> Connecting to SDOA SSE stream...</div>
        </div>
      </div>
    </div>
  </div>

  <div class="detail-overlay" id="detailOverlay">
    <div class="detail-modal">
      <div class="detail-header">
        <div class="detail-title" id="modalTitle">Registry.service</div>
        <button class="close-btn" id="modalClose">x</button>
      </div>
      <div class="detail-body">
        <div class="detail-field"><div class="detail-field-label">Layer & Runtime</div><div class="detail-field-val" id="modalMeta">Layer 3 | NodeJS</div></div>
        <div class="detail-field"><div class="detail-field-label">Description</div><div class="detail-field-val" id="modalDesc">Auto-discovering registry.</div></div>
        <div class="detail-field"><div class="detail-field-label">Requires / Dependencies</div><div class="detail-array" id="modalRequires"></div></div>
        <div class="detail-field"><div class="detail-field-label">Exposed Commands</div><div class="detail-array" id="modalCommands"></div></div>
      </div>
    </div>
  </div>

  <script>
    const NODE_POSITIONS = {
      "Registry.service": { x: 100, y: 150 },
      "WasmSolver.engine": { x: 100, y: 350 },
      "Logger.service": { x: 350, y: 80 },
      "Comparators.service": { x: 350, y: 180 },
      "Evaluator.service": { x: 350, y: 280 },
      "AiBroker.adapter": { x: 350, y: 380 },
      "VisualOrchestrator.service": { x: 350, y: 480 },
      "TestCore.workflow": { x: 600, y: 280 },
      "TestRunner.workflow": { x: 820, y: 280 }
    };

    let blueprint = null;
    let eventSource = null;
    let nodeElements = {};
    let pathElements = {};

    async function loadFlowchart() {
      try {
        const response = await fetch('/api/blueprint');
        blueprint = await response.json();
        renderGraph(blueprint);
      } catch (err) {
        console.error('Failed to load blueprint:', err);
      }
    }

    function renderGraph(bp) {
      const connectionsGroup = document.getElementById('connectionsGroup');
      const nodesGroup = document.getElementById('nodesGroup');
      connectionsGroup.innerHTML = '';
      nodesGroup.innerHTML = '';

      bp.connections.forEach(conn => {
        const from = NODE_POSITIONS[conn.from];
        const to = NODE_POSITIONS[conn.to];
        if (!from || !to) return;
        const startX = from.x + 120, startY = from.y + 25;
        const endX = to.x, endY = to.y + 25;
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        const cp1x = startX + (endX - startX) * 0.4, cp1y = startY;
        const cp2x = startX + (endX - startX) * 0.6, cp2y = endY;
        path.setAttribute("d", \`M \${startX} \${startY} C \${cp1x} \${cp1y}, \${cp2x} \${cp2y}, \${endX} \${endY}\`);
        path.setAttribute("class", "conn-path");
        path.setAttribute("marker-end", "url(#arrow)");
        connectionsGroup.appendChild(path);
        pathElements[\`\${conn.from}->\${conn.to}\`] = path;
      });

      bp.nodes.forEach(node => {
        const pos = NODE_POSITIONS[node.id] || { x: 100, y: 100 };
        const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
        g.setAttribute("class", "node");
        g.setAttribute("transform", \`translate(\${pos.x}, \${pos.y})\`);
        g.addEventListener('click', () => showNodeDetails(node));
        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.setAttribute("width", "180");
        rect.setAttribute("height", "50");
        rect.setAttribute("class", "node-rect");
        const titleText = document.createElementNS("http://www.w3.org/2000/svg", "text");
        titleText.setAttribute("x", "12"); titleText.setAttribute("y", "23"); titleText.setAttribute("class", "node-text-id");
        titleText.textContent = node.id.replace('.service','').replace('.workflow','').replace('.adapter','').replace('.engine','');
        const typeText = document.createElementNS("http://www.w3.org/2000/svg", "text");
        typeText.setAttribute("x", "12"); typeText.setAttribute("y", "38"); typeText.setAttribute("class", "node-text-type");
        typeText.textContent = node.type;
        g.appendChild(rect); g.appendChild(titleText); g.appendChild(typeText);
        nodesGroup.appendChild(g);
        nodeElements[node.id] = g;
      });
    }

    const detailOverlay = document.getElementById('detailOverlay');
    function showNodeDetails(node) {
      document.getElementById('modalTitle').textContent = node.id;
      document.getElementById('modalMeta').textContent = \`Layer \${node.layer} | Runtime: \${node.version ? 'v' + node.version : ''} (\${node.type})\`;
      document.getElementById('modalDesc').textContent = node.description || "No description provided.";
      const reqEl = document.getElementById('modalRequires');
      reqEl.innerHTML = '';
      const matchingNode = blueprint.nodes.find(n => n.id === node.id);
      if (matchingNode && matchingNode.requires && matchingNode.requires.length) {
        matchingNode.requires.forEach(r => { const span = document.createElement('span'); span.className = 'tag'; span.textContent = r; reqEl.appendChild(span); });
      } else { reqEl.innerHTML = '<span style="color: var(--text-muted)">None</span>'; }
      const cmdEl = document.getElementById('modalCommands');
      cmdEl.innerHTML = '';
      if (node.commands && node.commands.length) {
        node.commands.forEach(cmd => { const span = document.createElement('span'); span.className = 'tag tag-cyan'; span.textContent = cmd; cmdEl.appendChild(span); });
      } else { cmdEl.innerHTML = '<span style="color: var(--text-muted)">None</span>'; }
      detailOverlay.classList.add('open');
    }

    document.getElementById('modalClose').addEventListener('click', () => { detailOverlay.classList.remove('open'); });
    detailOverlay.addEventListener('click', (e) => { if (e.target === detailOverlay) detailOverlay.classList.remove('open'); });

    const consoleLogs = document.getElementById('consoleLogs');
    function addLog(text, className) {
      const entry = document.createElement('div');
      entry.className = \`log-entry \${className}\`;
      const timeSpan = document.createElement('span');
      timeSpan.className = 'log-time';
      const now = new Date();
      timeSpan.textContent = \`[\${now.toTimeString().split(' ')[0]}]\`;
      entry.appendChild(timeSpan);
      entry.appendChild(document.createTextNode(text));
      consoleLogs.appendChild(entry);
      consoleLogs.scrollTop = consoleLogs.scrollHeight;
    }

    let activeCalls = {};
    function triggerCallHighlight(fromId, toId) {
      const pathKey = \`\${fromId}->\${toId}\`;
      const p = pathElements[pathKey];
      if (p) { p.classList.add('active'); p.setAttribute("marker-end", "url(#arrow-active)"); }
      if (nodeElements[fromId]) nodeElements[fromId].classList.add('active');
      if (nodeElements[toId]) nodeElements[toId].classList.add('active');
    }
    function removeCallHighlight(fromId, toId) {
      const pathKey = \`\${fromId}->\${toId}\`;
      const p = pathElements[pathKey];
      if (p) { p.classList.remove('active'); p.setAttribute("marker-end", "url(#arrow)"); }
      if (nodeElements[fromId]) nodeElements[fromId].classList.remove('active');
      if (nodeElements[toId]) nodeElements[toId].classList.remove('active');
    }

    function connectSse() {
      eventSource = new EventSource('/events');
      eventSource.onopen = () => {
        document.getElementById('connStatusDot').classList.remove('disconnected');
        document.getElementById('connStatusText').textContent = 'Connected (Live Monitoring)';
        addLog('Connected to core SSE telemetry feed.', 'info');
      };
      eventSource.onerror = () => {
        document.getElementById('connStatusDot').classList.add('disconnected');
        document.getElementById('connStatusText').textContent = 'Disconnected. Retrying...';
        addLog('Telemetry connection lost. Trying to reconnect...', 'test-fail');
      };
      eventSource.onmessage = (event) => { handleTelemetryEvent(JSON.parse(event.data)); };
    }

    function handleTelemetryEvent(msg) {
      const key = \`\${msg.moduleId}.\${msg.commandName}\`;
      switch (msg.type) {
        case 'call-start':
          activeCalls[key] = msg;
          addLog(\`Executing command: \${msg.moduleId} -> \${msg.commandName}()\`, 'call-start');
          if (blueprint) { blueprint.connections.forEach(conn => { if (conn.from === msg.moduleId || conn.to === msg.moduleId) triggerCallHighlight(conn.from, conn.to); }); }
          if (nodeElements[msg.moduleId]) nodeElements[msg.moduleId].classList.add('active');
          break;
        case 'call-end':
          delete activeCalls[key];
          const durationText = msg.duration !== undefined ? \` (\${msg.duration}ms)\` : '';
          if (msg.success) addLog(\`Completed: \${msg.moduleId}.\${msg.commandName}()\${durationText}\`, 'call-end success');
          else addLog(\`Failed: \${msg.moduleId}.\${msg.commandName}() - \${msg.error}\`, 'call-end fail');
          setTimeout(() => {
            if (nodeElements[msg.moduleId]) nodeElements[msg.moduleId].classList.remove('active');
            if (blueprint) blueprint.connections.forEach(conn => { if (conn.from === msg.moduleId || conn.to === msg.moduleId) removeCallHighlight(conn.from, conn.to); });
          }, 300);
          break;
        case 'test-run':
          if (msg.success) addLog(\`[TEST] Line \${msg.line}: "\${msg.expr}" evaluation MATCHED expectation. (Result: \${msg.result})\`, 'test-pass');
          else addLog(\`[TEST] Line \${msg.line}: "\${msg.expr}" evaluation FAILED. (Got: \${msg.result}, Expected: \${msg.expected})\`, 'test-fail');
          break;
        case 'progress-update':
          const pct = Math.round((msg.performed / msg.total) * 100);
          document.getElementById('progressPct').textContent = pct + '%';
          document.getElementById('progressBar').style.width = pct + '%';
          document.getElementById('statPerformed').textContent = msg.performed.toLocaleString();
          document.getElementById('statPassed').textContent = msg.succeeded.toLocaleString();
          document.getElementById('statFailed').textContent = msg.failed.toLocaleString();
          document.getElementById('statTotal').textContent = msg.total.toLocaleString();
          break;
        case 'healing-event':
          addLog(\`[AI COMPILER] \${msg.message || ''}\`, 'healing');
          const tag = document.getElementById('healingTag');
          if (msg.status === 'thinking') {
            tag.className = 'healing-status-tag healing-tag-active'; tag.textContent = 'THINKING';
            document.getElementById('healingExpr').textContent = msg.expr;
            document.getElementById('healingExpected').textContent = JSON.stringify(msg.expected);
            document.getElementById('healingActual').textContent = JSON.stringify(msg.actual);
            document.getElementById('patchDiffArea').textContent = msg.message;
          } else if (msg.status === 'compiled') {
            tag.className = 'healing-status-tag healing-tag-idle'; tag.textContent = 'COMPILED';
            document.getElementById('patchDiffArea').textContent = 'Self-healing synthesis successful. Applying patch to disk: ' + msg.message;
          } else if (msg.status === 'complete') {
            tag.className = 'healing-status-tag healing-tag-idle'; tag.textContent = 'COMPLETE';
            document.getElementById('patchDiffArea').textContent = 'Engine compilation hot swapped successfully in active memory!';
          } else {
            tag.className = 'healing-status-tag healing-tag-idle'; tag.textContent = 'IDLE';
          }
          break;
        case 'module-registered':
          addLog(\`Module Registered: \${msg.moduleId} (Type: \${msg.manifest.type})\`, 'info');
          if (blueprint) loadFlowchart();
          break;
      }
    }

    document.getElementById('shutdownBtn').addEventListener('click', async () => {
      if (confirm('Shut down SDOA Monitor Dashboard and terminate the current Test Run?')) {
        addLog('Graceful shutdown initiated...', 'info');
        try { await fetch('/api/shutdown'); } catch (e) {}
        document.getElementById('connStatusText').textContent = 'Server Stopped';
        document.getElementById('connStatusDot').className = 'pulse-dot disconnected';
      }
    });

    window.addEventListener('load', async () => { await loadFlowchart(); connectSse(); });
  </script>
</body>
</html>`;
  }
}
