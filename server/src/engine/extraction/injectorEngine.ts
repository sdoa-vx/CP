// ------------------------------------------------------------------
// File:    injectorEngine.ts
// Version: 1.0.0
// Updated: 2026-06-23T17:00:00.000Z
// Changes: Initial creation of injector engine to patch files from extraction payloads
// SDOA compliance is required
// ------------------------------------------------------------------

export const MANIFEST = {
  id: "engine.extraction.injector",
  type: "engine",
  layer: "substrate",
  runtime: "node",
  version: "1.0.0",
  action_surface: ["inject.apply"],
  commands: ["applyInjectorFromDiff"],
  events: ["inject.applied"],
  accepts: ["extraction.diff.payload"],
  slots: [],
  dependencies: [],
  sovereign_lineage: "engine.extraction.injector",
  variant_of: null,
  docs: {
    description: "Applies injector changes to a source file based on extraction diff payload.",
    last_modified: "2026-06-23T17:00:00.000Z"
  }
} as const;

import fs from "fs";

export interface InjectorPayload {
  file: string;
  updatedSource: string;
}

export function applyInjectorFromDiff(payload: InjectorPayload) {
  const { file, updatedSource } = payload;

  if (!file || typeof updatedSource !== "string") {
    throw new Error("applyInjectorFromDiff: missing file or updatedSource.");
  }

  if (!fs.existsSync(file)) {
    throw new Error(`applyInjectorFromDiff: file not found: ${file}`);
  }

  fs.writeFileSync(file, updatedSource, "utf8");
}
