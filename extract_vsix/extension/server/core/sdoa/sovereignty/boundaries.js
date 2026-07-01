"use strict";

/**
 * boundaries.js — SDOA Sovereign Zone Definitions
 *
 * Extracted from: SDOA-Whitepaper-Technical.txt Sections 3, 7, 8,
 * SDOA-Governance-Outline.txt Sections 2, 7, sdoav5 clarification.txt,
 * SDOA-Historical-Timeline.txt Section 2.2
 */

const SOVEREIGNTY_BOUNDARIES = {

  // ─── UI Sovereign Zone ────────────────────────────────────────────────────
  UI: {
    path: "ui/",
    description: "UI sovereigns. Owns all CSS, UI schemas, and UI data files.",
    what_belongs: [
      "tokens.css — Global design tokens. Only place for global CSS custom properties (variables).",
      "primitives/ — Layer 2 generic UI atoms. One folder per primitive. CSS co-located.",
      "features/ — Layer 1 composed screen areas. One folder per feature. CSS co-located.",
      "dashboards/ — Full UI pages.",
      "adapters/ — Frontend Layer 3 adapters (IPC, state management, data fetching).",
      "services/ — Frontend cross-cutting services (EventBus).",
      "data/ — Externalized data owned by UI modules (schemas, catalogs, defaults)."
    ],
    what_is_forbidden: [
      "Direct backend IPC calls from Layer 2 primitives",
      "fetch() calls from Layer 2 primitives",
      "window.* global state (use StateStore instead)",
      "Hard-coded HTML content (use schema-driven rendering)",
      "CSS outside of co-located .prim.css / .feature.css / tokens.css",
      "One-off bespoke components instead of configured generic primitives",
      "Event listeners that are not removed in unmount()"
    ],
    naming_conventions: {
      primitive: "PascalCase.prim.js — e.g., Button.prim.js",
      primitive_css: "PascalCase.prim.css — e.g., Button.prim.css",
      feature: "PascalCase.feature.js — e.g., UserSettings.feature.js",
      feature_css: "PascalCase.feature.css — e.g., Dashboard.feature.css (optional)",
      css_class_prefix: "sdoa-{primitive-name} — e.g., sdoa-button, sdoa-modal, sdoa-panel"
    },
    layers: [1, 2]
  },

  // ─── Substrate Sovereign Zone ─────────────────────────────────────────────
  SUBSTRATE: {
    path: "substrate/",
    description: "Backend infrastructure sovereigns. All server-side services, adapters, workflows, and engines.",
    what_belongs: [
      "services/ — Infrastructure-layer Node.js services (EventBus, Chronicle, AssemblyLine, etc.)",
      "adapters/ — Backend-side adapters (AiBroker, LlmConnector, TokenBudget, etc.)",
      "bridges/ — Cross-language IPC bridges",
      "engines/ — Substrate-level computation engines",
      "workflows/ — Backend operation modules (auto-discovered by Router)"
    ],
    what_is_forbidden: [
      "window.* global references (bare window reference without typeof check)",
      "Direct DOM manipulation",
      "CSS files",
      "setTimeout() inside init() methods",
      "setTimeout() without corresponding clearTimeout() and _timers tracking",
      "window.EventBus fallback references (except in EventBus module itself)",
      "Circular dependencies between modules"
    ],
    naming_conventions: {
      service: "PascalCase.service.js — e.g., Chronicle.service.js",
      adapter: "PascalCase.adapter.js — e.g., AiBroker.adapter.js",
      workflow: "PascalCase.workflow.js — e.g., ProbationOfficer.workflow.js",
      repository: "PascalCase.repository.js — e.g., Memory.repository.js",
      typescript: "PascalCase.service.ts / PascalCase.adapter.ts / etc."
    },
    manifest_declaration: "static MANIFEST = { ... } (class static property)",
    export_convention: "module.exports = ClassName (JS) or export class ClassName (TS)",
    layer: 3
  },

  // ─── Evolution Sovereign Zone ─────────────────────────────────────────────
  EVOLUTION: {
    path: "evolution/",
    description: "Polyglot computation engines and legacy module handling.",
    what_belongs: [
      "engines/ — Domain-specific polyglot engines (Rust, Python, JS, C++). One folder per engine, versioned.",
      "legacy/ — Formally deprecated modules (graveyard only — after formal deprecation process).",
      "experimental/ — System-level experiments only (not for individual module variants).",
      "translations/ — Cross-language port versions of modules."
    ],
    what_is_forbidden: [
      "Active variants placed directly in legacy/ or experimental/ (variants belong in parent sovereign's variants/)",
      "Binary artifacts outside of their engine's folder",
      "Modules that belong in substrate/ or authorities/"
    ],
    naming_conventions: {
      engine_folder: "EngineName/v{version}/ — e.g., Solvers/SolverV3/",
      variant_folder: "EngineName/variants/{variant-name}/ — e.g., TextClassifier/variants/distilled/"
    },
    legacy_rule: "A module goes to legacy/ ONLY AFTER it is marked deprecated in its manifest AND removed from the active registry. Legacy is a graveyard, not a workspace."
  },

  // ─── Authorities Sovereign Zone ───────────────────────────────────────────
  AUTHORITIES: {
    path: "authorities/",
    description: "System governance and routing. The bootstrap, captain, conductor, registrar, and router system sovereigns.",
    what_belongs: [
      "bootstrap/ — System startup sequences and initialization order.",
      "captain/ — Application state sovereignty and lifecycle control (Captain.service.js).",
      "conductor/ — Event mesh management and circuit breaking (Conductor.service.js).",
      "registrar/ — Module registry and manifest index (Registrar.service.js, Registry.service.ts).",
      "router/ — Dynamic routing configuration (Router.service.js)."
    ],
    module_roles: {
      registrar: {
        module: "Registrar.service.js",
        role: "Monitors portfolio directories for structural changes. Reads manifest profiles. Resolves naming collisions. Evaluates compiler matrices to prioritize the most optimal asset when multiple components claim identical functional identity paths."
      },
      captain: {
        module: "Captain.service.js",
        role: "Dictates application state transitions. Handles global initializations. Manages fallback containment protocols when a runtime component fails or encounters an unhandled exception."
      },
      conductor: {
        module: "Conductor.service.js",
        role: "Intercepts cross-module message passing across the universal EventBus. Evaluates actions.events and actions.accepts manifest blocks to prevent event storms or circular logical deadlocks. Manages circuit breakers, suppression timers, and per-event rate caps."
      },
      router: {
        module: "Router.service.js",
        role: "Auto-discovering IPC message dispatcher — the backend spine. Converts incoming snake_case message types to PascalCase workflow IDs and dispatches with no manual registration. Supports configurable middleware stack and express lanes."
      },
      bootstrap: {
        module: "(startup sequences)",
        role: "System boot order and initialization sequencing."
      }
    },
    naming_conventions: {
      authority_config: "PascalCase.jsn — e.g., registry.jsn, routes.jsn"
    },
    what_is_forbidden: [
      "Placing application domain modules here",
      "Placing UI components or primitives here"
    ]
  },

  // ─── Environment Sovereign Zone ───────────────────────────────────────────
  ENVIRONMENT: {
    path: "environment/",
    description: "Environment concerns. .env templates, shell scripts, bootstrap scripts, OS-level helpers, dev environment configs.",
    what_belongs: [
      "setup.sh — Environment setup script",
      "teardown.sh — Environment teardown script",
      "dev.env — Development environment variables",
      "prod.env — Production environment variables",
      "docker-compose.yaml — Docker configuration",
      "sdoa-base.js — SDOA core base classes (SdoaModule, Service, Adapter, Task, Component)",
      "sdoa-linter.js — SDOA compliance checker"
    ],
    purpose: "Keeps environment concerns separate from sovereign runtime concerns.",
    what_is_forbidden: [
      "Application domain modules",
      "UI components",
      "Backend services or workflows"
    ]
  },

  // ─── Documentation Zone (not a sovereign zone but a recognized directory) ─
  DOCUMENTATION: {
    path: "documentation/",
    description: "SDOA specification documents. The single source of truth is SDOA-Whitepaper-Technical.txt.",
    what_belongs: [
      "SDOA-Whitepaper-Technical.txt — Single source of truth for current architecture",
      "SDOA-Whitepaper-Executive.txt — Leadership reference",
      "SDOA-Governance-Outline.txt — Operational governance rules",
      "SDOA-Historical-Timeline.txt — Chronological evolution record",
      "Archive/ — Historical specification documents (v4 spec, v5 clarification, etc.)"
    ]
  }
};

// ─── Prohibited Directories ────────────────────────────────────────────────
// Source: SDOA-Whitepaper-Technical.txt Section 8, SDOA-Governance-Outline.txt Section 7.2,
//         sdoav5 clarification.txt

const PROHIBITED_DIRECTORIES = [
  "/assets/",
  "/static/",
  "/deps/",
  "/resources/",
  "/misc/",
  "/global/"
];

const PROHIBITED_DIRECTORIES_REASON = "These directories violate sovereignty and create dumping grounds that make the codebase undiscoverable. If you find yourself needing one of these names, determine which sovereign owns the files in question and place them there instead.";

// ─── Cross-Sovereign Communication Rules ─────────────────────────────────────
// Source: SDOA-Governance-Outline.txt Section 2.2

const CROSS_SOVEREIGN_COMMUNICATION_RULES = [
  "No module may directly modify another module's internal state, files, or implementation.",
  "Cross-module communication is permitted ONLY through declared manifest interfaces (requires/dependencies), the EventBus (publish/subscribe), the StateStore API (get/set/watch), or explicit service calls through the registry.",
  "Reaching into another module and modifying its internals — even for a 'quick fix' — is a sovereignty violation."
];

module.exports = {
  SOVEREIGNTY_BOUNDARIES,
  PROHIBITED_DIRECTORIES,
  PROHIBITED_DIRECTORIES_REASON,
  CROSS_SOVEREIGN_COMMUNICATION_RULES
};
