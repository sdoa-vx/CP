import * as vscode from "vscode";
import * as cp from "child_process";
import * as path from "path";
import { detectInnovation } from "./detectors/innovationDetector";
import { showInnovationPrompt } from "./ui/prompt";
import { submitProposal } from "./api/submitProposal";
import { saveLocalInnovation } from "./storage/localStore";
import { excludeFromFutureChecks } from "./storage/exclusions";

let serverProcess: cp.ChildProcess | undefined;

export function activate(context: vscode.ExtensionContext) {
  const outputChannel = vscode.window.createOutputChannel("SDOA MCP");
  outputChannel.appendLine("VSX extension activated. Booting backend server...");

  // 1. One-Click Install: Spawn Backend Server
  try {
    const serverPath = context.asAbsolutePath(path.join("dist", "server", "index.js"));
    serverProcess = cp.fork(serverPath, [], {
      env: { ...process.env, SDOA_DB: path.join(context.extensionPath, '.sdoa', 'pipeline.db') },
      silent: true
    });
    
    serverProcess.stdout?.on('data', (data) => outputChannel.appendLine(`[Server]: ${data}`));
    serverProcess.stderr?.on('data', (data) => outputChannel.appendLine(`[Server Error]: ${data}`));
    
    outputChannel.appendLine(`Backend server spawned on PID ${serverProcess.pid}`);
  } catch (err) {
    outputChannel.appendLine(`Failed to spawn backend server: ${err}`);
  }

  // 2. Status Bar UI
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.text = "$(plug) SDOA MCP";
  statusBar.show();
  context.subscriptions.push(statusBar);

  const scanWidget = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 101);
  scanWidget.text = "$(search-view-icon) Scan SDOA";
  scanWidget.command = "sdoa.scanActiveFile";
  scanWidget.tooltip = "Scan current file for architectural innovations";
  scanWidget.show();
  context.subscriptions.push(scanWidget);

  // 3. Commands
  context.subscriptions.push(
    vscode.commands.registerCommand("sdoa.viewLastSubmission", () => {
      vscode.window.showInformationMessage("Viewing last submission...");
    }),
    vscode.commands.registerCommand("sdoa.openDashboard", () => {
      vscode.env.openExternal(vscode.Uri.parse("http://localhost:8080/dashboard"));
    }),
    vscode.commands.registerCommand("sdoa.scanActiveFile", async () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        outputChannel.appendLine("Manual scan triggered...");
        await processDocument(editor.document, outputChannel);
      } else {
        vscode.window.showInformationMessage("No active file to scan.");
      }
    })
  );

  // 4. Passive Monitoring
  const disposable = vscode.workspace.onDidSaveTextDocument(async (doc) => {
    await processDocument(doc, outputChannel);
  });

  context.subscriptions.push(disposable);
}

async function processDocument(doc: vscode.TextDocument, outputChannel: vscode.OutputChannel) {
  try {
    const innovation = await detectInnovation(doc);
    if (!innovation) return;

    const choice = await showInnovationPrompt(innovation);

    if (choice === "local") {
      await saveLocalInnovation(innovation);
      vscode.window.showInformationMessage("Saved innovation locally.");
    }

    if (choice === "submit") {
      const result = await submitProposal(innovation as any);
      
      if (result.status === "merged" && result.suggestion) {
        const replaceChoice = await vscode.window.showInformationMessage(
          "An existing SDOA module already performs this function. Do you want to replace your code with the standard module?",
          "Yes, Replace", "No, Keep Mine"
        );
        
        if (replaceChoice === "Yes, Replace") {
          const edit = new vscode.WorkspaceEdit();
          const fullRange = new vscode.Range(
            doc.positionAt(0),
            doc.positionAt(doc.getText().length)
          );
          edit.replace(doc.uri, fullRange, result.suggestion);
          await vscode.workspace.applyEdit(edit);
          
          const endpoint = vscode.workspace.getConfiguration("sdoaMcp").get<string>("fispEndpoint") || "http://localhost:8080";
          await fetch(`${endpoint}/telemetry/reuse`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ component_id: result.id, proposalId: result.id })
          }).catch(() => {});
          
          vscode.window.showInformationMessage("Replaced with standard SDOA component.");
        } else {
          vscode.window.showInformationMessage("Kept custom implementation.");
        }
      } else {
        vscode.window.showInformationMessage(
          `Submitted to FISP (proposal id: ${result.id || "pending"})`
        );
      }
    }

    if (choice === "exclude") {
      await excludeFromFutureChecks(innovation);
      outputChannel.appendLine("Module excluded from future portfolio checks.");
      vscode.window.showInformationMessage("Module excluded from future portfolio checks.");
    }
  } catch (err) {
    outputChannel.appendLine(`[Error] in processDocument: ${err}`);
    console.error("[SDOA MCP] Error in processDocument:", err);
  }
}

export function deactivate() {
  console.log("[SDOA MCP] VSX extension deactivated");
  if (serverProcess) {
    serverProcess.kill();
  }
}
