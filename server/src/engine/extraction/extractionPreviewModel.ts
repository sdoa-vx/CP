// ------------------------------------------------------------------
// File:    extractionPreviewModel.ts
// Version: 1.0.0
// Updated: 2026-06-23T16:10:00.000Z
// Changes: Initial creation of extraction preview model
// SDOA compliance is required
// ------------------------------------------------------------------

export const MANIFEST = {
  id: "engine.extraction.previewModel",
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
  sovereign_lineage: "engine.extraction.previewModel",
  variant_of: null,
  docs: {
    description: "Defines the typed model for extraction diff payloads.",
    last_modified: "2026-06-23T16:10:00.000Z"
  }
} as const;

export interface ExtractionPreviewModel {
  file: string;
  removed: string[];
  added: string[];
  unifiedDiff: string;
  modulePath: string;
  moduleSource: string;
  originalSource: string;
  manifest: any;
  header: string;
}
