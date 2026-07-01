"use strict";

/**
 * layer.js — SDOA Layer Rules
 *
 * Extracted from: SDOA-Whitepaper-Technical.txt Sections 3, 7, 12,
 * SDOA-Governance-Outline.txt Section 2, sdoa-linter.js / linter.ts (layer detection and checks),
 * SDOA-Historical-Timeline.txt (v4.0 three-layer architecture introduction)
 */

const LAYER_RULES = {

  // ─── Layer Definitions ────────────────────────────────────────────────────
  LAYERS: {
    1: {
      name:         "Features",
      description:  "Composed screen areas. Domain-specific UI modules that orchestrate primitives.",
      file_suffix:  ".feature.js",
      runtime:      "Browser",
      folder:       "ui/features/",
      module_types: ["feature"],
      manifest_declaration: "const MANIFEST = { ... } (not static — browser layer)",
      wrapping:     "IIFE: (function() { 'use strict'; const MANIFEST = {...}; ... })()",
      responsibilities: [
        "Compose Layer 2 primitives into domain-specific UI",
        "Implement mount() and unmount() lifecycle methods",
        "Communicate with backend via adapters declared in backendDeps",
        "Subscribe to and emit EventBus events",
        "Manage local UI state via StateStore"
      ],
      forbidden: [
        "Direct calls to Layer 3 adapters, services, or workflows",
        "Direct calls to Layer 3 repositories",
        "fetch() calls (use BackendConnector adapter instead)",
        "window.* global state",
        "Implementing Layer 2 primitive UI directly (use configured primitives instead)"
      ]
    },
    2: {
      name:         "Primitives",
      description:  "Generic, reusable UI atoms. Domain-agnostic building blocks composed by Layer 1.",
      file_suffix:  ".prim.js",
      runtime:      "Browser",
      folder:       "ui/primitives/",
      module_types: ["primitive"],
      manifest_declaration: "const MANIFEST = { ... } (not static — browser layer)",
      wrapping:     "IIFE: (function() { 'use strict'; const MANIFEST = {...}; ... })()",
      responsibilities: [
        "Render generic, configurable UI components",
        "Emit DOM events and EventBus events",
        "Be domain-agnostic — usable by any feature",
        "Register with window.ModuleLoader.register()",
        "Provide stable API surface (methods and slots)"
      ],
      forbidden: [
        "fetch() calls — primitives must be pure DOM",
        "Direct IPC calls or backend adapter invocations",
        "Importing or calling Layer 1 features",
        "Importing or calling Layer 3 modules",
        "Domain-specific logic or hardcoded data",
        "Static MANIFEST declaration (use const MANIFEST)"
      ]
    },
    3: {
      name:         "Adapters / Services / Workflows / Repositories / Engines",
      description:  "Backend infrastructure layer. All server-side Node.js and polyglot modules.",
      file_suffix:  ".adapter.js/.ts | .service.js/.ts | .workflow.js/.ts | .repository.js/.ts",
      runtime:      "NodeJS | Wasm | Python | Rust | Universal",
      folder:       "substrate/ | authorities/ | evolution/",
      module_types: ["adapter", "service", "workflow", "repository", "engine", "task", "utility", "validator"],
      manifest_declaration: "static MANIFEST = { ... } (class static property)",
      export_convention: "module.exports = ClassName (JS) or export class ClassName (TS)",
      responsibilities: [
        "Implement domain logic, data access, and infrastructure",
        "Respond to IPC messages routed by Router.service.js",
        "Use Chronicle for audit logging",
        "Use ResponseFormatter for consistent output shapes",
        "Declare all dependencies in manifest requires/dependencies"
      ],
      forbidden: [
        "window.* global references (use typeof window !== 'undefined' guard if needed)",
        "Direct DOM manipulation",
        "CSS files",
        "setTimeout() inside init() methods",
        "setTimeout() without clearTimeout() and _timers tracking",
        "window.EventBus references (except EventBus module itself)",
        "eval() or Function() constructor",
        "Circular dependencies between modules"
      ]
    }
  },

  // ─── Layer Detection Algorithm ────────────────────────────────────────────
  LAYER_DETECTION: {
    description: "How the linter determines which layer a file belongs to (in priority order)",
    algorithm: [
      {
        step:   1,
        method: "manifest.layer field",
        rule:   "If the file contains a 'layer: N' or \"layer\": N pattern in a manifest block, that value wins."
      },
      {
        step:   2,
        method: "manifest.type field",
        rule:   "If the file contains a 'type: \"primitive\"' pattern, treat as layer 2. 'type: \"feature\"' → layer 1."
      },
      {
        step:   3,
        method: "File path heuristics",
        rule:   "ui/primitives or .prim. in path → layer 2. ui/features or .feature. in path → layer 1. substrate/ or authorities/ in path → layer 3."
      },
      {
        step:   4,
        method: "Error",
        rule:   "If layer cannot be determined by any of the above, linter reports an error."
      }
    ]
  },

  // ─── Layer Traffic Rules ──────────────────────────────────────────────────
  LAYER_TRAFFIC: {
    description: "Which layers may depend on which. These are the only permitted import directions.",
    allowed: [
      { from: 1, to: 2, description: "Layer 1 features may compose Layer 2 primitives" },
      { from: 2, to: "EventBus", description: "Layer 2 primitives may emit events (EventBus only)" },
      { from: 1, to: "EventBus", description: "Layer 1 features may subscribe to and emit events" },
      { from: 1, to: "Adapter", description: "Layer 1 features use backend adapters declared in backendDeps" }
    ],
    forbidden: [
      { from: 1, to: 3, description: "Layer 1 must not directly call Layer 3 services or workflows" },
      { from: 1, to: "Repository", description: "Layer 1 must not call repositories directly" },
      { from: 2, to: 1, description: "Layer 2 must not import Layer 1 features" },
      { from: 2, to: 3, description: "Layer 2 must not call Layer 3 adapters or services" },
      { from: 2, to: "fetch", description: "Layer 2 must not call fetch()" }
    ],
    diagram: "L1 (features) → L2 (primitives) → (events only). L3 ← L1 via declared adapters."
  },

  // ─── Layer-Specific Linter Checks ─────────────────────────────────────────
  LINTER_CHECKS_BY_LAYER: {
    all_layers: [
      "Line count must not exceed layer-specific limit",
      "JS files must have 'use strict'",
      "eval() is prohibited",
      "Manifest must have 'id' field"
    ],
    layer_1_features: [
      "IIFE wrapping required for non-TypeScript files",
      "Must use 'const MANIFEST', not 'static MANIFEST'",
      "Must implement mount and unmount lifecycle methods"
    ],
    layer_2_primitives: [
      "IIFE wrapping required for non-TypeScript files",
      "Must use 'const MANIFEST', not 'static MANIFEST'",
      "fetch() is forbidden",
      "Should call window.ModuleLoader.register() (warning if missing)"
    ],
    layer_3_backend: [
      "Must declare 'static MANIFEST = { ... }'",
      "Must not have bare window.* references",
      "Must not have window.EventBus references",
      "setTimeout() is forbidden inside init()",
      "setTimeout() without clearTimeout() triggers warning"
    ]
  }
};

module.exports = { LAYER_RULES };
