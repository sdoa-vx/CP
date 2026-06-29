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
import { runWorkspaceScan } from "./scanner";
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
      const config = vscode.workspace.getConfiguration("sdoaMcp");
      if (config.get("autoloadDashboard")) {
        vscode.commands.executeCommand("sdoa.openDashboardLocal");
      }

      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "SDOA Engine",
        cancellable: false
      }, async (progress) => {
        progress.report({ message: "Running full workspace scan..." });
        
        try {
          await runWorkspaceScan(outputChannel);
          vscode.window.showInformationMessage(`✅ Workspace scan completed.`);
          controlPanelProvider.refresh();
        } catch (err) {
          vscode.window.showErrorMessage("Workspace scan failed.");
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

