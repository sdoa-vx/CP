// ------------------------------------------------------------------
// File:    extractionAnalyticsPanel.ts
// Version: 1.0.0
// Updated: 2026-06-23T17:40:00.000Z
// Changes: Initial creation of extraction analytics dashboard panel
// SDOA compliance is required
// ------------------------------------------------------------------

export const MANIFEST = {
  id: "dashboard.ui.extractionAnalyticsPanel",
  type: "engine",
  layer: "application",
  runtime: "browser",
  version: "1.0.0",
  action_surface: ["ui.render.extractionAnalytics"],
  commands: [],
  events: [],
  accepts: ["extraction.analytics"],
  slots: [],
  dependencies: [],
  sovereign_lineage: "dashboard.ui.extractionAnalyticsPanel",
  variant_of: null,
  docs: {
    description: "Dashboard panel that visualizes extraction analytics (counts, trends, module types).",
    last_modified: "2026-06-23T17:40:00.000Z"
  }
} as const;

import * as vscode from "vscode";

let analyticsPanel: vscode.WebviewView | null = null;

export function registerExtractionAnalyticsPanel(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "sdoaExtractionAnalytics",
      {
        resolveWebviewView(webviewView) {
          analyticsPanel = webviewView;
          webviewView.webview.options = { enableScripts: true };
          webviewView.webview.html = getHtml({ summary: null });
        }
      }
    )
  );
}

export interface ExtractionAnalyticsSummary {
  totalEvents: number;
  byModuleType: Record<string, number>;
  avgDrift: number;
  avgExtractionScore: number;
}

export function updateExtractionAnalytics(summary: ExtractionAnalyticsSummary) {
  if (!analyticsPanel) return;
  analyticsPanel.webview.html = getHtml({ summary });
}

function getHtml({ summary }: { summary: ExtractionAnalyticsSummary | null }): string {
  if (!summary) {
    return `
      <html>
        <body style="font-family:sans-serif;padding:10px;">
          <h3>SDOA Extraction Analytics</h3>
          <p>No data yet. Run a scan or wait for extractions.</p>
        </body>
      </html>
    `;
  }

  const moduleRows = Object.entries(summary.byModuleType)
    .map(([type, count]) => `<tr><td>${type}</td><td>${count}</td></tr>`)
    .join("");

  return `
    <html>
      <body style="font-family:sans-serif;padding:10px;">
        <h3>SDOA Extraction Analytics</h3>
        <p><strong>Total Extractions:</strong> ${summary.totalEvents}</p>
        <p><strong>Average Drift Score:</strong> ${summary.avgDrift.toFixed(1)}</p>
        <p><strong>Average Extraction Score:</strong> ${summary.avgExtractionScore.toFixed(1)}</p>

        <h4>By Module Type</h4>
        <table border="1" cellspacing="0" cellpadding="4">
          <tr><th>Module Type</th><th>Count</th></tr>
          ${moduleRows}
        </table>
      </body>
    </html>
  `;
}
