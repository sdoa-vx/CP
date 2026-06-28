// ------------------------------------------------------------------
// File:    fixItEngine.ts
// Version: 1.0.0
// Updated: 2026-06-23T16:00:00.000Z
// Changes: Initial creation of SDOA Fix-It Engine
// SDOA compliance is required
// ------------------------------------------------------------------

export const MANIFEST = {
  id: "engine.cognizance.fixItEngine",
  type: "engine",
  layer: "substrate",
  runtime: "node",
  version: "1.0.0",
  action_surface: ["fix.manifest", "fix.version", "fix.dependencies", "fix.header"],
  commands: ["applyFixes", "suggestFixes"],
  events: ["fixes.applied", "fixes.suggested"],
  accepts: ["cognizance.report"],
  slots: [],
  dependencies: [
    "engine.cognizance.manifestValidator",
    "engine.cognizance.driftDetector",
    "engine.cognizance.cognitiveLoadMeter",
    "engine.registry.dependencyValidator"
  ],
  sovereign_lineage: "engine.cognizance.fixItEngine",
  variant_of: null,
  docs: {
    description: "Applies or suggests automated SDOA compliance fixes based on cognizance reports.",
    last_modified: "2026-06-23T16:00:00.000Z"
  }
} as const;

import fs from "fs";
import type { SdoaManifest } from "../sdoaFileApi";
import { validateManifest } from "./manifestValidator";
import { detectDrift } from "./driftDetector";
import { validateDependenciesWithRegistry } from "../registry/dependencyValidator";

export interface CognizanceReport {
  file: string;
  score: number;
  issues: string[];
  suggestions: string[];
  cognitiveLoad: number;
  source?: string;
}

export interface FixItResult {
  file: string;
  applied: string[];
  remainingIssues: string[];
}

export function suggestFixes(report: CognizanceReport): string[] {
  const suggestions = [...report.suggestions];

  if (report.issues.some(i => i.includes("MANIFEST export missing"))) {
    suggestions.push("Insert a default MANIFEST block using SDOA v5.1 schema.");
  }

  if (report.issues.some(i => i.includes("header version"))) {
    suggestions.push("Align header Version with MANIFEST.version.");
  }

  if (report.issues.some(i => i.includes("dependencies"))) {
    suggestions.push("Normalize MANIFEST.dependencies and validate against registry.");
  }

  return suggestions;
}

export function applyFixes(report: CognizanceReport): FixItResult {
  const filePath = report.file;
  if (!fs.existsSync(filePath)) {
    return {
      file: filePath,
      applied: [],
      remainingIssues: [`File not found: ${filePath}`]
    };
  }

  let source = report.source ?? fs.readFileSync(filePath, "utf8");
  const applied: string[] = [];
  const remaining: string[] = [];

  // 1. Ensure MANIFEST exists and is structurally valid
  const issues: string[] = [];
  const suggestions: string[] = [];
  let manifest = validateManifest(source, issues, suggestions);

  // 2. Drift detection (for updated manifest/header sync)
  detectDrift(filePath, source, manifest, issues, suggestions);

  // 3. Registry-backed dependency validation
  const depIssues = validateDependenciesWithRegistry(manifest);
  if (depIssues.length > 0) {
    remaining.push(...depIssues);
  }

  // 4. Header/Version sync auto-fix (simple case)
  const headerVersionMatch = source.match(/(\/\/\s*Version:\s*)([0-9]+\.[0-9]+\.[0-9]+)/);
  if (headerVersionMatch && manifest.version !== "0.0.0") {
    const currentHeader = headerVersionMatch[0];
    const updatedHeader = `${headerVersionMatch[1]}${manifest.version}`;
    if (currentHeader !== updatedHeader) {
      source = source.replace(currentHeader, updatedHeader);
      applied.push("Aligned header Version with MANIFEST.version.");
    }
  }

  // 5. Write back if anything changed
  if (applied.length > 0) {
    fs.writeFileSync(filePath, source, "utf8");
  }

  // Any issues not auto-fixable remain
  remaining.push(...issues);

  return {
    file: filePath,
    applied,
    remainingIssues: remaining
  };
}
