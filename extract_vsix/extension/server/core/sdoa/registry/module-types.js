"use strict";

/**
 * module-types.js — SDOA Module Type Definitions
 *
 * Extracted from: authorities/registrar/Registry.service.ts (SdoaManifest type enum),
 * SDOA-Whitepaper-Technical.txt Sections 5, 6, 18,
 * sdoa-linter.js / linter.ts (layer detection by type),
 * sdoa-base.js / base.ts (subclass definitions),
 * blueprint.schema.json (module type distribution)
 */

const MODULE_TYPE_DEFINITIONS = {

  // ─── Layer 2 Types ────────────────────────────────────────────────────────
  primitive: {
    layer:            2,
    runtime:          "Browser",
    folder:           "ui/primitives/",
    file_suffix:      ".prim.js",
    id_suffix:        ".prim",
    manifest:         "const MANIFEST (inside IIFE)",
    export:           "window.ModuleLoader.register(MANIFEST, { init, mount, update, unmount, destroy })",
    lifecycle:        ["init", "mount", "update", "unmount", "destroy"],
    line_target:      250,
    line_ceiling:     500,
    base_class_ts:    "Primitive",
    description:      "Generic, reusable, domain-agnostic UI atom. Layer 2.",
    rules: [
      "Must be IIFE-wrapped",
      "Must use const MANIFEST",
      "Must NOT call fetch()",
      "Must call window.ModuleLoader.register()",
      "Must NOT import Layer 1 or Layer 3 modules"
    ]
  },

  // ─── Layer 1 Types ────────────────────────────────────────────────────────
  feature: {
    layer:            1,
    runtime:          "Browser",
    folder:           "ui/features/",
    file_suffix:      ".feature.js",
    id_suffix:        ".feature",
    manifest:         "const MANIFEST (inside IIFE)",
    export:           "via IIFE — exposes mount, unmount, update to feature registry",
    lifecycle:        ["init", "mount", "update", "unmount", "destroy"],
    line_target:      350,
    line_ceiling:     500,
    base_class_ts:    "Feature",
    description:      "Composed UI screen area using Layer 2 primitives. Domain-specific. Layer 1.",
    rules: [
      "Must implement mount() and unmount()",
      "Must be IIFE-wrapped",
      "Must use const MANIFEST",
      "Must NOT directly call Layer 3 modules",
      "Backend calls only via adapters declared in backendDeps"
    ]
  },

  // ─── Layer 3 Types ────────────────────────────────────────────────────────
  adapter: {
    layer:            3,
    runtime:          "NodeJS | Universal | Browser",
    folder:           "substrate/adapters/ (backend) | ui/adapters/ (frontend)",
    file_suffix:      ".adapter.js | .adapter.ts",
    id_suffix:        ".adapter",
    manifest:         "static MANIFEST (class static property)",
    export:           "module.exports = ClassName (JS) | export class ClassName (TS)",
    lifecycle:        ["init", "run", "dispose"],
    line_target:      350,
    line_ceiling:     500,
    base_class_ts:    "Adapter",
    base_class_js:    "Adapter (from environment/sdoa-base.js)",
    description:      "Bridges between the application domain and external systems, APIs, or protocols. Layer 3.",
    rules: [
      "Must declare static MANIFEST",
      "Must NOT reference window.* bare",
      "Frontend adapters may declare backendDeps[]"
    ]
  },

  service: {
    layer:            3,
    runtime:          "NodeJS | Universal",
    folder:           "substrate/services/ | authorities/*/",
    file_suffix:      ".service.js | .service.ts",
    id_suffix:        ".service",
    manifest:         "static MANIFEST (class static property)",
    export:           "module.exports = ClassName (JS) | export class ClassName (TS)",
    lifecycle:        ["init", "run", "dispose"],
    line_target:      350,
    line_ceiling:     500,
    base_class_ts:    "Service (from _variances/SDOAvX/sdoa-core/src/base.ts)",
    base_class_js:    "Service (from environment/sdoa-base.js)",
    description:      "Infrastructure or domain service. Long-lived, reusable by multiple features. Layer 3.",
    rules: [
      "Must declare static MANIFEST",
      "Must NOT reference window.* bare",
      "Must use 'use strict' in .js files"
    ]
  },

  workflow: {
    layer:            3,
    runtime:          "NodeJS | Universal",
    folder:           "substrate/workflows/",
    file_suffix:      ".workflow.js | .workflow.ts",
    id_suffix:        ".workflow",
    manifest:         "static MANIFEST (class static property)",
    export:           "module.exports = ClassName (JS) | export class ClassName (TS)",
    lifecycle:        ["init", "run", "dispose"],
    line_target:      400,
    line_ceiling:     500,
    base_class_ts:    "Service",
    description:      "Single-purpose operation invoked by Router on incoming IPC messages. Auto-discovered. Layer 3.",
    rules: [
      "Must declare static MANIFEST",
      "Creating the workflow file IS the registration step",
      "Must implement run(payload) returning ResponseFormatter shape",
      "IPC message type is snake_case of workflow ID"
    ]
  },

  repository: {
    layer:            3,
    runtime:          "NodeJS | Universal",
    folder:           "substrate/",
    file_suffix:      ".repository.js | .repository.ts",
    id_suffix:        ".repository",
    manifest:         "static MANIFEST (class static property)",
    export:           "module.exports = ClassName (JS) | export class ClassName (TS)",
    lifecycle:        ["init", "run", "dispose"],
    line_target:      400,
    line_ceiling:     500,
    description:      "Data access object. Manages persistence reads/writes. Layer 3.",
    rules: [
      "Must declare static MANIFEST",
      "Must NOT be called directly from Layer 1 features (only via adapters or workflows)"
    ]
  },

  engine: {
    layer:            3,
    runtime:          "Wasm | Python | Rust | C++ | NodeJS",
    folder:           "evolution/engines/{Name}/v{version}/",
    file_suffix:      "(varies by language)",
    id_suffix:        ".engine",
    manifest:         "static MANIFEST (JS/TS) | MANIFEST_JSON (Python)",
    lifecycle:        ["init", "run", "dispose"],
    line_target:      400,
    line_ceiling:     500,
    description:      "Polyglot computation engine. Registered via PolyglotBridge. Layer 3.",
    rules: [
      "Binary artifacts (.wasm, .bin) live in the engine folder",
      "Registered via registry.registerPolyglot()"
    ]
  },

  task: {
    layer:            3,
    runtime:          "NodeJS",
    folder:           "substrate/ | authorities/*/",
    file_suffix:      ".task.js | .task.ts",
    id_suffix:        ".task",
    manifest:         "static MANIFEST (class static property)",
    base_class_js:    "Task (from environment/sdoa-base.js)",
    description:      "Short-lived, one-shot background task. Layer 3. Example: ConductorTask (authorities/conductor/index.ts)."
  },

  utility: {
    layer:            3,
    runtime:          "NodeJS | Universal",
    folder:           "substrate/",
    file_suffix:      ".utility.js | .utility.ts",
    id_suffix:        ".utility",
    manifest:         "static MANIFEST (class static property)",
    description:      "Stateless utility module providing shared helper functions. Layer 3."
  },

  component: {
    layer:            2,
    runtime:          "Browser",
    folder:           "ui/",
    file_suffix:      ".component.js | .component.ts",
    id_suffix:        ".component",
    manifest:         "const MANIFEST or static MANIFEST (depends on runtime)",
    base_class_js:    "Component (from environment/sdoa-base.js)",
    description:      "UI component. Similar to primitive but may be more composite. Layer 2."
  },

  dashboard: {
    layer:            1,
    runtime:          "Browser",
    folder:           "ui/dashboards/",
    file_suffix:      ".dashboard.js",
    id_suffix:        ".dashboard",
    description:      "Full-page UI module. Composes features and primitives into a complete screen. Layer 1."
  },

  validator: {
    layer:            3,
    runtime:          "NodeJS | Universal",
    folder:           "substrate/ | authorities/*/",
    file_suffix:      ".validator.js | .validator.ts",
    id_suffix:        ".validator",
    manifest:         "static MANIFEST (class static property)",
    description:      "Data or schema validation module. Layer 3. Example: ConfigValidator.service.js."
  }
};

module.exports = { MODULE_TYPE_DEFINITIONS };
