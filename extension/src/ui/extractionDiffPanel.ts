// ------------------------------------------------------------------
// File:    extractionDiffPanel.ts
// Version: 1.1.0
// Updated: 2026-06-23T16:30:00.000Z
// Changes: Added Apply Injector, Open Module, Revert, and diff mode toggle
// SDOA compliance is required
// ------------------------------------------------------------------

export const MANIFEST = {
  id: "extension.ui.extractionDiffPanel",
  type: "engine",
  layer: "application",
  runtime: "browser",
  version: "1.1.0",
  action_surface: ["ui.render.diff"],
  commands: [],
  events: [],
  accepts: ["extraction.diff"],
  slots: [],
  dependencies: [],
  sovereign_lineage: "extension.ui.extractionDiffPanel",
  variant_of: null,
  docs: {
    description: "VS Code panel that displays unified/side-by-side diffs and module previews for extracted SDOA modules.",
    last_modified: "2026-06-23T16:30:00.000Z"
  }
} as const;

import * as vscode from "vscode";

let panel: vscode.WebviewPanel | null = null;

export function showExtractionDiffPanel(context: vscode.ExtensionContext, payload: any) {
  if (!panel) {
    panel = vscode.window.createWebviewPanel(
      "sdoaExtractionDiff",
      "SDOA Extraction Diff",
      vscode.ViewColumn.Beside,
      { enableScripts: true }
    );

    panel.onDidDispose(() => (panel = null));

    panel.webview.onDidReceiveMessage((msg) => {
      switch (msg.type) {
        case "applyInjector":
          vscode.commands.executeCommand("sdoa.applyInjector", msg.payload);
          break;
        case "openModule":
          vscode.commands.executeCommand("sdoa.openExtractedModule", msg.payload);
          break;
        case "revertExtraction":
          vscode.commands.executeCommand("sdoa.revertExtraction", msg.payload);
          break;
        case "toggleDiffMode":
          vscode.commands.executeCommand("sdoa.toggleDiffMode", msg.payload);
          break;
      }
    });
  }

  panel.webview.html = getHtml(payload);
}

function getHtml(payload: any): string {
  const { unifiedDiff, moduleSource, manifest, header, modulePath, file } = payload;

  return `
    <html>
      <body style="font-family: sans-serif; padding: 20px;">
        <h2>SDOA Extraction Diff</h2>
        <p><strong>Source file:</strong> ${file}</p>
        <p><strong>New module:</strong> ${modulePath}</p>

        <div style="margin-bottom:10px;">
          <button onclick="applyInjector()">Apply Injector</button>
          <button onclick="openModule()">Open Extracted Module</button>
          <button onclick="revertExtraction()">Revert Extraction</button>
          <button onclick="toggleDiffMode()">Toggle Diff Mode</button>
        </div>

        <h3>Unified Diff</h3>
        <pre id="diff" style="background:#1e1e1e;color:#d4d4d4;padding:10px;border-radius:6px;white-space:pre-wrap;">
${highlightDiff(unifiedDiff)}
        </pre>

        <h3>New Module Created</h3>
        <strong>${modulePath}</strong>

        <h4>Header</h4>
        <pre>${header}</pre>

        <h4>MANIFEST</h4>
        <pre>${JSON.stringify(manifest, null, 2)}</pre>

        <h4>Module Source</h4>
        <pre style="background:#1e1e1e;color:#d4d4d4;padding:10px;border-radius:6px;white-space:pre-wrap;">
${moduleSource}
        </pre>

        <script>
          const vscode = acquireVsCodeApi();
          let diffMode = "unified";

          function applyInjector() {
            vscode.postMessage({ type: "applyInjector", payload: ${JSON.stringify(payload)} });
          }

          function openModule() {
            vscode.postMessage({ type: "openModule", payload: { modulePath: "${modulePath}" } });
          }

          function revertExtraction() {
            vscode.postMessage({ type: "revertExtraction", payload: ${JSON.stringify(payload)} });
          }

          function toggleDiffMode() {
            diffMode = diffMode === "unified" ? "side-by-side" : "unified";
            vscode.postMessage({ type: "toggleDiffMode", payload: { mode: diffMode, file: "${file}" } });
          }
        </script>
      </body>
    </html>
  `;
}

function highlightDiff(diff: string): string {
  return diff
    .split("\n")
    .map(line => {
      if (line.startsWith("+")) return `<span style="color:#6A9955">${line}</span>`;
      if (line.startsWith("-")) return `<span style="color:#F44747">${line}</span>`;
      return line;
    })
    .join("\n");
}
