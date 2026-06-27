// ------------------------------------------------------------------
// File:    extractionDiffGenerator.ts
// Version: 1.0.0
// Updated: 2026-06-23T16:10:00.000Z
// Changes: Initial creation of SDOA-compliant extraction diff generator
// SDOA compliance is required
// ------------------------------------------------------------------

export const MANIFEST = {
  id: "engine.extraction.diffGenerator",
  type: "engine",
  layer: "substrate",
  runtime: "node",
  version: "1.0.0",
  action_surface: ["generate.diff"],
  commands: ["buildExtractionDiff"],
  events: ["extraction.diff.ready"],
  accepts: ["extraction.result"],
  slots: [],
  dependencies: [
    "engine.cognizance.manifestValidator",
    "engine.cognizance.driftDetector"
  ],
  sovereign_lineage: "engine.extraction.diffGenerator",
  variant_of: null,
  docs: {
    description: "Generates unified diffs and module previews for extracted SDOA modules.",
    last_modified: "2026-06-23T16:10:00.000Z"
  }
} as const;

import { diffLines } from "diff";
import { ExtractionPreviewModel } from "./extractionPreviewModel";

export function buildExtractionDiff(
  originalSource: string,
  updatedSource: string,
  modulePath: string,
  moduleSource: string,
  manifest: any,
  header: string,
  file: string
): ExtractionPreviewModel {
  const diff = diffLines(originalSource, updatedSource);

  const removed: string[] = [];
  const added: string[] = [];

  let unified = "";

  for (const part of diff) {
    if (part.added) {
      added.push(part.value);
      unified += `+ ${part.value}`;
    } else if (part.removed) {
      removed.push(part.value);
      unified += `- ${part.value}`;
    } else {
      unified += `  ${part.value}`;
    }
  }

  return {
    file,
    removed,
    added,
    unifiedDiff: unified,
    modulePath,
    moduleSource,
    originalSource,
    manifest,
    header
  };
}
