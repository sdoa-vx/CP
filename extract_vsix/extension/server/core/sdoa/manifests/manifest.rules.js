"use strict";

/**
 * manifest.rules.js — SDOA Manifest Rules
 *
 * Extracted from: Registry.service.ts, registry.ts (SdoaManifest interface),
 * sdoa-linter.js / linter.ts (validation checks), ConfigValidator.service.js,
 * SDOA-Whitepaper-Technical.txt (Sections 4, 21), SDOA-Governance-Outline.txt (Section 3).
 *
 * These are the rules the registry enforces at module registration time.
 */

// ─── Mandatory Fields ────────────────────────────────────────────────────────
// Source: Registry.service.ts validateManifest(), registry.ts SdoaManifest interface,
//         SDOA-Governance-Outline.txt Section 3.1, sdoa-linter.js

const REQUIRED_FIELDS = [
  "id",       // Unique module identifier — no two modules share an id
  "type",     // Module type (see MODULE_TYPES below)
  "version",  // Semantic version string
  "runtime",  // Execution environment
  "layer"     // Architectural layer (1, 2, or 3)
];

// ─── v1.2 Mandatory Fields (full compliance) ──────────────────────────────
// Source: SDOA-Governance-Outline.txt Section 3.1, sdoav5 clarification.txt
// These must be present for full v1.2 compliance. Modules missing any field
// will be rejected by the registry at startup.

const V1_2_MANDATORY_FIELDS = [
  "id",           // Unique module identifier
  "type",         // Module type
  "version",      // Semantic version string
  "runtime",      // Execution environment
  "capabilities", // Array of capability strings
  "dependencies", // Array of module IDs required (v1.2 name)
  "docs",         // Documentation object (must have description)
  "last_modified" // ISO 8601 timestamp of most recent change
];

// ─── Optional Fields ─────────────────────────────────────────────────────────
// Source: SdoaManifest interface in Registry.service.ts and registry.ts

const OPTIONAL_FIELDS = [
  { name: "requires",         purpose: "v4.0 alias for dependencies — array of module IDs this module depends on" },
  { name: "capabilities",     purpose: "Array of capability strings this module provides to the system" },
  { name: "dependencies",     purpose: "Array of module IDs required (v1.2 field name, aliased by requires in v4.0+)" },
  { name: "dataFiles",        purpose: "Paths to external .json data files loaded at runtime (v4.0)" },
  { name: "lifecycle",        purpose: "Array of lifecycle method names this module implements (v4.0)" },
  { name: "actions",          purpose: "Action surface: commands, events, accepts, slots (v4.0)" },
  { name: "backendDeps",      purpose: "Backend dependency declarations for adapter modules (v4.0)" },
  { name: "operationalRole",  purpose: "System-level operational role classification (v5.0)" },
  { name: "optimization",     purpose: "Optimization targeting: {priority, assertionSuite} (v5.0)" },
  { name: "variant_of",       purpose: "ID of parent sovereign — required for variant modules" },
  { name: "compliance",       purpose: "Compliance declaration. Set non-sdoa-compliant: true if needed" },
  { name: "docs",             purpose: "Documentation object with description, author, sdoa version" },
  { name: "last_modified",    purpose: "ISO 8601 timestamp of last change (v1.2 mandatory, updated on every change)" }
];

// ─── Lifecycle Fields ─────────────────────────────────────────────────────────
// Source: SDOA-Whitepaper-Technical.txt Section 20, SDOA-Governance-Outline.txt Section 4

const LIFECYCLE_FIELDS = {
  field: "lifecycle",
  description: "Array of lifecycle method names. Declared in manifest to advertise which lifecycle methods are implemented.",
  frontend_lifecycle: ["init", "mount", "update", "unmount", "destroy"],
  backend_lifecycle:  ["init", "run", "dispose"],
  rules: {
    frontend: "Every UI module (primitive or feature) MUST implement all five frontend lifecycle methods.",
    backend:  "Backend modules (workflows, repositories) implement the three-method backend contract.",
    init_order:     "init() must be called before mount(). DOM work is forbidden in init().",
    mount_order:    "mount() receives the container element and is where rendering happens.",
    unmount_rule:   "unmount() must undo everything mount() did — remove all event listeners added in mount().",
    destroy_rule:   "destroy() must undo everything init() did. Must be called after unmount().",
    no_dom_in_init: "DO NOT touch the DOM in init(). The container does not exist yet.",
    ghost_listeners:"Event listeners registered in init() must be removed in destroy(). Forgetting creates ghost listeners that accumulate over time.",
    lifecycle_order:"Correct order: init → mount → [update*] → unmount → destroy. Skipping is a bug."
  }
};

// ─── Dependency Fields ────────────────────────────────────────────────────────
// Source: Registry.service.ts initAll() dependency validation,
//         SDOA-Whitepaper-Technical.txt Section 3.2

const DEPENDENCY_FIELDS = {
  requires: {
    description: "v4.0 name. Array of module IDs this module requires. Registry validates all are present before initAll().",
    validation:  "If a module declares requires: ['X'], module 'X' must be registered before initAll() runs. Exception: 'Types' is a virtual dependency and is not validated.",
    circular_rule: "Circular dependencies are prohibited. If A depends on B, B must not depend on A.",
    layer_rule:    "Layer traffic rules constrain which layers may depend on which. L1 -> L2 only, L2 -> Events only, L3 <- L1 only."
  },
  dependencies: {
    description: "v1.2 name for the same concept. Aliased by requires in v4.0 JavaScript context."
  },
  backendDeps: {
    description: "Adapter-only field. Declares which backend actions this adapter needs. BackendConnector reads this at init() to build its routing table automatically.",
    format:      "[{ action: string, via: string, params: object }]",
    routing_rule:"Adding a backendDeps entry is the only step needed to add a backend route. No changes to BackendConnector required."
  }
};

// ─── Data File Fields ─────────────────────────────────────────────────────────
// Source: SDOA-Whitepaper-Technical.txt Sections 8, 9.3,
//         SDOA-Governance-Outline.txt Section 7.3

const DATA_FILE_FIELDS = {
  dataFiles: {
    description: "Paths to external .json files loaded at runtime. v4.0 field.",
    placement_rule: "JSON files live with the sovereign that consumes them. Not in a global /data directory.",
    categories: {
      configuration: "Authority-owned JSON goes under authorities/ (e.g., authorities/registrar/registry.jsn)",
      schema:        "UI or substrate-owned JSON lives with the consuming module (e.g., ui/features/Workspace/schema.jsn)",
      engine_data:   "Evolution-owned JSON lives inside the engine folder (e.g., evolution/engines/TextClassifier/v2/metadata.jsn)"
    },
    prohibited: "Never put JSON files in /global/, /assets/, /static/, /deps/, /resources/, /misc/"
  }
};

// ─── Versioning Rules ─────────────────────────────────────────────────────────
// Source: SDOA-Governance-Outline.txt Section 10.2,
//         SDOA-Whitepaper-Technical.txt Sections 16 Gate 4, 19,
//         sdoa-linter.js version checks

const VERSIONING_RULES = {
  format:          "Semantic versioning: major.minor.patch (e.g., '5.0.0', '4.0.05'). Three-part format always.",
  micro_increment: "Gate 4 (Micro-Incrementation): Every alteration to a file requires a version increment. Patch increments on every change (e.g., 1.0.04 -> 1.0.05). Creates a dense audit trail.",
  amendment_rules: {
    new_optional_fields: "Amendments that add new optional fields: minor version increment (e.g., 4.0 -> 4.1)",
    new_mandatory_fields:"Amendments that add new mandatory fields: major version increment (e.g., 4.x -> 5.0)",
    limit_changes:       "Amendments that change limits or policies: minor version increment with amendment name"
  },
  header_sync: "Version in file header must match MANIFEST.version. Updated every change (Gate 4).",
  sdoa_version_by_layer: {
    layer_2_primitives: "Version '4.0.0' is the baseline for Layer 2 primitives (Browser environment).",
    layer_3_modules:    "Version '5.0.0' is the baseline for Layer 3 modules (NodeJS/Universal).",
    relaxed_rule:       "Linter accepts any version starting with '4.' or '5.' without error."
  },
  semver_comparison: "Registrar uses true SemVer scoring: higher major > minor > patch wins. Pre-release suffix (e.g., '-rc1') is stripped before comparison."
};

// ─── Validation Logic ─────────────────────────────────────────────────────────
// Source: Registry.service.ts validateManifest(), sdoa-linter.js lintFile(),
//         linter.ts lintContent(), ProbationOfficer.workflow.js run()

const VALIDATION_LOGIC = {
  registry_validation: {
    description: "Performed by Registry.service.ts at module registration time (register() call).",
    steps: [
      "Check manifest is not null/undefined",
      "Check all REQUIRED_FIELDS are present (id, type, version, runtime, layer)",
      "Throw SDOA Validation Error if any required field is missing",
      "Check module ID is not already registered (no duplicate IDs)",
      "Throw error if duplicate ID detected"
    ]
  },
  linter_validation: {
    description: "Performed by sdoa-linter.js / linter.ts at development/CI time.",
    layer_detection: [
      "Read layer field from manifest content (regex match)",
      "Read type field from manifest content (regex match)",
      "Fallback: infer layer from file path (ui/primitives or .prim. -> layer 2; ui/features or .feature. -> layer 1; substrate or authorities -> layer 3)",
      "Error if layer cannot be determined"
    ],
    checks_all_layers: [
      "Line count must not exceed layer-specific limit (Layer 1: 200, Layer 2: 150, Layer 3: 200) — NOTE: linter uses v4.0 limits; v4.1 Amendment raised targets",
      "JS files must have 'use strict' statement (TypeScript exempt — implicit strict mode)",
      "eval() is prohibited in all files",
      "Manifest must have 'id' field",
      "Manifest version must be appropriate for layer (layer 2: 4.x, layer 3: 5.x)"
    ],
    checks_layer_3: [
      "Python: must declare MANIFEST_JSON or MANIFEST",
      "Python: must declare class inheriting from Service, SdoaModule, or Dashboard",
      "JS/TS: must not reference window.* without typeof window check",
      "JS/TS: must declare 'static MANIFEST = { ... }'",
      "JS/TS: must export the class (module.exports or export class)",
      "JS/TS: setTimeout() is forbidden inside init()",
      "JS/TS: setTimeout without clearTimeout or _timers is a warning (potential memory leak)",
      "window.EventBus reference is forbidden in Layer 3 (except in EventBus module itself)"
    ],
    checks_layer_1_and_2: [
      "Non-TypeScript files must be wrapped in an IIFE: (function() { ... })()",
      "Must use 'const MANIFEST', not 'static MANIFEST' (browser layer)",
      "Layer 2 (primitives): fetch() is forbidden — primitives must be pure DOM",
      "Layer 2 (primitives): must call window.ModuleLoader.register (warning if missing)",
      "Layer 1 (features): must implement and export mount and unmount actions"
    ]
  },
  probation_officer_validation: {
    description: "Performed by ProbationOfficer.workflow.js on newly synthesized modules before portfolio acceptance.",
    steps: [
      "Extract static MANIFEST block from source payload",
      "Reject if MANIFEST is missing or malformed",
      "Check line count against CONSTRAINTS.MAX_LINE_LIMITS by manifest.type",
      "Run forbidden string checks (eval, Function(), window., global., process., child_process, cluster, prototype, __proto__)"
    ],
    max_line_limits: { primitive: 150, feature: 200, adapter: 200, workflow: 200, repository: 200 },
    forbidden_strings: [
      "eval\\(",
      "Function\\(",
      "window\\.",
      "global\\.",
      "process\\.",
      "child_process",
      "cluster",
      "prototype",
      "__proto__",
      "window.currentUser",
      "window.appState"
    ]
  }
};

module.exports = {
  REQUIRED_FIELDS,
  V1_2_MANDATORY_FIELDS,
  OPTIONAL_FIELDS,
  LIFECYCLE_FIELDS,
  DEPENDENCY_FIELDS,
  DATA_FILE_FIELDS,
  VERSIONING_RULES,
  VALIDATION_LOGIC,

  // Convenience alias
  MANIFEST_RULES: {
    REQUIRED_FIELDS,
    V1_2_MANDATORY_FIELDS,
    OPTIONAL_FIELDS,
    LIFECYCLE_FIELDS,
    DEPENDENCY_FIELDS,
    DATA_FILE_FIELDS,
    VERSIONING_RULES,
    VALIDATION_LOGIC
  }
};
