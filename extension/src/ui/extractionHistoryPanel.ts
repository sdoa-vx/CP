// ------------------------------------------------------------------
// File:    extractionHistoryPanel.ts
// Version: 1.1.0
// Updated: 2026-06-23T17:00:00.000Z
// Changes: Added drift and extraction badges to history rows
// SDOA compliance is required
// ------------------------------------------------------------------

export const MANIFEST = {
  id: "extension.ui.extractionHistoryPanel",
  type: "engine",
  layer: "application",
  runtime: "browser",
  version: "1.1.0",
  action_surface: ["ui.render.history"],
  commands: [],
  events: [],
  accepts: ["extraction.history"],
  slots: [],
  dependencies: [],
  sovereign_lineage: "extension.ui.extractionHistoryPanel",
  variant_of: null,
  docs: {
    description: "Displays a timeline of SDOA extractions with drift and extraction badges.",
    last_modified: "2026-06-23T17:00:00.000Z"
  }
} as const;

import * as vscode from "vscode";

let historyPanel: vscode.WebviewView | null = null;
let historyItems: any[] = [];

export function registerExtractionHistoryPanel(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "sdoaExtractionHistory",
      {
        resolveWebviewView(webviewView) {
          historyPanel = webviewView;
          webviewView.webview.options = { enableScripts: true };
          webviewView.webview.html = getHtml();

          webviewView.webview.onDidReceiveMessage((msg) => {
            if (msg.type === "openDiff") {
              vscode.commands.executeCommand("sdoa.showExtractionDiff", msg.payload);
            }
          });
        }
      }
    )
  );
}

export function addExtractionHistoryItem(item: any) {
  historyItems.unshift({
    ...item,
    timestamp: new Date().toISOString()
  });
  if (historyItems.length > 50) historyItems.pop();
  refreshHistory();
}

function refreshHistory() {
  if (!historyPanel) return;
  historyPanel.webview.html = getHtml();
}

function getHtml(): string {
  const rows = historyItems
    .map((i) => {
      const driftBadge = classifyDriftBadge(i.driftScore);
      const extractionBadge = classifyExtractionBadge(i.extractionScore);

      return `
        <tr>
          <td>${i.timestamp}</td>
          <td>${i.file}</td>
          <td>${i.modulePath}</td>
          <td>
            <span style="padding:2px 6px;border-radius:4px;font-size:11px;${driftBadge.style}">
              ${driftBadge.label}
            </span>
          </td>
          <td>
            <span style="padding:2px 6px;border-radius:4px;font-size:11px;${extractionBadge.style}">
              ${extractionBadge.label}
            </span>
          </td>
          <td><button onclick="openDiff('${i.id}')">View</button></td>
        </tr>
      `;
    })
    .join("");

  return `
    <html>
      <body style="font-family:sans-serif;padding:10px;">
        <h3>SDOA Extraction History</h3>
        <table border="1" cellspacing="0" cellpadding="4">
          <tr>
            <th>Time</th>
            <th>File</th>
            <th>Module</th>
            <th>Drift</th>
            <th>Extraction</th>
            <th>Action</th>
          </tr>
          ${rows}
        </table>

        <script>
          const vscode = acquireVsCodeApi();
          const items = ${JSON.stringify(historyItems)};

          function openDiff(id) {
            const item = items.find(i => i.id === id);
            if (!item) return;
            vscode.postMessage({ type: "openDiff", payload: item.payload });
          }
        </script>
      </body>
    </html>
  `;
}

function classifyDriftBadge(score: number) {
  if (score >= 80) {
    return { label: "High Drift", style: "background:#F44747;color:white;" };
  }
  if (score >= 40) {
    return { label: "Medium Drift", style: "background:#CE9178;color:white;" };
  }
  return { label: "Low Drift", style: "background:#6A9955;color:white;" };
}

function classifyExtractionBadge(score: number) {
  if (score >= 2) {
    return { label: "Complex Extraction", style: "background:#569CD6;color:white;" };
  }
  return { label: "Simple Extraction", style: "background:#4EC9B0;color:black;" };
}
