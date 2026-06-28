// ------------------------------------------------------------------
// File:    revertExtractionEngine.ts
// Version: 1.0.0
// Updated: 2026-06-23T16:30:00.000Z
// Changes: Initial creation of extraction revert engine
// SDOA compliance is required
// ------------------------------------------------------------------

export const MANIFEST = {
  id: "engine.extraction.revert",
  type: "engine",
  layer: "substrate",
  runtime: "node",
  version: "1.0.0",
  action_surface: ["revert.extraction"],
  commands: ["revertExtraction"],
  events: [],
  accepts: ["extraction.diff.payload"],
  slots: [],
  dependencies: [],
  sovereign_lineage: "engine.extraction.revert",
  variant_of: null,
  docs: {
    description: "Reverts an extraction by restoring the original source file.",
    last_modified: "2026-06-23T16:30:00.000Z"
  }
} as const;

import fs from "fs";

export function revertExtraction(payload: any) {
  const { file, originalSource } = payload;
  if (!file || !originalSource) {
    throw new Error("RevertExtraction: missing file or originalSource in payload.");
  }
  fs.writeFileSync(file, originalSource, "utf8");
}
