// ------------------------------------------------------------------
// File:    extractionDiffEvents.ts
// Version: 1.0.0
// Updated: 2026-06-23T16:10:00.000Z
// Changes: Initial creation of extraction diff event router
// SDOA compliance is required
// ------------------------------------------------------------------

export const MANIFEST = {
  id: "engine.extraction.diffEvents",
  type: "engine",
  layer: "substrate",
  runtime: "node",
  version: "1.0.0",
  action_surface: ["emit.diff"],
  commands: ["sendExtractionDiff"],
  events: [],
  accepts: ["extraction.diff.payload"],
  slots: [],
  dependencies: ["engine.extraction.diffGenerator"],
  sovereign_lineage: "engine.extraction.diffEvents",
  variant_of: null,
  docs: {
    description: "Routes extraction diff payloads to the VS Code extension via IPC.",
    last_modified: "2026-06-23T16:10:00.000Z"
  }
} as const;

import { sendToExtension } from "../../ipc/vscodeBridge";
import { ExtractionPreviewModel } from "./extractionPreviewModel";

export function sendExtractionDiff(payload: ExtractionPreviewModel) {
  sendToExtension("extraction:diff", payload);
}
