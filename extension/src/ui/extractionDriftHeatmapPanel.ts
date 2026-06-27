// ------------------------------------------------------------------
// File:    extractionDriftHeatmapPanel.ts
// Version: 1.0.0
// Updated: 2026-06-23T17:40:00.000Z
// Changes: Initial creation of extraction drift heatmap panel
// SDOA compliance is required
// ------------------------------------------------------------------

export const MANIFEST = {
  id: "dashboard.ui.extractionDriftHeatmapPanel",
  type: "engine",
  layer: "application",
  runtime: "browser",
  version: "1.0.0",
  action_surface: ["ui.render.driftHeatmap"],
  commands: [],
  events: [],
  accepts: ["extraction.driftHeatmap"],
  slots: [],
  dependencies: [],
  sovereign_lineage: "dashboard.ui.extractionDriftHeatmapPanel",
  variant_of: null,
  docs: {
    description: "Dashboard panel that visualizes drift intensity over time as a heatmap.",
    last_modified: "2026-06-23T17:40:00.000Z"
  }
} as const;

import * as vscode from "vscode";

let heatmapPanel: vscode.WebviewView | null = null;

export interface DriftHeatmapCell {
  bucketLabel: string;   // e.g. "2026-06-23 14:00"
  driftBand: string;     // "low" | "medium" | "high"
  count: number;
}

export interface DriftHeatmapModel {
  buckets: string[];         // time buckets
  bands: string[];           // ["low","medium","high"]
  cells: DriftHeatmapCell[]; // counts per bucket/band
}

export function registerExtractionDriftHeatmapPanel(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "sdoaExtractionDriftHeatmap",
      {
        resolveWebviewView(webviewView) {
          heatmapPanel = webviewView;
          webviewView.webview.options = { enableScripts: true };
          webviewView.webview.html = getHtml(null);
        }
      }
    )
  );
}

export function updateDriftHeatmap(model: DriftHeatmapModel) {
  if (!heatmapPanel) return;
  heatmapPanel.webview.html = getHtml(model);
}

function getHtml(model: DriftHeatmapModel | null): string {
  if (!model) {
    return `
      <html>
        <body style="font-family:sans-serif;padding:10px;">
          <h3>SDOA Drift Heatmap</h3>
          <p>No data yet.</p>
        </body>
      </html>
    `;
  }

  const { buckets, bands, cells } = model;

  const rows = bands
    .map((band) => {
      const cellsHtml = buckets
        .map((bucket) => {
          const cell = cells.find(c => c.bucketLabel === bucket && c.driftBand === band);
          const count = cell?.count ?? 0;
          const color = colorForBandAndCount(band, count);
          return `<td style="background:${color};text-align:center;">${count}</td>`;
        })
        .join("");

      return `<tr><th>${band}</th>${cellsHtml}</tr>`;
    })
    .join("");

  const header = `<tr><th></th>${buckets.map(b => `<th>${b}</th>`).join("")}</tr>`;

  return `
    <html>
      <body style="font-family:sans-serif;padding:10px;">
        <h3>SDOA Drift Heatmap</h3>
        <table border="1" cellspacing="0" cellpadding="4">
          ${header}
          ${rows}
        </table>
      </body>
    </html>
  `;
}

function colorForBandAndCount(band: string, count: number): string {
  if (count === 0) return "#1e1e1e";
  if (band === "high") return count > 5 ? "#F44747" : "#CE9178";
  if (band === "medium") return count > 5 ? "#CE9178" : "#D7BA7D";
  return count > 5 ? "#6A9955" : "#4EC9B0";
}
