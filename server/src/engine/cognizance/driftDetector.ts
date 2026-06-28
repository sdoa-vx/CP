// ------------------------------------------------------------------
// File:    driftDetector.ts
// Version: 1.0.0
// Updated: 2026-06-23T15:41:00.000Z
// Changes: Initial creation of SDOA-compliant drift detector
// SDOA compliance is required
// ------------------------------------------------------------------

export const MANIFEST = {
  id: "engine.cognizance.driftDetector",
  type: "engine",
  layer: "substrate",
  runtime: "node",
  version: "1.0.0",
  action_surface: [],
  commands: [],
  events: [],
  accepts: [],
  slots: [],
  dependencies: [],
  sovereign_lineage: "engine.cognizance.driftDetector",
  variant_of: null,
  docs: {
    description: "Detects architectural drift between MANIFEST, file path, and source.",
    last_modified: "2026-06-23T15:41:00.000Z"
  }
} as const;

import type { SdoaManifest } from "../sdoaFileApi";

export function detectDrift(
  filePath: string,
  source: string,
  manifest: SdoaManifest,
  issues: string[],
  suggestions: string[]
) {
  const baseName = filePath.split(/[\\/]/).pop() || "";
  const idFromFile = baseName.replace(/\.(ts|tsx)$/, "");

  if (manifest.id !== "UNKNOWN" && manifest.id !== idFromFile) {
    issues.push(`Drift: MANIFEST.id (${manifest.id}) does not match file name (${idFromFile}).`);
    suggestions.push(`Rename file or update MANIFEST.id to "${idFromFile}".`);
  }

  if (manifest.layer === "application" && filePath.includes("/substrate/")) {
    issues.push("Drift: application-layer module is placed under substrate.");
    suggestions.push("Move module to an application-layer directory or update MANIFEST.layer.");
  }

  if (manifest.layer === "substrate" && filePath.includes("/ui/")) {
    issues.push("Drift: substrate-layer module is placed under ui.");
    suggestions.push("Move module to substrate/ or update MANIFEST.layer.");
  }

  const headerVersionMatch = source.match(/\/\/\s*Version:\s*([0-9]+\.[0-9]+\.[0-9]+)/);
  if (headerVersionMatch) {
    const headerVersion = headerVersionMatch[1];
    if (headerVersion !== manifest.version) {
      issues.push(
        `Drift: header version (${headerVersion}) does not match MANIFEST.version (${manifest.version}).`
      );
      suggestions.push("Keep header Version and MANIFEST.version in sync.");
    }
  }
}
