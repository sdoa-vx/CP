// ------------------------------------------------------------------
// File:    extractionEvent.schema.ts
// Version: 1.0.0
// Updated: 2026-06-23T17:20:00.000Z
// Changes: Initial creation of canonical SDOA ExtractionEvent schema
// SDOA compliance is required
// ------------------------------------------------------------------

export const MANIFEST = {
  id: "registry.schema.extractionEvent",
  type: "schema",
  layer: "substrate",
  runtime: "node",
  version: "1.0.0",
  action_surface: [],
  commands: [],
  events: [],
  accepts: [],
  slots: [],
  dependencies: [],
  sovereign_lineage: "registry.schema.extractionEvent",
  variant_of: null,
  docs: {
    description: "Canonical schema for SDOA ExtractionEvent entries stored in the registry.",
    last_modified: "2026-06-23T17:20:00.000Z"
  }
} as const;

export interface ExtractionEvent {
  /** Unique ID for this extraction event */
  id: string;

  /** Absolute path of the file where extraction occurred */
  source_file: string;

  /** Absolute path of the new module created */
  module_path: string;

  /** The SDOA module ID assigned to the extracted module */
  module_id: string;

  /** The type of module extracted (primitive, workflow, schema, engine, token) */
  module_type: string;

  /** The version of the module at creation (usually 1.0.0) */
  module_version: string;

  /** The sovereign lineage assigned to the module */
  sovereign_lineage: string;

  /** Unified diff of the extraction (red/green) */
  unified_diff: string;

  /** Lines removed from the source file */
  removed_lines: string[];

  /** Lines added to the source file */
  added_lines: string[];

  /** The full source of the extracted module */
  module_source: string;

  /** The MANIFEST of the extracted module */
  manifest: any;

  /** The header block of the extracted module */
  header: string;

  /** Drift score at the time of extraction (0–100) */
  drift_score: number;

  /** Extraction complexity score (0–100) */
  extraction_score: number;

  /** Timestamp of extraction */
  created_at: string;

  /** Optional: original source before extraction (for revert) */
  original_source?: string;

  /** Optional: updated source after injector applied */
  updated_source?: string;

  /** Optional: agent or subsystem that performed extraction */
  actor?: string;

  /** Optional: tags for analytics */
  tags?: string[];
}
