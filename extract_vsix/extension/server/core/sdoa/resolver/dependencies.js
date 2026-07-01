
const MANIFEST = {
  id: "dependencies.js",
  type: "module",
  layer: 4,
  runtime: "JavaScript",
  version: "1.0.0",
  operationalRole: "infrastructure",
  optimization: { priority: "stability" },
  capabilities: [
    "DECLARE_dependency",
    "INIT_ORDER_RESOLUTION",
    "CIRCULAR_DEPENDENCY",
    "LAYER_DEPENDENCIES"
  ],
  dependencies: [
    "dependencies.js"
  ],
  docs: "Auto-generated enriched SDOA manifest via static analysis"
};

"use strict";

/**
 * dependencies.js — SDOA Dependency Resolution Rules
 *
 * Extracted from: authorities/registrar/Registry.service.ts (initAll, get, register),
 * SDOA-Whitepaper-Technical.txt Sections 3.2, 13,
 * SDOA-Governance-Outline.txt Section 3.2,
 * blueprint.schema.json (requires arrays for all 22 modules),
 * sdoa-linter.js / linter.ts (circular dependency detection)
 */

const DEPENDENCY_RESOLUTION_RULES = {

  // ─── Declaration Rules ────────────────────────────────────────────────────
  DECLARATION: {
    description:    "Rules for declaring dependencies in the manifest",
    fields:         ["requires", "dependencies"],
    field_note:     "'requires' is the v4.0+ name; 'dependencies' is the v1.2 name. Both are equivalent. Either or both may be present.",
    format:         "Array of module ID strings — e.g., ['Chronicle.service', 'ResponseFormatter.service']",
    rules: [
      "Every module that uses another module must declare it in requires[] or dependencies[].",
      "Only direct dependencies should be listed. Transitive dependencies are resolved by the registry.",
      "The special virtual dependency 'Types' is never validated — it is a compile-time concept.",
      "Do not list yourself as a dependency.",
      "If a module uses a service only occasionally (lazy load), it should still be declared as a dependency."
    ]
  },

  // ─── Registry Validation at initAll() ────────────────────────────────────
  INIT_ORDER_RESOLUTION: {
    description:    "How Registry.service.ts resolves initialization order based on declared dependencies",
    mechanism:      "initAll() calls init() on each module in dependency order — dependencies are initialized before the modules that depend on them.",
    algorithm: [
      "Topological sort of the dependency graph",
      "Modules with no dependencies are initialized first",
      "A module is initialized only after all its requires[] entries are initialized",
      "If a circular dependency is detected, initAll() will loop infinitely — this is why circular deps are prohibited"
    ],
    validation: [
      "All IDs in requires[] must be registered in the registry before initAll() is called",
      "If a required ID is not registered, initAll() will fail with a 'module not found' error",
      "Exception: 'Types' is skipped — it is a virtual dependency"
    ]
  },

  // ─── Circular Dependency Prohibition ─────────────────────────────────────
  CIRCULAR_DEPENDENCY: {
    rule:           "Circular dependencies are prohibited. If module A declares B in requires[], B must not declare A in its requires[].",
    detection:      "The linter performs a DFS traversal of the dependency graph to detect cycles.",
    consequence:    "A circular dependency causes initAll() to deadlock — it will wait for A before initializing B, but B must be initialized before A.",
    resolution:     "If circular dependency is needed, extract the shared concern into a new sovereign C that both A and B depend on."
  },

  // ─── Layer Dependency Rules ────────────────────────────────────────────────
  LAYER_DEPENDENCIES: {
    description:    "Layer traffic rules constrain which modules may declare dependencies on which",
    rules: [
      "Layer 1 (features) may depend on Layer 2 (primitives). Declared in requires[].",
      "Layer 1 (features) may depend on frontend adapters. Declared in backendDeps[].",
      "Layer 2 (primitives) must NOT declare dependencies on other layers. They emit events only.",
      "Layer 3 (backend) may depend on other Layer 3 modules. Declared in requires[].",
      "Layer 3 (backend) must NOT declare dependencies on Layer 1 or Layer 2 modules.",
      "backendDeps[] is for adapter modules only — it declares which backend routes the adapter needs."
    ]
  },

  // ─── backendDeps Pattern ──────────────────────────────────────────────────
  BACKEND_DEPS: {
    description:    "The backendDeps[] manifest field for frontend adapter modules",
    who_uses_it:    "Frontend adapter modules (.adapter.js in ui/adapters/) only",
    purpose:        "Declares which backend workflow/service/repository actions this adapter needs. BackendConnector reads this at init() to build the routing table automatically.",
    format:         "[{ action: string, via: string, params: object }]",
    rule:           "Adding a backendDeps entry is the only step needed to add a backend route. No changes to BackendConnector or Router are required.",
    example: [
      {
        action: "send_message",
        via:    "SendMessage.workflow",
        params: { model: "string", messages: "array" }
      },
      {
        action: "run_test",
        via:    "TestRunner.workflow",
        params: { testId: "string" }
      }
    ]
  },

  // ─── Known Dependency Graph (from blueprint.schema.json) ─────────────────
  KNOWN_DEPENDENCIES: {
    description: "Confirmed dependency relationships extracted from blueprint.schema.json",
    "Scaffold.workflow":         ["Registrar.service", "ProbationOfficer.workflow", "Registry.service"],
    "ProbationOfficer.workflow": ["Registry.service"],
    "TestRunner.workflow":       ["TestCore.workflow", "Logger.service"],
    "TestCore.workflow":         ["AiBroker.adapter", "Registry.service"],
    "AiBroker.adapter":          ["LlmConnector.adapter", "Registry.service"],
    "LlmConnector.adapter":      ["TokenBudget.adapter"],
    "SendMessage.workflow":      ["LlmConnector.adapter", "PersistentMemory.service", "TokenBudget.adapter"],
    "Chronicle.service":         [],
    "AssemblyLine.service":      [],
    "ResponseFormatter.service": [],
    "Registrar.service":         ["Registry.service"],
    "Conductor.service":         ["Registry.service"],
    "Router.service":            ["Registry.service"]
  }
};

module.exports = { DEPENDENCY_RESOLUTION_RULES };
