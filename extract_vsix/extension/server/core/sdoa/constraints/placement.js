
const MANIFEST = {
  id: "placement.js",
  type: "module",
  layer: 4,
  runtime: "JavaScript",
  version: "1.0.0",
  operationalRole: "infrastructure",
  optimization: { priority: "stability" },
  capabilities: [
    "[object Object]"
  ],
  dependencies: [],
  docs: "SDOA auto-generated enriched manifest for placement.js file via static analysis"
};

"use strict";

/**
 * placement.js — SDOA File Placement Rules
 *
 * Extracted from: SDOA-Whitepaper-Technical.txt Sections 5, 8, 9,
 * SDOA-Governance-Outline.txt Sections 7, 8, sdoav5 clarification.txt,
 * blueprint.schema.json (known module locations), authorities/conductor/index.ts
 */

const PLACEMENT_RULES = {

  // ─── Top-Level Directory Assignments ─────────────────────────────────────
  TOP_LEVEL_DIRECTORIES: {
    "ui/":              "All UI modules — Layer 1 features, Layer 2 primitives, frontend adapters, frontend services, UI data files",
    "substrate/":       "Backend infrastructure — Layer 3 services, adapters, workflows, repositories, bridges",
    "authorities/":     "System governance — bootstrap, captain, conductor, registrar, router",
    "evolution/":       "Polyglot computation engines and legacy graveyard",
    "documentation/":   "Specification documents only — no code",
    "environment/":     "Environment concerns — .env, scripts, sdoa-base.js, sdoa-linter.js",
    "portfolio/":       "Output folder for AI-scaffolded modules (written by Scaffold.workflow)",
    "_variances/":      "Variant/experimental copies of modules for testing or polyglot bridge"
  },

  // ─── UI Zone Placement ────────────────────────────────────────────────────
  UI: {
    "ui/primitives/{PrimitiveName}/": [
      "{PrimitiveName}.prim.js — The primitive source file (IIFE-wrapped)",
      "{PrimitiveName}.prim.css — The primitive's styles (optional, co-located)",
      "manifest.json — Standalone manifest (if manifest not in .prim.js)",
      "variants/ — Variant subfolder for primitive variants"
    ],
    "ui/features/{FeatureName}/": [
      "{FeatureName}.feature.js — The feature source file (IIFE-wrapped)",
      "{FeatureName}.feature.css — The feature's styles (optional, co-located)",
      "manifest.json — Standalone manifest (if manifest not in .feature.js)",
      "variants/ — Variant subfolder for feature variants"
    ],
    "ui/tokens.css":  "Global design tokens — the ONLY place for :root CSS custom properties",
    "ui/adapters/":   "Frontend adapters (IPC, BackendConnector, StateStore wrappers)",
    "ui/services/":   "Frontend services (EventBus browser bridge, etc.)",
    "ui/data/":       "Externalized data owned by UI modules (schemas, catalogs, defaults)",
    "ui/dashboards/": "Full-page dashboard UI modules"
  },

  // ─── Substrate Zone Placement ─────────────────────────────────────────────
  SUBSTRATE: {
    "substrate/services/":  "Infrastructure-layer Node.js services (Chronicle, AssemblyLine, ResponseFormatter, etc.)",
    "substrate/adapters/":  "Backend-side adapters (AiBroker, LlmConnector, TokenBudget, etc.)",
    "substrate/workflows/": "Backend operation modules auto-discovered by Router (SendMessage, TestCore, Scaffold, etc.)",
    "substrate/bridges/":   "Cross-language IPC bridges (PolyglotBridge, etc.)",
    "substrate/engines/":   "Substrate-level computation engines",
    "substrate/services/{ModuleName}/variants/": "Variants of a substrate service",
    rules: [
      "Each module lives in exactly one of: services/, adapters/, workflows/, bridges/, engines/.",
      "Variant folders are always inside the parent module's own directory.",
      "No module mixes types (a file is either a service or an adapter, not both)."
    ]
  },

  // ─── Authorities Zone Placement ───────────────────────────────────────────
  AUTHORITIES: {
    "authorities/bootstrap/":   "System startup sequences and initialization order",
    "authorities/captain/":     "Captain.service.js — Application state and lifecycle governance",
    "authorities/conductor/":   "Conductor.service.js — EventBus circuit breaker; conductor/index.ts — ConductorTask entry point",
    "authorities/registrar/":   "Registrar.service.js, Registry.service.ts, registry.jsn",
    "authorities/router/":      "Router.service.js, routes.jsn"
  },

  // ─── Evolution Zone Placement ─────────────────────────────────────────────
  EVOLUTION: {
    "evolution/engines/{EngineName}/v{version}/": "Versioned engine folder — contains engine source, .wasm, data files, manifest",
    "evolution/engines/{EngineName}/variants/":   "Variant copies of a specific engine",
    "evolution/legacy/":                          "Formally deprecated modules ONLY — after deprecation in manifest AND removal from registry",
    "evolution/experimental/":                    "System-level experiments only — NOT for individual module variants",
    "evolution/translations/":                    "Cross-language port versions of modules",
    rules: [
      "legacy/ is a graveyard, not a workspace. A module goes there ONLY after formal deprecation.",
      "Active variants NEVER go in legacy/ or experimental/. They live in parent/variants/.",
      "Binary files (.wasm, .bin, compiled artifacts) live inside the engine folder that consumes them."
    ]
  },

  // ─── File Type Placement Rules ────────────────────────────────────────────
  FILE_TYPE_RULES: {
    CSS: {
      rule:      "CSS belongs to UI sovereigns only",
      placement: [
        "Global design tokens: ui/tokens.css (the ONLY place for CSS custom properties)",
        "Primitive-scoped styles: co-located with the .prim.js file (e.g., ui/primitives/Button/Button.prim.css)",
        "Feature-scoped styles: co-located with the .feature.js file (optional)",
        "NEVER in: /assets/, /static/, /styles/, /css/, or any non-UI folder"
      ]
    },
    BINARY: {
      rule:      "Binary files live with the engine or module that consumes them",
      placement: [
        ".wasm files: inside the engine folder (e.g., evolution/engines/WasmSolver/v3/solver.wasm)",
        ".bin compiled artifacts: inside the evolution/engines folder that produces them",
        "NEVER in: /assets/, /static/, /deps/, /resources/"
      ]
    },
    JSON: {
      rule:      "JSON files live with the sovereign that consumes them (see constraints/json.js for full rules)",
      placement: [
        "Authority config JSON: authorities/{authority}/config.jsn",
        "Module schema JSON: co-located with the module that owns it",
        "Engine data JSON: inside the evolution/engines/{Engine}/ folder",
        "NEVER in: /global/, /data/, /assets/, /static/, /resources/"
      ]
    },
    SCRIPTS: {
      rule:      "Shell/environment scripts belong in environment/",
      placement: [
        "setup.sh, teardown.sh, build scripts: environment/",
        "SDOA core infrastructure (sdoa-base.js, sdoa-linter.js): environment/",
        "NEVER spread across multiple directories"
      ]
    },
    VARIANTS: {
      rule:      "Variants live inside the parent sovereign's variants/ subdirectory",
      placement: [
        "Service variant: substrate/services/{ModuleName}/variants/{variant-descriptor}/",
        "Feature variant: ui/features/{ModuleName}/variants/{variant-descriptor}/",
        "Primitive variant: ui/primitives/{ModuleName}/variants/{variant-descriptor}/",
        "Each variant folder contains: source file, manifest.json",
        "NEVER in: /legacy/, /experimental/, /global/, /misc/ (while still active)"
      ]
    }
  },

  // ─── Known Module Canonical Paths ─────────────────────────────────────────
  CANONICAL_PATHS: {
    description: "Confirmed canonical paths for known SDOA modules",
    services: {
      "Chronicle.service":       "substrate/services/Chronicle.service.js",
      "AssemblyLine.service":    "substrate/services/AssemblyLine.service.js",
      "ResponseFormatter.service": "substrate/services/ResponseFormatter.service.js",
      "ConfigValidator.service": "substrate/services/ConfigValidator.service.js",
      "PolyglotBridge":          "substrate/services/PolyglotBridge.ts",
      "Comparators.service":     "substrate/services/Comparators.service.ts",
      "Logger.service":          "substrate/services/Logger.service.ts",
      "Evaluator.service":       "substrate/services/Evaluator.service.ts",
      "PersistentMemory.service": "substrate/services/PersistentMemory.service.ts"
    },
    adapters: {
      "AiBroker.adapter":        "substrate/adapters/AiBroker.adapter.ts",
      "LlmConnector.adapter":    "substrate/adapters/LlmConnector.adapter.ts",
      "TokenBudget.adapter":     "substrate/adapters/TokenBudget.adapter.ts"
    },
    workflows: {
      "TestCore.workflow":       "substrate/workflows/TestCore.workflow.ts",
      "TestRunner.workflow":     "substrate/workflows/TestRunner.workflow.ts",
      "SendMessage.workflow":    "substrate/workflows/SendMessage.workflow.ts",
      "Scaffold.workflow":       "substrate/workflows/Scaffold.workflow.js",
      "ProbationOfficer.workflow": "substrate/workflows/ProbationOfficer.workflow.js"
    },
    authorities: {
      "Registrar.service":       "authorities/registrar/Registrar.service.js",
      "Registry.service":        "authorities/registrar/Registry.service.ts",
      "Conductor.service":       "authorities/conductor/Conductor.service.js",
      "Router.service":          "authorities/router/Router.service.js"
    },
    environment: {
      "sdoa-base":               "environment/sdoa-base.js",
      "sdoa-linter":             "environment/sdoa-linter.js"
    }
  }
};

module.exports = { PLACEMENT_RULES };
