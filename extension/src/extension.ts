import * as vscode from "vscode";
import { detectInnovation } from "./detectors/innovationDetector";
import { showInnovationPrompt } from "./ui/prompt";
import { submitProposal } from "./api/submitProposal";
import { saveLocalInnovation } from "./storage/localStore";
import { excludeFromFutureChecks } from "./storage/exclusions";

export function activate(context: vscode.ExtensionContext) {
  const outputChannel = vscode.window.createOutputChannel("SDOA MCP");
  outputChannel.appendLine("VSX extension activated");

  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.text = "$(plug) SDOA MCP";
  statusBar.show();
  context.subscriptions.push(statusBar);

  context.subscriptions.push(
    vscode.commands.registerCommand("sdoa.viewLastSubmission", () => {
      vscode.window.showInformationMessage("Viewing last submission...");
    }),
    vscode.commands.registerCommand("sdoa.openDashboard", () => {
      vscode.env.openExternal(vscode.Uri.parse("http://localhost:8080/dashboard"));
    })
  );

  const disposable = vscode.workspace.onDidSaveTextDocument(async (doc) => {
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
        vscode.window.showInformationMessage(
          `Submitted to FISP (proposal id: ${result.id || "pending"})`
        );
      }

      if (choice === "exclude") {
        await excludeFromFutureChecks(innovation);
        outputChannel.appendLine("Module excluded from future portfolio checks.");
        vscode.window.showInformationMessage("Module excluded from future portfolio checks.");
      }
    } catch (err) {
      outputChannel.appendLine(`[Error] in onDidSaveTextDocument: ${err}`);
      console.error("[SDOA MCP] Error in onDidSaveTextDocument:", err);
    }
  });

  context.subscriptions.push(disposable);
}

export function deactivate() {
  console.log("[SDOA MCP] VSX extension deactivated");
}
