import * as vscode from "vscode";
import { detectInnovation } from "./detectors/innovationDetector";
import { submitProposal } from "./api/submitProposal";

export async function runWorkspaceScan(outputChannel: vscode.OutputChannel) {
  const config = vscode.workspace.getConfiguration("sdoaMcp");
  const pacingMode = config.get<string>("scanPacing") || "normal";
  
  let delay = 0;
  if (pacingMode === "slow") delay = 500;
  else if (pacingMode === "cinematic") delay = 1000;
  else if (pacingMode === "fast") delay = 10;
  else delay = 100; // normal

  const files = await vscode.workspace.findFiles(
    "**/*.{ts,tsx,js,jsx,py,go,rs,java,cpp,c,cs,rb,php}", 
    "**/{node_modules,.git,dist,out,build,coverage,venv,.venv,__pycache__}/**"
  );

  const totalFiles = files.length;
  outputChannel.appendLine(`[Scanner] Found ${totalFiles} scannable files.`);

  // In a real SDOA module, we would emit via websockets or the SDOA event bus.
  // We'll emit via the output channel for now, and rely on the extension to relay.
  outputChannel.appendLine(`scan:start|${JSON.stringify({ totalFiles })}`);

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    outputChannel.appendLine(`scan:fileProgress|${JSON.stringify({ file: file.fsPath, index: i + 1, total: totalFiles })}`);
    
    try {
      const doc = await vscode.workspace.openTextDocument(file);
      const innovation = await detectInnovation(doc);
      if (innovation) {
        outputChannel.appendLine(`[Scanner] Found innovation in ${file.fsPath}`);
        // Submit proposal in the background
        submitProposal(innovation).catch(() => {});
      }
    } catch (e) {
      outputChannel.appendLine(`[Scanner] Failed to scan ${file.fsPath}`);
    }

    // Apply pacing
    if (delay > 0) {
      await new Promise(r => setTimeout(r, delay));
    }
  }

  outputChannel.appendLine(`scan:end|{}`);
}
