"use strict";

/**
 * sdoa.version.js — SDOA Version History and Rules
 *
 * Extracted from: SDOA-Historical-Timeline.txt (complete),
 * SDOA-Whitepaper-Technical.txt Sections 1, 2, 21,
 * SDOA-Governance-Outline.txt Section 10,
 * evolution/legacy/sdoa-core/src/linter.ts (Version: 5.0.0 header)
 */

// ─── Current Version ──────────────────────────────────────────────────────────
const SDOA_VERSION = "5.0";

const SDOA_NAME = "Self-Describing Object Architecture";
const SDOA_NAME_NOTE = "Official name adopted by C1 Resolution 2026-06-17. Prior informal name 'Service-Oriented Dispatcher Architecture' is superseded and must not be used.";

// ─── Module Count ─────────────────────────────────────────────────────────────
const CURRENT_MODULE_COUNT = 147;

// ─── Version History ──────────────────────────────────────────────────────────
const VERSION_HISTORY = [
  {
    version:     "1.0",
    date:        "March 2026",
    codename:    "Foundation",
    description: "Initial architecture. Basic manifest concept introduced. Static MANIFEST on every module.",
    key_changes: [
      "Introduced MANIFEST as the core identity mechanism for every module",
      "Defined initial module types: service, adapter, workflow",
      "Established basic sovereignty principle: modules own their own files"
    ],
    mandatory_fields: ["id", "type", "version", "runtime", "capabilities", "dependencies", "docs", "last_modified"]
  },
  {
    version:     "2.0",
    date:        "April 2026",
    description: "Three-layer architecture formalized. Layer 1/2/3 defined. Layer traffic rules introduced.",
    key_changes: [
      "Formalized three-layer architecture: L1=Features, L2=Primitives, L3=Backend",
      "Prohibited Layer 2 from calling fetch() or backend",
      "Introduced mount/unmount lifecycle requirement for Layer 1 features",
      "Added IIFE wrapping requirement for browser modules"
    ]
  },
  {
    version:     "3.0",
    date:        "April 2026",
    description: "Sovereignty boundaries documented. Cross-sovereign communication rules. Registrar two-tier pipeline introduced.",
    key_changes: [
      "Documented sovereignty zones: UI, SUBSTRATE, EVOLUTION, AUTHORITIES, ENVIRONMENT",
      "Prohibited /assets/, /static/, /deps/, /resources/, /misc/, /global/ directories",
      "Introduced Registrar two-tier ingestion pipeline with ProbationOfficer",
      "SemVer comparison for champion variant arbitration"
    ]
  },
  {
    version:     "4.0",
    date:        "May 2026",
    description: "Major expansion. Layer field added to manifest. Actions block, lifecycle block, dataFiles, backendDeps added. Line limits introduced.",
    key_changes: [
      "Added 'layer' as required manifest field",
      "Added 'actions' block (commands, events, accepts, slots)",
      "Added 'lifecycle' field",
      "Added 'dataFiles' field",
      "Added 'backendDeps' field for adapter modules",
      "Added 'requires' as v4.0 alias for 'dependencies'",
      "Introduced line limits by layer: L1=200, L2=150, L3=200",
      "Router auto-discovery: snake_case → PascalCase workflow ID convention",
      "Variant policy formalized: variants/ subdirectory, variant_of field"
    ],
    mandatory_fields_added: ["layer"]
  },
  {
    version:     "4.1",
    date:        "May/June 2026",
    description: "Amendment: Line limits raised per module type. v4.1 is an amendment to v4.0, not a full version.",
    key_changes: [
      "Line limit targets raised: primitive 150→250, feature 200→350, adapter 200→350, workflow 200→400, repository 200→400",
      "Hard ceiling established at ~500 lines for all module types",
      "Clarified JSON file placement rules",
      "Clarified CSS file placement rules",
      "Clarified binary file placement rules",
      "Variant placement rules documented (sdoav5 clarification.txt)"
    ],
    amendment_type: "minor — new optional guidance, no new mandatory fields"
  },
  {
    version:     "5.0",
    date:        "June 2026",
    description: "Current version. Official name formalized. operationalRole and optimization fields added. 147 modules registered.",
    key_changes: [
      "Official name 'Self-Describing Object Architecture' adopted (C1 Resolution 2026-06-17)",
      "Added 'operationalRole' field: registrar, captain, conductor, coach, probation-officer, assembly-line, triage, savant",
      "Added 'optimization' field: { priority: speed|safety|readability|memory-footprint, assertionSuite: string }",
      "Linter version header: 'Version: 5.0.0'",
      "19 canonical UI primitives standardized",
      "Registry at 147 modules",
      "Five Implementation Protocol Gates formalized"
    ],
    mandatory_fields_added: ["operationalRole (optional)", "optimization (optional)"]
  }
];

// ─── Version Rules ────────────────────────────────────────────────────────────
const VERSION_RULES = {
  module_version_format:     "Semantic versioning: major.minor.patch (e.g., '5.0.0', '1.0.05'). Three-part format always.",
  gate_4_micro_increment:    "Every alteration to a file requires a version increment. Patch increments on every change (Gate 4).",
  header_sync:               "Version in file header must match MANIFEST.version. Updated every change.",
  baseline_layer_2:          "Version '4.0.0' is the baseline for Layer 2 primitives (Browser environment). Linter accepts any '4.x' version.",
  baseline_layer_3:          "Version '5.0.0' is the baseline for Layer 3 modules (NodeJS/Universal). Linter accepts any '5.x' version.",
  amendment_minor:           "Amendments that add new optional fields: minor version increment (e.g., 4.0 → 4.1)",
  amendment_major:           "Amendments that add new mandatory fields: major version increment (e.g., 4.x → 5.0)",
  semver_scoring:            "Registrar uses true SemVer scoring: higher major > minor > patch. Pre-release suffix ('-rc1') stripped before comparison.",
  tie_break_order:           "When versions tie: optimization.priority wins. Order: speed > safety > readability > memory-footprint."
};

// ─── Compatibility Matrix ─────────────────────────────────────────────────────
const COMPATIBILITY_MATRIX = {
  "v5.0": {
    backward_compatible_with: ["v4.0", "v4.1"],
    new_fields:               ["operationalRole", "optimization"],
    new_field_requirement:    "optional — existing v4.0/v4.1 modules do not need to add these fields immediately",
    breaking_changes:         "None relative to v4.0/v4.1 — v5.0 is additive"
  },
  "v4.1": {
    backward_compatible_with: ["v4.0"],
    changed:                  "Line limit targets raised (non-breaking — higher limits allow more code)",
    breaking_changes:         "None"
  },
  "v4.0": {
    backward_compatible_with: ["v3.0 with migration"],
    migration_required:       ["Add 'layer' field to all manifests", "Add 'actions' block where applicable"],
    breaking_changes:         "'layer' field is now required"
  },
  migration_phases: {
    description: "SDOA-Historical-Timeline.txt documented migration phases 0-9 for v4.0 adoption",
    phase_0:     "Audit and inventory of all modules",
    phase_1:     "Add 'layer' field to all manifests",
    phase_2:     "Add 'actions' blocks to all manifests",
    phase_3:     "Add 'lifecycle' declarations",
    phase_4:     "Add 'dataFiles' and 'backendDeps' where needed",
    phase_5:     "Resolve all linter violations",
    phase_6:     "Move variants to parent/variants/ directories",
    phase_7:     "Eliminate prohibited directory usage",
    phase_8:     "Register all modules with Registrar",
    phase_9:     "Full v4.0 compliance achieved"
  }
};

module.exports = {
  SDOA_VERSION,
  SDOA_NAME,
  SDOA_NAME_NOTE,
  CURRENT_MODULE_COUNT,
  VERSION_HISTORY,
  VERSION_RULES,
  COMPATIBILITY_MATRIX
};
