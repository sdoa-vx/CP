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

let serverProcess: cp.ChildProcess | undefined;

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

  const extMap: Record<string, string> = {
    primitive: "tsx", workflow: "ts", schema: "ts", token: "css", engine: "ts",
  };
  const ext = extMap[type] || "ts";
  const dir = path.join(workspaceRoot, EXTRACTION_DIRS[type] || "ui/primitives");
  const fileName = `${name}.sdoa.${ext}`;
  const targetPath = path.join(dir, fileName);

  // Build the proposed file content
  const header = [
    "// ─────────────────────────────────────────────────────────────────────────",
    `// SDOA Extracted ${type.charAt(0).toUpperCase() + type.slice(1)}: ${name}`,
    `// Detected by: SDOA Engine v1.1`,
    `// Locations: ${(innovation.fullLedger?.newPrimitives || []).flatMap((p: any) => p.locations || []).join(", ") || innovation.source?.path || ""}`,
    "// ─────────────────────────────────────────────────────────────────────────",
    "",
    content,
  ].join("\n");

  // Create a virtual document for the left side (empty/original)
  const scheme = "sdoa-extract";
  const emptyDoc = vscode.Uri.parse(`${scheme}:${fileName}?original`);
  const proposedDoc = vscode.Uri.parse(`${scheme}:${fileName}?proposed`);

  // ContentProvider for diff view
  const provider = vscode.workspace.registerTextDocumentContentProvider(scheme, {
    provideTextDocumentContent(uri) {
      return uri.query === "proposed" ? header : "";
    },
  });

  try {
    await vscode.commands.executeCommand(
      "vscode.diff",
      emptyDoc,
      proposedDoc,
      `⭐ SDOA Extract: ${name}.sdoa.${ext}`,
      { preview: true }
    );

    const choice = await vscode.window.showInformationMessage(
      `SDOA detected a reusable ${type}: "${name}". Extract to ${EXTRACTION_DIRS[type]}/${fileName}?`,
      "Extract", "Skip"
    );

    if (choice === "Extract") {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(targetPath, header, "utf-8");
      const docUri = vscode.Uri.file(targetPath);
      await vscode.window.showTextDocument(docUri);
      outputChannel.appendLine(`[Fix-It] Extracted ${type} → ${targetPath}`);
      vscode.window.showInformationMessage(`✅ Extracted to ${path.relative(workspaceRoot, targetPath)}`);
    }
  } finally {
    provider.dispose();
  }
}

// ── Activate ─────────────────────────────────────────────────────────────────
export function activate(context: vscode.ExtensionContext) {
  const outputChannel = vscode.window.createOutputChannel("SDOA MCP");
  outputChannel.appendLine("VSX extension activated. Booting backend server...");

  // 1. Spawn backend server
  try {
    const serverPath = context.asAbsolutePath(path.join("dist", "server", "index.js"));
    serverProcess = cp.fork(serverPath, [], {
      env: { ...process.env, SDOA_DB: path.join(context.extensionPath, ".sdoa", "pipeline.db") },
      silent: true,
    });
    serverProcess.stdout?.on("data", (d) => outputChannel.appendLine(`[Server]: ${d}`));
    serverProcess.stderr?.on("data", (d) => outputChannel.appendLine(`[Server Error]: ${d}`));
    outputChannel.appendLine(`Backend server spawned on PID ${serverProcess.pid}`);
  } catch (err) {
    outputChannel.appendLine(`Failed to spawn backend server: ${err}`);
  }

  // 2. Status bar
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

  // 3. Control Panel tree view
  const controlPanelProvider = new ControlPanelProvider(outputChannel);
  const treeView = vscode.window.createTreeView("sdoa-control-panel", {
    treeDataProvider: controlPanelProvider,
    showCollapseAll: false,
  });
  context.subscriptions.push(treeView);

  // 4. Commands
  const endpoint = () =>
    vscode.workspace.getConfiguration("sdoaMcp").get<string>("fispEndpoint") || "http://localhost:8080";

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
        const payload = {
          proposalId: "prop_" + Date.now(),
          type: "primitive",
          name: name,
          innovations: [{ name, type: "primitive", source: { content: "export const " + name + " = () => {};", language: "tsx" } }]
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
        { label: "$(file-code) Scan Specific File...", description: "Select a specific file to scan", target: "sdoa.scanFile" }
      ], { placeHolder: "Select what to scan for architectural innovations" });
      
      if (choice) {
        vscode.commands.executeCommand(choice.target);
      }
    }),
    vscode.commands.registerCommand("sdoa.scanActiveFile", async () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        outputChannel.appendLine("Manual scan triggered...");
        await processDocument(editor.document, outputChannel, context);
      } else {
        vscode.window.showInformationMessage("No active file to scan.");
      }
    }),
    vscode.commands.registerCommand("sdoa.scanFile", async () => {
      const uris = await vscode.window.showOpenDialog({ canSelectFiles: true, canSelectFolders: false, canSelectMany: false });
      if (uris?.[0]) {
        const doc = await vscode.workspace.openTextDocument(uris[0]);
        await processDocument(doc, outputChannel, context);
      }
    }),
    vscode.commands.registerCommand("sdoa.scanFolder", async () => {
      const uris = await vscode.window.showOpenDialog({ canSelectFiles: false, canSelectFolders: true, canSelectMany: false });
      if (uris?.[0]) {
        const root = uris[0].fsPath;
        vscode.window.showInformationMessage("Workspace scan initiated...");
        fetch(`${endpoint()}/dashboard/api/actions/scan-workspace`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Basic " + btoa("admin:admin") },
          body: JSON.stringify({ workspaceRoot: root }),
        }).then(() => controlPanelProvider.refresh()).catch(() => {});
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
      vscode.window.showInformationMessage("Running full workspace scan...");

      // Update local AST cache and report size to server

      fetch(`${endpoint()}/dashboard/api/actions/scan-workspace`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Basic " + btoa("admin:admin") },
        body: JSON.stringify({ workspaceRoot: root }),
      }).then(async (r) => {
        const data = await r.json();
        outputChannel.appendLine(`[Scan] ${data.filesScanned} files scanned on server.`);
        controlPanelProvider.refresh();
      }).catch(() => {});
    }),
    vscode.commands.registerCommand("sdoa.clearCache", () => {
      fetch(`${endpoint()}/dashboard/api/actions/clear-cache`, {
        method: "POST",
        headers: { Authorization: "Basic " + btoa("admin:admin") },
      }).then(() => {
        vscode.window.showInformationMessage("Engine cache cleared.");
        controlPanelProvider.refresh();
      }).catch(() => {});
    }),
    vscode.commands.registerCommand("sdoa.flushQueue", async () => {
      const res = await fetch(`${endpoint()}/dashboard/api/actions/flush-queue`, {
        method: "POST",
        headers: { Authorization: "Basic " + btoa("admin:admin") },
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
        headers: { Authorization: "Basic " + btoa("admin:admin") },
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

      const ep = vscode.workspace.getConfiguration("sdoaMcp").get<string>("fispEndpoint") || "http://localhost:8080";
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
    const innovation = await detectInnovation(doc);
    if (!innovation) return;

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

  private startPolling() {
    this.poll();
    this.pollInterval = setInterval(() => this.poll(), 5000);
  }

  private async poll() {
    try {
      const ep = vscode.workspace.getConfiguration("sdoaMcp").get<string>("fispEndpoint") || "http://localhost:8080";
      const res = await fetch(`${ep}/dashboard/api/state`, {
        headers: { Authorization: "Basic " + btoa("admin:admin") },
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        this.state = await res.json();
        this._onDidChangeTreeData.fire();
      }
    } catch {
      // Server not up yet — keep quiet, tree shows "Connecting..."
      this._onDidChangeTreeData.fire();
    }
  }

  refresh() { this.poll(); }

  dispose() {
    if (this.pollInterval) clearInterval(this.pollInterval);
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
}
