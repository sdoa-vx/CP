// ------------------------------------------------------------------
// File:    driftMapVisualizer.ts
// Version: 1.0.0
// Updated: 2026-06-23T16:00:00.000Z
// Changes: Initial creation of SDOA Drift Map visualizer core
// SDOA compliance is required
// ------------------------------------------------------------------

export const MANIFEST = {
  id: "engine.cognizance.driftMapVisualizer",
  type: "engine",
  layer: "substrate",
  runtime: "node",
  version: "1.0.0",
  action_surface: ["visualize.drift"],
  commands: ["buildDriftMap"],
  events: [],
  accepts: ["cognizance.report.collection"],
  slots: [],
  dependencies: [
    "engine.cognizance.driftDetector",
    "engine.cognizance.manifestValidator"
  ],
  sovereign_lineage: "engine.cognizance.driftMapVisualizer",
  variant_of: null,
  docs: {
    description: "Builds a structured drift map from cognizance reports for visualization in UI panels.",
    last_modified: "2026-06-23T16:00:00.000Z"
  }
} as const;

import type { CognizanceReport } from "./fixItEngine";

export interface DriftNode {
  file: string;
  score: number;
  issues: string[];
  driftSeverity: "none" | "low" | "medium" | "high";
  layer: string;
  runtime: string;
}

export interface DriftMap {
  summary: {
    totalFiles: number;
    highDrift: number;
    mediumDrift: number;
    lowDrift: number;
    noDrift: number;
  };
  nodes: DriftNode[];
}

export function buildDriftMap(reports: CognizanceReport[]): DriftMap {
  const nodes: DriftNode[] = [];

  for (const r of reports) {
    const layer = inferLayerFromPath(r.file);
    const runtime = inferRuntimeFromPath(r.file);
    const severity = classifyDriftSeverity(r.issues);

    nodes.push({
      file: r.file,
      score: r.score,
      issues: r.issues,
      driftSeverity: severity,
      layer,
      runtime
    });
  }

  const summary = {
    totalFiles: nodes.length,
    highDrift: nodes.filter(n => n.driftSeverity === "high").length,
    mediumDrift: nodes.filter(n => n.driftSeverity === "medium").length,
    lowDrift: nodes.filter(n => n.driftSeverity === "low").length,
    noDrift: nodes.filter(n => n.driftSeverity === "none").length
  };

  return { summary, nodes };
}

function classifyDriftSeverity(issues: string[]): DriftNode["driftSeverity"] {
  if (issues.length === 0) return "none";

  const high = issues.some(i =>
    i.includes("MANIFEST.id") ||
    i.includes("sovereign_lineage") ||
    i.includes("layer") && i.includes("substrate") ||
    i.includes("header version")
  );

  if (high) return "high";
  if (issues.length >= 3) return "medium";
  return "low";
}

function inferLayerFromPath(filePath: string): string {
  if (filePath.includes("/substrate/")) return "substrate";
  if (filePath.includes("/ui/")) return "application";
  if (filePath.includes("/server/")) return "application";
  return "unknown";
}

function inferRuntimeFromPath(filePath: string): string {
  if (filePath.endsWith(".tsx")) return "browser";
  if (filePath.includes("/server/") || filePath.includes("/substrate/")) return "node";
  return "unknown";
}
