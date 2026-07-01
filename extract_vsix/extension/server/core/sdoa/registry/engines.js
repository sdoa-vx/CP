"use strict";

/**
 * engines.js — SDOA Engine Registry
 *
 * Extracted from: authorities/conductor/index.ts (WasmSolver.engine registration),
 * _variances/SDOAvX/sdoa-core/src/base.ts (Engine subclass),
 * SDOA-Whitepaper-Technical.txt Sections 12, 15,
 * blueprint.schema.json (engine module references)
 */

const ENGINE_REGISTRY = [
  {
    id:              "WasmSolver.engine",
    type:            "engine",
    runtime:         "Wasm",
    layer:           3,
    folder:          "evolution/engines/WasmSolver/",
    description:     "WebAssembly-based solver engine. Registered by ConductorTask at startup via registerPolyglot(). Provides high-performance computation in Wasm sandboxed runtime.",
    registered_by:   "authorities/conductor/index.ts (ConductorTask.registerWasmSolver)",
    operationalRole: "savant",
    capabilities:    ["compute.wasm"]
  }
];

// ─── Engine Rules ─────────────────────────────────────────────────────────────
const ENGINE_RULES = [
  "Engines are Layer 3 modules that live in the evolution/ zone.",
  "Engine folders are versioned: evolution/engines/{EngineName}/v{version}/",
  "Binary artifacts (.wasm, .bin) live inside the engine's versioned folder — never in /assets/ or /static/.",
  "Polyglot engines (Python, Rust, etc.) are registered via PolyglotBridge and the registry.registerPolyglot() method.",
  "Engines must declare a static MANIFEST with type: 'engine' and the correct runtime (Wasm, Python, Rust, C++, etc.).",
  "The operationalRole for domain-expert engines with no system governance role is 'savant'."
];

// ─── Operational Roles Registry ───────────────────────────────────────────────
// Source: SDOA-Whitepaper-Technical.txt Section 19 (v5.0 operationalRole field)
const OPERATIONAL_ROLES = {
  registrar: {
    description:  "Module that maintains the module registry and arbitrates identity conflicts",
    assigned_to:  ["Registrar.service", "Registry.service"]
  },
  captain: {
    description:  "Module that governs application state transitions and fallback containment",
    assigned_to:  ["Captain.service"]
  },
  conductor: {
    description:  "Module that manages the EventBus circuit breakers and event mesh",
    assigned_to:  ["Conductor.service"]
  },
  coach: {
    description:  "Module that provides guidance, recommendations, or coaching to other modules",
    assigned_to:  []
  },
  "probation-officer": {
    description:  "Module that performs static analysis and gatekeeping of new modules",
    assigned_to:  ["ProbationOfficer.workflow"]
  },
  "assembly-line": {
    description:  "Module that manages subprocess spawning and lifecycle (worker pool)",
    assigned_to:  ["AssemblyLine.service"]
  },
  triage: {
    description:  "Module that classifies and routes incoming requests or problems",
    assigned_to:  []
  },
  savant: {
    description:  "Domain-expert module with no system governance role. Use for application-domain modules.",
    assigned_to:  ["WasmSolver.engine", "MathSolver.engine", "TextClassifier.engine", "(most application domain modules)"]
  }
};

module.exports = { ENGINE_REGISTRY, ENGINE_RULES, OPERATIONAL_ROLES };
