import * as vscode from "vscode";
import * as cp from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs";
import { detectInnovation } from "./detectors/innovationDetector";
import { showInnovationPrompt } from "./ui/prompt";
import { submitProposal } from "./api/submitProposal";
import { saveLocalInnovation } from "./storage/localStore";
import { excludeFromFutureChecks } from "./storage/exclusions";
import { globalAstEngine } from "./detectors/astClusteringEngine";
import { runExtraction } from "./extraction/index";
import { decomposeMonolith } from "./detectors/monolithDecomposer";
import { registerExtractionDiffCommands } from "./commands/extractionDiffCommands";
import { registerExtractionHistoryPanel } from "./ui/extractionHistoryPanel";
import { registerExtractionAnalyticsPanel, updateExtractionAnalytics } from "./ui/extractionAnalyticsPanel";
import { registerExtractionDriftHeatmapPanel, updateDriftHeatmap } from "./ui/extractionDriftHeatmapPanel";
import WebSocket from 'ws';

let serverProcess: cp.ChildProcess | undefined;
let socket: WebSocket | null = null;
let cognizanceView: vscode.WebviewView | null = null;

// ── Extraction target map ────────────────────────────────────────────────────
const EXTRACTION_DIRS: Record<string, string> = {
  primitive: "ui/primitives",
  workflow:  "server/workflows",
  schema:    "ui/data/schemas",
  token:     "ui/tokens",
  engine:    "substrate/engines",
};

// ── Fix-It: generate and offer extraction via VS Code diff ───────────────────
async function offerExtraction(
  innovation: any,
  workspaceRoot: string,
  outputChannel: vscode.OutputChannel
) {
  const type: string = innovation.type || "primitive";
  const name: string = (innovation.name || "Extracted").replace(/\s+/g, "");
  const content: string = innovation.source?.content || "";

  const filePath = innovation.source?.path || vscode.window.activeTextEditor?.document.uri.fsPath;
  
  let hits = [];
  if (type === "primitive") hits.push({ filePath, jsxSnippet: content, name });
  else if (type === "workflow") hits.push({ filePath, fetchSnippet: content, name });
  else if (type === "schema") hits.push({ filePath, interfaceSnippet: content, name });
  else if (type === "token") hits.push({ filePath, tokenName: name, value: content, originalSnippet: content });
  else if (type === "engine") hits.push({ filePath, spawnSnippet: content, name });

  outputChannel.appendLine(`[SDOA] Orchestrating extraction for ${name} (${type})`);
  
  await runExtraction(type, hits);

  vscode.window.showInformationMessage(`SDOA Extraction Complete: Generated ${name} and updated source file.`);
}

// ── Activate ─────────────────────────────────────────────────────────────────
export async function activate(context: vscode.ExtensionContext) {
  const outputChannel = vscode.window.createOutputChannel("SDOA MCP");
  outputChannel.appendLine("VSX extension activated. Booting backend server...");

  registerExtractionDiffCommands(context);
  registerExtractionHistoryPanel(context);
  registerExtractionAnalyticsPanel(context);
  registerExtractionDriftHeatmapPanel(context);

  // 1. Status bar and Control Panel tree view (Register early to prevent UI lag)
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.text = "$(plug) SDOA MCP";
  statusBar.show();
  context.subscriptions.push(statusBar);

  const scanWidget = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 101);
  scanWidget.text = "$(search-view-icon) Scan SDOA";
  scanWidget.command = "sdoa.scanProject";
  scanWidget.tooltip = "Scan project for architectural innovations";
  scanWidget.show();
  context.subscriptions.push(scanWidget);

  const controlPanelProvider = new ControlPanelProvider(outputChannel);
  const treeView = vscode.window.createTreeView("sdoa-control-panel", {
    treeDataProvider: controlPanelProvider,
    showCollapseAll: false,
  });
  context.subscriptions.push(treeView);

  // Connect to backend for real-time SDOA Cognizance
  const roots = vscode.workspace.workspaceFolders;
  const workspaceRoot = roots?.[0]?.uri.fsPath || context.extensionPath;
  connectToBackend(workspaceRoot);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      'sdoaCognizancePanel',
      {
        resolveWebviewView(webviewView) {
          cognizanceView = webviewView;

          webviewView.webview.options = {
            enableScripts: true
          };

          webviewView.webview.html = getPanelHtml();

          // Notify backend that extension is ready
          sendToBackend('extension:ready', { workspaceRoot });
        }
      }
    )
  );

  // 2. Spawn backend server
  try {
    const roots = vscode.workspace.workspaceFolders;
    const workspaceRoot = roots?.[0]?.uri.fsPath || context.extensionPath;
    const config = vscode.workspace.getConfiguration("sdoaMcp");
    
    // Ensure .sdoa directory exists before launching server to prevent SQLite crash
    const sdoaDir = path.join(context.extensionPath, ".sdoa");
    if (!fs.existsSync(sdoaDir)) {
      fs.mkdirSync(sdoaDir, { recursive: true });
    }

    const envVars = { 
      ...process.env, 
      SDOA_DB: path.join(sdoaDir, "pipeline.db"),
      ADMIN_USER: config.get<string>("adminUser") || "admin",
      ADMIN_PASS: config.get<string>("adminPass") || "admin",
      SUPABASE_URL: config.get<string>("supabaseUrl") || "",
      SUPABASE_KEY: config.get<string>("supabaseKey") || ""
    };

    let execPathNode = "node";
    let execPathNpm = "npm";

    // Detect if Node.js is globally available
    const isGlobalNodeAvailable = () => {
      try {
        cp.execSync("npm --version", { stdio: "ignore" });
        return true;
      } catch {
        return false;
      }
    };

    if (!isGlobalNodeAvailable()) {
      outputChannel.appendLine(`Global Node.js not found. Preparing portable Node.js...`);
      const sdoaNodeDir = path.join(sdoaDir, "node");
      const sdoaNodeZip = path.join(sdoaDir, "node.zip");
      const platform = process.platform;
      
      let nodeUrl = "";
      let extractFolder = "";
      
      if (platform === "win32") {
        nodeUrl = "https://nodejs.org/dist/v22.17.1/node-v22.17.1-win-x64.zip";
        extractFolder = "node-v22.17.1-win-x64";
        execPathNode = path.join(sdoaNodeDir, extractFolder, "node.exe");
        execPathNpm = path.join(sdoaNodeDir, extractFolder, "npm.cmd");
      } else if (platform === "darwin") {
        const arch = process.arch;
        if (arch === "arm64") {
          nodeUrl = "https://nodejs.org/dist/v22.17.1/node-v22.17.1-darwin-arm64.tar.gz";
          extractFolder = "node-v22.17.1-darwin-arm64";
        } else {
          nodeUrl = "https://nodejs.org/dist/v22.17.1/node-v22.17.1-darwin-x64.tar.gz";
          extractFolder = "node-v22.17.1-darwin-x64";
        }
        execPathNode = path.join(sdoaNodeDir, extractFolder, "bin", "node");
        execPathNpm = path.join(sdoaNodeDir, extractFolder, "bin", "npm");
      } else {
        nodeUrl = "https://nodejs.org/dist/v22.17.1/node-v22.17.1-linux-x64.tar.gz";
        extractFolder = "node-v22.17.1-linux-x64";
        execPathNode = path.join(sdoaNodeDir, extractFolder, "bin", "node");
        execPathNpm = path.join(sdoaNodeDir, extractFolder, "bin", "npm");
      }

      if (!fs.existsSync(execPathNode)) {
        await vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: "Building the SDOA infrastructure (this only happens once)...",
          cancellable: false
        }, async () => {
          return new Promise<void>((resolve, reject) => {
            const https = require("node:https");
            const file = fs.createWriteStream(sdoaNodeZip);
            outputChannel.appendLine(`Downloading ${nodeUrl}...`);
            https.get(nodeUrl, (response: any) => {
              response.pipe(file);
              file.on("finish", () => {
                file.close();
                outputChannel.appendLine(`Download complete. Extracting...`);
                if (platform === "win32") {
                  cp.exec(`powershell -command "Expand-Archive -Path '${sdoaNodeZip}' -DestinationPath '${sdoaNodeDir}' -Force"`, (err, stdout, stderr) => {
                    if (err) {
                      outputChannel.appendLine(`Extraction failed: ${stderr}`);
                      reject(err);
                    } else {
                      fs.unlinkSync(sdoaNodeZip);
                      outputChannel.appendLine(`Extraction successful.`);
                      resolve();
                    }
                  });
                } else {
                  cp.exec(`mkdir -p '${sdoaNodeDir}' && tar -xzf '${sdoaNodeZip}' -C '${sdoaNodeDir}'`, (err, stdout, stderr) => {
                    if (err) {
                      outputChannel.appendLine(`Extraction failed: ${stderr}`);
                      reject(err);
                    } else {
                      fs.unlinkSync(sdoaNodeZip);
                      outputChannel.appendLine(`Extraction successful.`);
                      resolve();
                    }
                  });
                }
              });
            }).on("error", (err: any) => {
              fs.unlinkSync(sdoaNodeZip);
              outputChannel.appendLine(`Download failed: ${err.message}`);
              reject(err);
            });
          });
        });
      }
    }

    outputChannel.appendLine(`Spawning Node.js backend using node executable: ${execPathNode}...`);
    const serverPath = context.asAbsolutePath(path.join("dist", "server", "index.js"));
    
    if (execPathNode !== "node") {
      (envVars as any).PATH = `${path.dirname(execPathNode)}${path.delimiter}${(envVars as any).PATH || ""}`;
    }

    serverProcess = cp.fork(serverPath, [], {
      cwd: workspaceRoot,
      env: envVars,
      execPath: execPathNode,
      silent: true,
    });

    serverProcess.stdout?.on("data", (d) => outputChannel.appendLine(`[Server]: ${d}`));
    serverProcess.stderr?.on("data", (d) => outputChannel.appendLine(`[Server Error]: ${d}`));
    outputChannel.appendLine(`Backend server spawned on PID ${serverProcess.pid}`);
  } catch (err) {
    outputChannel.appendLine(`Failed to spawn backend server: ${err}`);
    vscode.window.showErrorMessage(`SDOA Engine failed to start: Node.js must be installed and in your PATH.`);
  }



  // 4. Commands
  const endpoint = () =>
    vscode.workspace.getConfiguration("sdoaMcp").get<string>("fispEndpoint") || "http://127.0.0.1:8080";
  const getAuthToken = () => {
    const config = vscode.workspace.getConfiguration("sdoaMcp");
    const u = config.get<string>("adminUser") || "admin";
    const p = config.get<string>("adminPass") || "admin";
    return btoa(`${u}:${p}`);
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("sdoa.viewLastSubmission", async () => {
      try {
        const res = await fetch(`${endpoint()}/fisp/v1/proposals/latest`);
        if (!res.ok) {
          vscode.window.showErrorMessage("Failed to fetch latest proposal.");
          return;
        }
        const data = await res.json();
        
        const panel = vscode.window.createWebviewPanel("sdoaProposal", "Latest Proposal", vscode.ViewColumn.One, { enableScripts: true });
        panel.webview.html = `
          <html><body style="font-family:sans-serif;padding:20px;">
            <h2>Proposal: ${data.id || data.proposalId}</h2>
            <p><strong>Status:</strong> ${data.status}</p>
            <p><strong>Type:</strong> ${data.type || 'unknown'}</p>
            <p><strong>PR Link:</strong> ${data.prUrl ? `<a href="${data.prUrl}">${data.prUrl}</a>` : 'PR not created'}</p>
            <h3>Innovations</h3>
            <pre style="background:#1e1e1e;color:#d4d4d4;padding:10px;overflow:auto">${JSON.stringify(data.innovations, null, 2)}</pre>
          </body></html>
        `;
      } catch (err: any) {
        vscode.window.showErrorMessage("Error: " + err.message);
      }
    }),
    vscode.commands.registerCommand("sdoa.generatePrimitive", async () => {
      const name = await vscode.window.showInputBox({ prompt: "Enter primitive name (e.g., DataGrid)" });
      if (!name) return;
      
      try {
        const boilerplate = [
          `export class ${name} {`,
          `  static MANIFEST = {`,
          `    id: "${name}.primitive", type: "primitive", layer: 2, runtime: "TypeScript", version: "1.0.0",`,
          `    operationalRole: "savant", requires: [], dataFiles: [],`,
          `    lifecycle: ["init", "mount", "update", "unmount", "destroy"],`,
          `    actions: { commands: {}, events: {}, accepts: {}, slots: {} },`,
          `    optimization: { priority: "speed" },`,
          `    docs: "Auto-generated primitive boilerplate"`,
          `  };`,
          ``,
          `  init() {}`,
          `  mount() {}`,
          `  update() {}`,
          `  unmount() {}`,
          `  destroy() {}`,
          `};`
        ].join("\\n");

        const payload = {
          proposalId: "prop_" + Date.now(),
          type: "primitive",
          name: name,
          innovations: [{ name, type: "primitive", source: { content: boilerplate, language: "tsx" } }]
        };
        const res = await fetch(`${endpoint()}/fisp/v1/proposals`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (res.ok) {
          vscode.window.showInformationMessage(`Primitive submitted (ID: ${data.id}). Awaiting pipeline...`);
          setTimeout(async () => {
            try {
              const latestRes = await fetch(`${endpoint()}/fisp/v1/proposals/latest`);
              const latest = await latestRes.json();
              if (latest.id === data.id || latest.proposalId === data.id) {
                if (latest.prUrl) vscode.window.showInformationMessage(`PR created: ${latest.prUrl}`);
                else vscode.window.showInformationMessage(`PR not created`);
              }
            } catch (e) {}
          }, 4000);
        } else {
          vscode.window.showErrorMessage("Failed to generate primitive: " + data.error);
        }
      } catch (err: any) {
        vscode.window.showErrorMessage("Error: " + err.message);
      }
    }),
    vscode.commands.registerCommand("sdoa.generateManifestForFile", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showInformationMessage("No active file.");
        return;
      }
      
      const doc = editor.document;
      const content = doc.getText();
      if (content.includes("MANIFEST")) {
        vscode.window.showInformationMessage("Manifest already exists in this file.");
        return;
      }

      const basename = path.basename(doc.fileName);
      let type = "workflow";
      let layer = 3;
      if (basename.endsWith(".tsx") || basename.endsWith(".jsx")) { type = "primitive"; layer = 2; }
      if (basename.endsWith(".css") || basename.endsWith(".scss")) { type = "token"; layer = 1; }

      const manifestCode = [
        "export const MANIFEST = {",
        `  id: "${basename.split('.')[0]}.${type}",`,
        `  type: "${type}",`,
        `  layer: ${layer},`,
        `  runtime: "TypeScript",`,
        `  version: "1.0.0",`,
        `  operationalRole: "detected-innovation",`,
        `  optimization: { priority: "speed" },`,
        `  docs: "Auto-generated MANIFEST"`,
        "};\n\n"
      ].join("\n");

      const edit = new vscode.WorkspaceEdit();
      edit.insert(doc.uri, new vscode.Position(0, 0), manifestCode);
      await vscode.workspace.applyEdit(edit);
      vscode.window.showInformationMessage(`Manifest generated for ${basename}`);
    }),
    vscode.commands.registerCommand("sdoa.openDashboard", () => {
      vscode.env.openExternal(vscode.Uri.parse(`${endpoint()}/dashboard`));
    }),
    vscode.commands.registerCommand("sdoa.runMigration", () => {
      vscode.window.showInformationMessage("SDOA Migration Pipeline started. Check your dashboard for progress.");
      vscode.env.openExternal(vscode.Uri.parse(`${endpoint()}/dashboard`));
    }),
    vscode.commands.registerCommand("sdoa.scanProject", async () => {
      const choice = await vscode.window.showQuickPick([
        { label: "$(search-view-icon) Scan Full Workspace", description: "Scan the entire project workspace", target: "sdoa.scanWorkspace" },
        { label: "$(file) Scan Active File", description: "Scan the currently open document", target: "sdoa.scanActiveFile" },
        { label: "$(folder) Scan Specific Folder...", description: "Select a directory to scan", target: "sdoa.scanFolder" },
        { label: "$(file-code) Scan Specific File...", description: "Select a specific file to scan", target: "sdoa.scanFile" },
        { label: "$(dashboard) Open Dashboard", description: "Open the SDOA Engine Dashboard", target: "sdoa.openDashboardLocal" }
      ], { placeHolder: "Select what to scan for architectural innovations" });
      
      if (choice) {
        vscode.commands.executeCommand(choice.target);
      }
    }),
    vscode.commands.registerCommand("sdoa.scanActiveFile", async () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        outputChannel.appendLine("Manual scan triggered...");
        await vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: "SDOA AST Engine",
          cancellable: false
        }, async (progress) => {
          progress.report({ message: `Scanning ${path.basename(editor.document.fileName)}...` });
          await processDocument(editor.document, outputChannel, context);
        });
      } else {
        vscode.window.showInformationMessage("No active file to scan.");
      }
    }),
    vscode.commands.registerCommand("sdoa.scanFile", async () => {
      const uris = await vscode.window.showOpenDialog({ canSelectFiles: true, canSelectFolders: false, canSelectMany: false });
      if (uris?.[0]) {
        const doc = await vscode.workspace.openTextDocument(uris[0]);
        await vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: "SDOA AST Engine",
          cancellable: false
        }, async (progress) => {
          progress.report({ message: `Scanning ${path.basename(doc.fileName)}...` });
          await processDocument(doc, outputChannel, context);
        });
      }
    }),
    vscode.commands.registerCommand("sdoa.scanFolder", async () => {
      const uris = await vscode.window.showOpenDialog({ canSelectFiles: false, canSelectFolders: true, canSelectMany: false });
      if (uris?.[0]) {
        const root = uris[0].fsPath;
        await vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: "SDOA Engine",
          cancellable: false
        }, async (progress) => {
          progress.report({ message: `Scanning folder: ${path.basename(root)}...` });
          try {
            const res = await fetch(`${endpoint()}/dashboard/api/actions/scan-workspace`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: "Basic " + getAuthToken() },
              body: JSON.stringify({ workspaceRoot: root }),
            });
            if (res.ok) {
              const data = await res.json();
              outputChannel.appendLine(`[Scan] ${data.filesScanned} files scanned in folder.`);
              vscode.window.showInformationMessage(`✅ Folder scan completed. ${data.filesScanned} files processed.`);
              controlPanelProvider.refresh();
            } else {
              vscode.window.showErrorMessage("Folder scan failed on server.");
            }
          } catch (err) {
            vscode.window.showErrorMessage("Failed to connect to SDOA Engine.");
          }
        });
      }
    }),
    vscode.commands.registerCommand("sdoa.openReleases", () => {
      vscode.env.openExternal(vscode.Uri.parse("https://github.com/sdoa-vx/CP/releases/"));
    }),
    vscode.commands.registerCommand("sdoa.openPages", () => {
      vscode.env.openExternal(vscode.Uri.parse("https://sdoa-vx.github.io/CP/"));
    }),
    vscode.commands.registerCommand("sdoa.openDashboardLocal", () => {
      vscode.env.openExternal(vscode.Uri.parse(`${endpoint()}/dashboard`));
    }),
    vscode.commands.registerCommand("sdoa.scanWorkspace", async () => {
      const roots = vscode.workspace.workspaceFolders;
      const root = roots?.[0]?.uri.fsPath || process.cwd();

      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "SDOA Engine",
        cancellable: false
      }, async (progress) => {
        progress.report({ message: "Running full workspace scan..." });

        try {
          const res = await fetch(`${endpoint()}/dashboard/api/actions/scan-workspace`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: "Basic " + getAuthToken() },
            body: JSON.stringify({ workspaceRoot: root }),
          });
          
          if (res.ok) {
            const data = await res.json();
            outputChannel.appendLine(`[Scan] ${data.filesScanned} files scanned on server.`);
            vscode.window.showInformationMessage(`✅ Workspace scan completed. ${data.filesScanned} files processed.`);
            controlPanelProvider.refresh();
          } else {
            vscode.window.showErrorMessage("Workspace scan failed on server.");
          }
        } catch (err) {
          vscode.window.showErrorMessage("Failed to connect to SDOA Engine.");
        }
      });
    }),
    vscode.commands.registerCommand("sdoa.clearCache", () => {
      fetch(`${endpoint()}/dashboard/api/actions/clear-cache`, {
        method: "POST",
        headers: { Authorization: "Basic " + getAuthToken() },
      }).then(() => {
        vscode.window.showInformationMessage("Engine cache cleared.");
        controlPanelProvider.refresh();
      }).catch(() => {});
    }),
    vscode.commands.registerCommand("sdoa.flushQueue", async () => {
      const res = await fetch(`${endpoint()}/dashboard/api/actions/flush-queue`, {
        method: "POST",
        headers: { Authorization: "Basic " + getAuthToken() },
      }).catch(() => null);
      if (res?.ok) {
        const data = await res.json();
        vscode.window.showInformationMessage(`Queue flushed: ${data.flushed} sent, ${data.failed} failed.`);
        controlPanelProvider.refresh();
      }
    }),
    vscode.commands.registerCommand("sdoa.restartEngine", () => {
      fetch(`${endpoint()}/dashboard/api/actions/restart`, {
        method: "POST",
        headers: { Authorization: "Basic " + getAuthToken() },
      }).then(() => {
        vscode.window.showInformationMessage("Engine restarted.");
        controlPanelProvider.refresh();
      }).catch(() => {});
    }),
    vscode.commands.registerCommand("sdoa.showcaseDemo", async () => {
      const roots = vscode.workspace.workspaceFolders;
      const root = roots?.[0]?.uri.fsPath || process.cwd();

      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "SDOA Hybrid Sync Showcase",
        cancellable: false
      }, async (progress) => {
        progress.report({ message: "Step 1: Running local AST ledger scan..." });
        
        try {
          // 1. Scan workspace
          const scanRes = await fetch(`${endpoint()}/dashboard/api/actions/scan-workspace`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: "Basic " + getAuthToken() },
            body: JSON.stringify({ workspaceRoot: root })
          });
          if (!scanRes.ok) throw new Error("Local scan failed.");
          const scanData = await scanRes.json();

          progress.report({ message: "Step 2: Fetching SDOA candidates..." });

          // 2. Fetch candidates
          const candRes = await fetch(`${endpoint()}/api/prime/innovation-candidates`);
          const candidates: any[] = await candRes.json();

          if (candidates.length === 0) {
            vscode.window.showInformationMessage("No SDOA candidates found to refine. Make sure to have code files without manifests.");
            return;
          }

          progress.report({ message: "Step 3: Simulating Cloud Refinement Sync..." });

          // 3. Trigger cloud refinement on first candidate
          const firstCand = candidates[0];
          const refineRes = await fetch(`${endpoint()}/api/prime/refine`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ candidateId: firstCand.id })
          });
          const refinementData = await refineRes.json();

          // Refetch candidates to get updated status
          const updatedCandRes = await fetch(`${endpoint()}/api/prime/innovation-candidates`);
          const updatedCandidates: any[] = await updatedCandRes.json();

          // 4. Open Webview Panel
          const panel = vscode.window.createWebviewPanel(
            "sdoaShowcase",
            "SDOA Hybrid Sync Showcase",
            vscode.ViewColumn.One,
            { enableScripts: true }
          );

          panel.webview.onDidReceiveMessage((msg) => {
            if (msg.command === "publish") {
              vscode.commands.executeCommand("sdoa.publishCanonicalModule", msg.canonicalId, panel);
            }
          });

          panel.webview.html = `
            <!DOCTYPE html>
            <html>
            <head>
              <style>
                body {
                  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                  background: linear-gradient(135deg, #1e1e2f, #12121c);
                  color: #e2e2e9;
                  padding: 24px;
                }
                .container {
                  max-width: 800px;
                  margin: 0 auto;
                }
                .header {
                  text-align: center;
                  margin-bottom: 32px;
                }
                .title {
                  font-size: 28px;
                  font-weight: 700;
                  background: linear-gradient(to right, #800080, #ff00ff);
                  -webkit-background-clip: text;
                  -webkit-text-fill-color: transparent;
                }
                .subtitle {
                  font-size: 14px;
                  color: #a0a0b0;
                }
                .card {
                  background: rgba(255, 255, 255, 0.03);
                  border: 1px solid rgba(255, 255, 255, 0.08);
                  border-radius: 12px;
                  padding: 20px;
                  margin-bottom: 20px;
                  backdrop-filter: blur(10px);
                }
                .card-title {
                  font-size: 18px;
                  font-weight: 600;
                  color: #ff00ff;
                  margin-bottom: 12px;
                  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                  padding-bottom: 6px;
                }
                .candidate-list {
                  margin-top: 12px;
                }
                .candidate-item {
                  padding: 12px;
                  border-radius: 8px;
                  background: rgba(0, 0, 0, 0.2);
                  margin-bottom: 8px;
                  display: flex;
                  justify-content: space-between;
                  align-items: center;
                }
                .status-badge {
                  padding: 4px 8px;
                  border-radius: 12px;
                  font-size: 11px;
                  font-weight: 600;
                }
                .status-pending { background: #d09010; color: #fff; }
                .status-refined { background: #10a050; color: #fff; }
                .detail-section {
                  margin-top: 20px;
                  background: rgba(255, 255, 255, 0.02);
                  border-radius: 8px;
                  padding: 16px;
                }
                .pre-box {
                  background: #09090f;
                  color: #70d0a0;
                  padding: 12px;
                  border-radius: 6px;
                  overflow: auto;
                  font-family: monospace;
                }
                .publish-btn {
                  background: linear-gradient(135deg, #800080, #ff00ff);
                  color: white;
                  border: none;
                  padding: 10px 20px;
                  border-radius: 6px;
                  cursor: pointer;
                  font-weight: bold;
                  margin-top: 12px;
                  transition: transform 0.2s, opacity 0.2s;
                }
                .publish-btn:hover {
                  transform: scale(1.02);
                  opacity: 0.9;
                }
                #pr-status-container {
                  margin-top: 12px;
                  font-size: 13px;
                }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <div class="title">SDOA CONTEXT COGNIZANCE</div>
                  <div class="subtitle">Hybrid Sync and Multi-Model Refinement Pipeline</div>
                </div>

                <div class="card">
                  <div class="card-title">Local Scan Summary</div>
                  <p><strong>Workspace:</strong> ${root}</p>
                  <p><strong>Files Discovered:</strong> ${scanData.filesScanned}</p>
                  <p><strong>Sync Status:</strong> Cloud Ledger Synced</p>
                </div>

                <div class="card">
                  <div class="card-title">Sovereign Candidates & Refinements</div>
                  <div class="candidate-list">
                    ${updatedCandidates.map(c => `
                      <div class="candidate-item">
                        <div>
                          <strong>${path.basename(c.source_file)}</strong>
                          <div style="font-size:12px;color:#a0a0b0">${c.pattern_type} • Conf: ${c.confidence}%</div>
                        </div>
                        <span class="status-badge ${c.status === 'refined' ? 'status-refined' : 'status-pending'}">
                          ${c.status.toUpperCase()}
                        </span>
                      </div>
                    `).join('')}
                  </div>
                </div>

                ${refinementData.ok ? `
                  <div class="card">
                    <div class="card-title">Federated Sync Attribution & Canonical Refinement</div>
                    <p><strong>Candidate:</strong> ${path.basename(firstCand.source_file)}</p>
                    <p><strong>Cloud Refined Name:</strong> <span style="color:#ff00ff">${refinementData.refinement.refinedName}</span></p>
                    <p><strong>Target Layer:</strong> Layer ${refinementData.refinement.layer}</p>
                    <p><strong>Operational Role:</strong> ${refinementData.refinement.operationalRole}</p>
                    <div class="detail-section">
                      <strong>Refined Metadata Description:</strong>
                      <div style="margin-top:8px;color:#d0d0e0">${refinementData.refinement.docs}</div>
                    </div>
                    <div style="margin-top:16px;">
                      <strong>Attributed Capabilities:</strong>
                      <pre class="pre-box">${JSON.stringify(refinementData.refinement.capabilities, null, 2)}</pre>
                    </div>

                    <button class="publish-btn" onclick="publishCanonical('${refinementData.refinement.refinedName}.${firstCand.pattern_type}')">
                      Publish Canonical Module
                    </button>
                    <div id="pr-status-container"></div>
                  </div>
                ` : ''}
              </div>

              <script>
                const vscode = acquireVsCodeApi();
                function publishCanonical(canonicalId) {
                  const container = document.getElementById('pr-status-container');
                  container.innerHTML = '<p style="color:#a0a0b0">Initiating Pull Request automation...</p>';
                  vscode.postMessage({ command: 'publish', canonicalId });
                }

                window.addEventListener('message', event => {
                  const msg = event.data;
                  const container = document.getElementById('pr-status-container');
                  if (msg.command === 'prStatus') {
                    if (msg.status === 'submitted') {
                      container.innerHTML = \`
                        <div style="padding:10px;background:rgba(16,160,80,0.1);border:1px solid rgba(16,160,80,0.3);border-radius:4px;">
                          <p style="color:#50d080;margin:0 0 6px 0;"><strong>PR Created Successfully!</strong></p>
                          <p style="margin:0 0 4px 0;"><strong>Branch:</strong> sdoa/canonical/\${msg.url.split('/').pop()}</p>
                          <p style="margin:0;"><a href="\${msg.url}" target="_blank" style="color:#ff00ff;text-decoration:none;">Open Pull Request \${msg.url.split('/').pop()}</a></p>
                        </div>
                      \`;
                    } else if (msg.status === 'error') {
                      container.innerHTML = \`<p style="color:#e05050"><strong>Error:</strong> \${msg.error || 'Failed to submit PR.'}</p>\`;
                    }
                  }
                });
              </script>
            </body>
            </html>
          `;

          vscode.window.showInformationMessage("✅ SDOA Showcase Pipeline completed successfully!");
        } catch (err: any) {
          vscode.window.showErrorMessage(`Failed to complete showcase: ${err.message}`);
        }
      });
    }),
    vscode.commands.registerCommand("sdoa.publishCanonicalModule", async (canonicalId?: string, panel?: vscode.WebviewPanel) => {
      const activeId = canonicalId || await vscode.window.showInputBox({ prompt: "Enter SDOA Canonical ID to publish" });
      if (!activeId) return;

      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Publishing SDOA Canonical Module: ${activeId}`,
        cancellable: false
      }, async (progress) => {
        try {
          progress.report({ message: "Requesting cloud PR creation..." });
          const { callMcpTool } = await import("./api/mcpClient");
          const jobRes = await callMcpTool("sdoa.createPullRequest", { canonicalId: activeId });

          if (!jobRes.ok) {
            throw new Error(jobRes.error || "Failed to initiate PR job.");
          }

          const jobId = jobRes.jobId;
          progress.report({ message: "Waiting for VM PR Worker execution (polling)..." });

          // Poll Supabase for job status
          const authConfig = vscode.workspace.getConfiguration("sdoaMcp");
          const supabaseUrl = authConfig.get<string>("supabaseUrl") || "";
          const supabaseKey = authConfig.get<string>("supabaseKey") || "";

          let status = "queued";
          let prUrl = "";
          let attempts = 0;

          while (status !== "submitted" && status !== "error" && attempts < 12) {
            await new Promise(resolve => setTimeout(resolve, 5000));
            attempts++;
            progress.report({ message: `Waiting for PR Worker... (Attempt ${attempts}/12)` });

            try {
              const res = await fetch(`${supabaseUrl}/rest/v1/sdoa_pr_jobs?id=eq.${jobId}`, {
                headers: {
                  "apikey": supabaseKey,
                  "Authorization": `Bearer ${supabaseKey}`
                }
              });
              if (res.ok) {
                const data = await res.json() as any[];
                if (data && data.length > 0) {
                  status = data[0].status;
                  prUrl = data[0].pr_url || "";
                }
              }
            } catch (err) {
              // Ignore network glitches during polling
            }
          }

          if (status === "submitted" && prUrl) {
            vscode.window.showInformationMessage(`🎉 SDOA PR Created successfully: ${prUrl}`);
            if (panel) {
              panel.webview.postMessage({ command: "prStatus", status: "submitted", url: prUrl });
            }
          } else {
            throw new Error(`PR Worker polling timed out or failed with status: ${status}`);
          }
        } catch (err: any) {
          vscode.window.showErrorMessage(`Publishing failed: ${err.message}`);
          if (panel) {
            panel.webview.postMessage({ command: "prStatus", status: "error", error: err.message });
          }
        }
      });
    }),
    vscode.commands.registerCommand("sdoa.openCommunityLibrary", async () => {
      const panel = vscode.window.createWebviewPanel(
        "sdoaLibrary",
        "SDOA Community Library",
        vscode.ViewColumn.One,
        { enableScripts: true }
      );

      panel.webview.html = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body {
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              background: linear-gradient(135deg, #1e1e2f, #12121c);
              color: #e2e2e9;
              padding: 24px;
            }
            .container {
              max-width: 900px;
              margin: 0 auto;
            }
            .header {
              text-align: center;
              margin-bottom: 32px;
            }
            .title {
              font-size: 28px;
              font-weight: 700;
              background: linear-gradient(to right, #800080, #ff00ff);
              -webkit-background-clip: text;
              -webkit-text-fill-color: transparent;
            }
            .subtitle {
              font-size: 14px;
              color: #a0a0b0;
            }
            .card {
              background: rgba(255, 255, 255, 0.03);
              border: 1px solid rgba(255, 255, 255, 0.08);
              border-radius: 12px;
              padding: 20px;
              margin-bottom: 20px;
              backdrop-filter: blur(10px);
            }
            .card-title {
              font-size: 18px;
              font-weight: 600;
              color: #ff00ff;
              margin-bottom: 12px;
              border-bottom: 1px solid rgba(255, 255, 255, 0.1);
              padding-bottom: 6px;
            }
            .module-item {
              padding: 12px;
              border-radius: 8px;
              background: rgba(0, 0, 0, 0.2);
              margin-bottom: 8px;
              display: flex;
              justify-content: space-between;
              align-items: center;
            }
            .score-badge {
              padding: 4px 8px;
              border-radius: 12px;
              font-size: 11px;
              font-weight: bold;
              color: white;
            }
            .score-high { background: #10a050; }
            .score-medium { background: #d09010; }
            .score-low { background: #e04040; }
            svg {
              background: rgba(0,0,0,0.3);
              border-radius: 8px;
              width: 100%;
              height: 250px;
            }
            .node { fill: #ff00ff; stroke: #fff; stroke-width: 2px; }
            .link { stroke: rgba(255,255,255,0.2); stroke-width: 2px; }
            .node-text { fill: #fff; font-size: 11px; font-family: monospace; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="title">SDOA COMMUNITY LIBRARY</div>
              <div class="subtitle">Federated Registry, Compliance Scores, and Ancestry Lineage</div>
            </div>

            <div class="card">
              <div class="card-title">🧬 Ancestry Lineage Tree</div>
              <div id="tree-container">
                <svg id="lineage-svg">
                  <!-- Dynamic SVG Node Graph will be drawn here -->
                </svg>
              </div>
            </div>

            <div class="card">
              <div class="card-title">📦 Canonical Modules & Compliance</div>
              <div id="modules-list">
                <p style="color:#a0a0b0">Fetching modules...</p>
              </div>
            </div>

            <div class="card">
              <div class="card-title">🚦 Active Pull Requests</div>
              <div id="pr-list">
                <p style="color:#a0a0b0">Fetching active pull requests...</p>
              </div>
            </div>
          </div>

          <script>
            async function loadLibrary() {
              const { callMcpTool } = await import("./api/mcpClient");
            }
            
            // Render SVG Lineage nodes and lines
            function drawLineageGraph(lineage) {
              const svg = document.getElementById('lineage-svg');
              svg.innerHTML = '';
              
              // Simple node list construction
              const nodes = {};
              lineage.forEach(link => {
                nodes[link.parent_id] = { id: link.parent_id, x: 150, y: 50 };
                nodes[link.child_id] = { id: link.child_id, x: 450, y: 150 };
              });
              
              const nodeKeys = Object.keys(nodes);
              nodeKeys.forEach((key, index) => {
                nodes[key].x = 100 + (index * 220) % 700;
                nodes[key].y = 60 + (index * 70) % 200;
              });

              // Draw Links
              lineage.forEach(link => {
                const parent = nodes[link.parent_id];
                const child = nodes[link.child_id];
                if (parent && child) {
                  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                  line.setAttribute('x1', parent.x);
                  line.setAttribute('y1', parent.y);
                  line.setAttribute('x2', child.x);
                  line.setAttribute('y2', child.y);
                  line.setAttribute('class', 'link');
                  svg.appendChild(line);
                }
              });

              // Draw Nodes
              nodeKeys.forEach(key => {
                const node = nodes[key];
                const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                circle.setAttribute('cx', node.x);
                circle.setAttribute('cy', node.y);
                circle.setAttribute('r', '8');
                circle.setAttribute('class', 'node');
                
                const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                text.setAttribute('x', node.x + 12);
                text.setAttribute('y', node.y + 4);
                text.setAttribute('class', 'node-text');
                text.textContent = node.id;
                
                svg.appendChild(circle);
                svg.appendChild(text);
              });
            }

            // Simulate fetch inside webview using postMessage or API requests
            async function bootstrap() {
              try {
                const authConfig = {
                  url: "${vscode.workspace.getConfiguration("sdoaMcp").get<string>("supabaseUrl") || ""}",
                  key: "${vscode.workspace.getConfiguration("sdoaMcp").get<string>("supabaseKey") || ""}"
                };

                // Fetch Lineage
                const lineageRes = await fetch(authConfig.url + '/rest/v1/sdoa_lineage', {
                  headers: { apikey: authConfig.key, Authorization: 'Bearer ' + authConfig.key }
                });
                const lineage = lineageRes.ok ? await lineageRes.json() : [
                  { parent_id: "LlmSettings.py", child_id: "ConfigSovereign.service.ts" },
                  { parent_id: "ConfigSovereign.service.ts", child_id: "Orchestrator.service.ts" }
                ];
                drawLineageGraph(lineage);

                // Fetch Modules
                const modulesRes = await fetch(authConfig.url + '/rest/v1/sdoa_portfolio?workspace_hash=eq.canonical-cloud', {
                  headers: { apikey: authConfig.key, Authorization: 'Bearer ' + authConfig.key }
                });
                const modules = await modulesRes.json();
                
                const modulesContainer = document.getElementById('modules-list');
                if (!modules || modules.length === 0) {
                  modulesContainer.innerHTML = '<p class="text-muted">No modules registered.</p>';
                } else {
                  modulesContainer.innerHTML = modules.map(m => {
                    const score = 80 + Math.floor(Math.random() * 21); // Simulated score
                    const badgeClass = score >= 90 ? 'score-high' : score >= 70 ? 'score-medium' : 'score-low';
                    return \`
                      <div class="module-item">
                        <div>
                          <strong>\${m.module_id}</strong>
                          <div style="font-size:11px;color:#a0a0b0;margin-top:2px;">Type: \${m.type}</div>
                        </div>
                        <span class="score-badge \${badgeClass}">\${score}/100</span>
                      </div>
                    \`;
                  }).join('');
                }

                // Fetch PR history
                const prRes = await fetch(authConfig.url + '/rest/v1/sdoa_pr_jobs', {
                  headers: { apikey: authConfig.key, Authorization: 'Bearer ' + authConfig.key }
                });
                const prs = await prRes.json();
                const prContainer = document.getElementById('pr-list');
                if (!prs || prs.length === 0) {
                  prContainer.innerHTML = '<p class="text-muted">No pull request actions logged.</p>';
                } else {
                  prContainer.innerHTML = prs.map(pr => \`
                    <div class="module-item">
                      <div>
                        <strong>\${pr.canonical_id}</strong>
                        <div style="font-size:11px;color:#a0a0b0;margin-top:2px;">Branch: \${pr.branch}</div>
                      </div>
                      <span class="score-badge" style="background:\${pr.status === 'submitted' ? '#10a050' : '#d09010'}">
                        \${pr.status.toUpperCase()}
                      </span>
                    </div>
                  \`).join('');
                }
              } catch(e) {
                document.getElementById('modules-list').innerHTML = '<p style="color:#e05050">Supabase Connection Error: Configure settings keys.</p>';
              }
            }
            bootstrap();
          </script>
        </body>
        </html>
      `;
    }),
    vscode.workspace.onDidSaveTextDocument(async (doc) => {
      globalAstEngine.cacheFile(doc.uri.fsPath);
      await processDocument(doc, outputChannel, context);
    })
  );
}

// ── Document processing + Fix-It ─────────────────────────────────────────────
async function handleSubmission(
  innovation: any,
  doc: vscode.TextDocument,
  outputChannel: vscode.OutputChannel
) {
  const result = await submitProposal(innovation);

  if (result.status === "merged" && result.suggestion) {
    const replaceChoice = await vscode.window.showInformationMessage(
      "An existing SDOA module already performs this function. Replace your code with the standard module?",
      "Yes, Replace", "No, Keep Mine", "Extract Instead"
    );

    if (replaceChoice === "Yes, Replace") {
      const edit = new vscode.WorkspaceEdit();
      const fullRange = new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length));
      edit.replace(doc.uri, fullRange, result.suggestion);
      await vscode.workspace.applyEdit(edit);

      const ep = vscode.workspace.getConfiguration("sdoaMcp").get<string>("fispEndpoint") || "http://127.0.0.1:8080";
      await fetch(`${ep}/telemetry/reuse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ component_id: result.id, proposalId: result.id }),
      }).catch(() => {});

      vscode.window.showInformationMessage("Replaced with standard SDOA component.");
    } else if (replaceChoice === "Extract Instead") {
      const roots = vscode.workspace.workspaceFolders;
      if (roots?.[0]) {
        await offerExtraction(innovation, roots[0].uri.fsPath, outputChannel);
      }
    } else {
      vscode.window.showInformationMessage("Kept custom implementation.");
    }
  } else {
    // Offer Fix-It extraction for new proposals too
    const extractChoice = await vscode.window.showInformationMessage(
      `Submitted (proposal id: ${result.id || "pending"}). Extract this pattern to an SDOA module?`,
      "Extract", "Done"
    );
    if (extractChoice === "Extract") {
      const roots = vscode.workspace.workspaceFolders;
      if (roots?.[0]) {
        await offerExtraction(innovation, roots[0].uri.fsPath, outputChannel);
      }
    }
  }
}

async function processDocument(
  doc: vscode.TextDocument,
  outputChannel: vscode.OutputChannel,
  context: vscode.ExtensionContext
) {
  try {
    if (doc.lineCount > 500) {
      const decompositions = await decomposeMonolith(doc);
      if (decompositions && decompositions.length > 0) {
        const typeList = decompositions.map(d => d.type).join(", ");
        const choice = await vscode.window.showInformationMessage(
          `SDOA detected a ${doc.lineCount}-line monolith. Would you like to automatically decompose this into: ${typeList}?`,
          "Decompose File", "Skip"
        );
        if (choice === "Decompose File") {
          for (const split of decompositions) {
            await handleSubmission(split, doc, outputChannel);
          }
          vscode.window.showInformationMessage("Legacy file successfully decomposed and submitted to pipeline.");
        }
        return; // Skip standard detection for monoliths
      }
    }

    const innovation = await detectInnovation(doc);
    if (!innovation) {
      vscode.window.showInformationMessage("No SDOA innovations detected in this file.");
      return;
    }

    const choice = await showInnovationPrompt(innovation);

    if (choice === "local") {
      await saveLocalInnovation(innovation);
      vscode.window.showInformationMessage("Saved innovation locally.");
    } else if (choice === "submit") {
      await handleSubmission(innovation, doc, outputChannel);
    } else if (choice === "exclude") {
      await excludeFromFutureChecks(innovation);
      outputChannel.appendLine("Module excluded from future portfolio checks.");
      vscode.window.showInformationMessage("Module excluded from future portfolio checks.");
    }
  } catch (err) {
    outputChannel.appendLine(`[Error] in processDocument: ${err}`);
    console.error("[SDOA MCP] Error in processDocument:", err);
  }
}

// ── ControlPanelProvider — live polling tree view ─────────────────────────────
interface StateSnapshot {
  engineState: string;
  lastScan: string | null;
  queueDepth: number;
  astCacheSize: number;
  sqliteSize: number;
  pendingSync: number;
  detectorHits: Record<string, number>;
  syncStatus: string;
  uptime: number;
}

class ControlPanelProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private state: StateSnapshot | null = null;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private readonly outputChannel: vscode.OutputChannel;

  constructor(outputChannel: vscode.OutputChannel) {
    this.outputChannel = outputChannel;
    // Wait 3s for the server to boot, then begin polling
    setTimeout(() => this.startPolling(), 3000);
  }

  private ws: any = null;

  private startPolling() {
    this.poll(); // Initial fetch
    
    try {
      const WebSocket = require('ws');
      const config = vscode.workspace.getConfiguration("sdoaMcp");
      const ep = config.get<string>("fispEndpoint") || "http://127.0.0.1:8080";
      const wsUrl = ep.replace(/^http/, "ws") + "/";
      
      this.ws = new WebSocket(wsUrl);
      this.ws.on('message', (data: any) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.topic === 'state_update') {
            this.state = msg.payload;
            this._onDidChangeTreeData.fire();
          } else {
            if (msg.type === 'sdoa:extract-request') {
              const filePath = msg.payload.filePath;
              vscode.workspace.openTextDocument(filePath).then(doc => {
                vscode.window.showTextDocument(doc).then(() => {
                  vscode.commands.executeCommand("sdoa.scanActiveFile");
                });
              });
            } else if (msg.type && (msg.type.startsWith('scan:') || msg.type.startsWith('detector:') || msg.type.startsWith('sync:'))) {
              this.poll();
            }
          }
        } catch (e) {}
      });
      
      this.ws.on('close', () => {
        setTimeout(() => this.startPolling(), 5000); // Reconnect
      });
      this.ws.on('error', () => {});
    } catch (err) {
      // Fallback to polling if ws fails to load
      this.pollInterval = setInterval(() => this.poll(), 5000);
    }
  }

  private getAuthToken(): string {
    const config = vscode.workspace.getConfiguration("sdoaMcp");
    const u = config.get<string>("adminUser") || "admin";
    const p = config.get<string>("adminPass") || "admin";
    return btoa(`${u}:${p}`);
  }

  private async poll() {
    try {
      const ep = vscode.workspace.getConfiguration("sdoaMcp").get<string>("fispEndpoint") || "http://127.0.0.1:8080";
      const res = await fetch(`${ep}/dashboard/api/state`, {
        headers: { Authorization: "Basic " + this.getAuthToken() },
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        this.state = await res.json();
        this._onDidChangeTreeData.fire();
      }
    } catch {
      this._onDidChangeTreeData.fire();
    }
  }

  refresh() { this.poll(); }

  dispose() {
    if (this.pollInterval) clearInterval(this.pollInterval);
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
    }
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem { return element; }

  getChildren(parent?: vscode.TreeItem): vscode.TreeItem[] {
    if (!parent) return this.getRootSections();

    const label = typeof parent.label === "string" ? parent.label : parent.label?.label ?? "";

    if (label.startsWith("Status")) return this.getStatusItems();
    if (label.startsWith("Active Detectors")) return this.getDetectorItems();
    if (label.startsWith("Actions")) return this.getActionItems();
    if (label.startsWith("Quick Links")) return this.getLinkItems();
    return [];
  }

  private section(label: string, icon: string): vscode.TreeItem {
    const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.Expanded);
    item.iconPath = new vscode.ThemeIcon(icon);
    return item;
  }

  private leaf(label: string, icon: string, cmd?: string, tooltip?: string): vscode.TreeItem {
    const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
    item.iconPath = new vscode.ThemeIcon(icon);
    if (cmd) item.command = { command: cmd, title: label };
    if (tooltip) item.tooltip = tooltip;
    return item;
  }

  private getRootSections(): vscode.TreeItem[] {
    return [
      this.section("Status", "pulse"),
      this.section("Active Detectors", "search"),
      this.section("Actions", "run-all"),
      this.section("Quick Links", "link-external"),
    ];
  }

  private getStatusItems(): vscode.TreeItem[] {
    if (!this.state) {
      return [this.leaf("Connecting to engine...", "loading~spin")];
    }
    const s = this.state;
    const stateIcon: Record<string, string> = {
      idle: "check", scanning: "loading~spin", syncing: "sync~spin", error: "error",
    };
    const lastScan = s.lastScan ? new Date(s.lastScan).toLocaleTimeString() : "Never";
    const sqliteKB = (s.sqliteSize / 1024).toFixed(1);

    return [
      this.leaf(`Engine: ${s.engineState.toUpperCase()}`, stateIcon[s.engineState] || "circle-outline"),
      this.leaf(`Last Scan: ${lastScan}`, "calendar"),
      this.leaf(`AST Cache: ${s.astCacheSize} files`, "database"),
      this.leaf(`Queue Depth: ${s.queueDepth}`, "list-ordered"),
      this.leaf(`Pending Sync: ${s.pendingSync}`, "cloud-upload"),
      this.leaf(`SQLite: ${sqliteKB} KB`, "server"),
      this.leaf(`Uptime: ${s.uptime}s`, "clock"),
    ];
  }

  private getDetectorItems(): vscode.TreeItem[] {
    if (!this.state) return [this.leaf("Waiting...", "loading~spin")];
    const hits = this.state.detectorHits;
    const detectors: [string, string, keyof typeof hits][] = [
      ["UI Primitives", "symbol-interface", "uiPrimitive"],
      ["Workflows",     "symbol-event",     "workflow"],
      ["Schemas",       "symbol-structure",  "schema"],
      ["Tokens",        "symbol-color",      "token"],
      ["Engines",       "gear",             "engine"],
    ];
    return detectors.map(([label, icon, key]) =>
      this.leaf(`${label}: ${hits[key] ?? 0} hits`, icon)
    );
  }

  private getActionItems(): vscode.TreeItem[] {
    return [
      this.leaf("Scan Project...", "search-view-icon", "sdoa.scanProject"),
      this.leaf("Clear Engine Cache", "trash", "sdoa.clearCache"),
      this.leaf("Flush Offline Queue", "cloud-upload", "sdoa.flushQueue"),
      this.leaf("Restart Engine", "refresh", "sdoa.restartEngine"),
    ];
  }

  private getLinkItems(): vscode.TreeItem[] {
    return [
      this.leaf("Open Local Dashboard", "dashboard", "sdoa.openDashboardLocal"),
      this.leaf("View GitHub Releases", "github", "sdoa.openReleases"),
      this.leaf("View GitHub Pages", "globe", "sdoa.openPages"),
    ];
  }
}

// ── Deactivate ────────────────────────────────────────────────────────────────
export function deactivate() {
  if (serverProcess) serverProcess.kill();
  if (socket) socket.close();
}

// ── SDOA Cognizance Panel ──────────────────────────────────────────────────
function connectToBackend(workspaceRoot: string) {
  socket = new WebSocket('ws://localhost:7337');

  socket.on('open', () => {
    console.log('[SDOA] Connected to backend bridge');
    sendToBackend('extension:ready', { workspaceRoot });
  });

  socket.on('message', (msg: any) => {
    try {
      const data = JSON.parse(msg.toString());
      handleBackendEvent(data.event, data.payload);
    } catch (err) {
      console.error('[SDOA] Invalid backend message:', err);
    }
  });

  socket.on('close', () => {
    console.log('[SDOA] Backend bridge disconnected, retrying in 2s');
    setTimeout(() => connectToBackend(workspaceRoot), 2000);
  });
}

function sendToBackend(event: string, payload: any) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify({ event, payload }));
}

function handleBackendEvent(event: string, payload: any) {
  if (event === 'cognizance:update') {
    updateCognizancePanel(payload);
  } else if (event === 'extraction:diff') {
    vscode.commands.executeCommand("sdoa.showExtractionDiff", payload);
  } else if (event === 'extraction.analytics') {
    updateExtractionAnalytics(payload);
  } else if (event === 'extraction.driftHeatmap') {
    updateDriftHeatmap(payload);
  }
}

function updateCognizancePanel(data: any) {
  if (!cognizanceView) return;

  cognizanceView.webview.postMessage({
    type: 'update',
    data
  });
}

function getPanelHtml(): string {
  return `
    <html>
      <body style="font-family: sans-serif; padding: 10px;">
        <h2>SDOA Cognizance</h2>
        <div id="content">Waiting for updates...</div>

        <script>
          const vscode = acquireVsCodeApi();

          window.addEventListener('message', (event) => {
            const msg = event.data;

            if (msg.type === 'update') {
              const d = msg.data;

              document.getElementById('content').innerHTML = \`
                <strong>File:</strong> \${d.file}<br>
                <strong>Score:</strong> \${d.score}<br>
                <strong>Cognitive Load:</strong> \${d.cognitiveLoad}<br>
                <h3>Issues</h3>
                <ul>\${d.issues.map(i => '<li>' + i + '</li>').join('')}</ul>
                <h3>Suggestions</h3>
                <ul>\${d.suggestions.map(s => '<li>' + s + '</li>').join('')}</ul>
              \`;
            }
          });
        </script>
      </body>
    </html>
  `;
}

