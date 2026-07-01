"use strict";

/**
 * rules.js — SDOA Sovereignty Rules
 *
 * Extracted from: SDOA-Whitepaper-Technical.txt Sections 3, 7, 12, 13, 17,
 * SDOA-Governance-Outline.txt Sections 2, 4, sdoa-linter.js / linter.ts,
 * SDOA-Historical-Timeline.txt Section 2.2
 *
 * Each rule: { id, description, sovereign, violation, rationale }
 */

const SOVEREIGNTY_RULES = [

  // ─── Layer Architecture Rules ───────────────────────────────────────────
  {
    id: "SR-001",
    description: "Features (Layer 1) may only call Layer 2 primitives. Features must never call Layer 3 adapters, services, or workflows directly.",
    sovereign: "UI",
    violation: "A .feature.js file directly imports or invokes an .adapter.js, .service.js, or .workflow.js",
    rationale: "Layer traffic rules ensure testability and separation of concerns. Backend calls are routed through adapters declared in the manifest's backendDeps."
  },
  {
    id: "SR-002",
    description: "Primitives (Layer 2) may only emit events. Primitives must never call adapters, features, or backend services.",
    sovereign: "UI",
    violation: "A .prim.js file calls an adapter, makes an IPC call, or imports a Layer 3 module",
    rationale: "Primitives are generic building blocks. They must be domain-agnostic and reusable across any feature context. Backend awareness would couple them to specific application logic."
  },
  {
    id: "SR-003",
    description: "Layer 3 modules (adapters, services, workflows) are only called from Layer 1 features. Layer 2 primitives are unaware of the backend.",
    sovereign: "SUBSTRATE",
    violation: "A .prim.js file invokes a backend adapter or workflow",
    rationale: "The three-layer architecture enforces a strict unidirectional data flow that prevents spaghetti dependencies."
  },
  {
    id: "SR-004",
    description: "No layer skipping. Layer 1 must never call Layer 3 repositories directly. Layer 2 must never call Layer 1.",
    sovereign: "ALL",
    violation: "A feature imports a .repository.js; a primitive imports a .feature.js",
    rationale: "Layer-skipping creates invisible dependencies not declared in manifests, breaking auto-discovery and making the dependency graph inaccurate."
  },
  {
    id: "SR-005",
    description: "No circular dependencies. If module A depends on B, then B must not depend on A.",
    sovereign: "ALL",
    violation: "Module A lists B in requires[]; Module B lists A in requires[]",
    rationale: "Circular dependencies cause initialization order failures and make the registry's dependency validation loop infinitely."
  },

  // ─── Module Sovereignty Rules ────────────────────────────────────────────
  {
    id: "SR-006",
    description: "Each module owns its own source file(s), manifest, CSS file(s), data files (schemas, configs it consumes), and its variants. It does not own anything inside another module's folder.",
    sovereign: "ALL",
    violation: "A module modifies files inside another sovereign's folder, or a shared 'global data' directory is created",
    rationale: "Sovereignty principle: modules are self-contained. Cross-module mutations create invisible couplings and hidden dependencies."
  },
  {
    id: "SR-007",
    description: "No module may directly modify another module's internal state, files, or implementation. Cross-module communication is permitted only through declared interfaces (manifest requires), EventBus, StateStore API, or explicit registry calls.",
    sovereign: "ALL",
    violation: "Module A directly mutates the internal state or calls private methods of Module B",
    rationale: "Sovereignty principle formalized in v4.0. Informal cross-module mutations became a maintenance problem as the codebase grew."
  },

  // ─── Manifest Rules ──────────────────────────────────────────────────────
  {
    id: "SR-008",
    description: "Every SDOA module must declare 'static MANIFEST = { ... }' as a class static property (Layer 3 JS/TS) or 'const MANIFEST = { ... }' (Layer 1/2 browser).",
    sovereign: "ALL",
    violation: "A module class does not have a static MANIFEST property; browser module uses 'static MANIFEST'",
    rationale: "The manifest is the module's contract with the rest of the system. Without it, the module cannot be auto-discovered, validated, or registered."
  },
  {
    id: "SR-009",
    description: "All files that are touched, always (forward and backward), must have an SDOA v1.2 manifest. If the file cannot be made fully compliant, the manifest must declare 'non-sdoa-compliant: true'.",
    sovereign: "ALL",
    violation: "A file is modified but has no manifest block and no non-sdoa-compliant declaration",
    rationale: "Governance rule: undeclared non-compliance is not acceptable. A file without a manifest and without a non-compliance declaration is a governance violation."
  },
  {
    id: "SR-010",
    description: "Module IDs must be unique across the entire system. No two modules may share an id.",
    sovereign: "ALL",
    violation: "Two modules declare the same id value in their MANIFESTs",
    rationale: "The registry uses IDs as keys. Duplicate IDs cause registration errors and non-deterministic behavior."
  },

  // ─── File Placement Rules ────────────────────────────────────────────────
  {
    id: "SR-011",
    description: "CSS belongs to UI sovereigns. Primitive CSS must be co-located with its .prim.js file. Global design tokens go in ui/tokens.css only.",
    sovereign: "UI",
    violation: "CSS is placed in a global /styles/ or /assets/ directory; primitive CSS is not co-located",
    rationale: "CSS is presentation. Presentation belongs to UI. UI is sovereign over its own styling."
  },
  {
    id: "SR-012",
    description: "Binary files (.bin, .wasm, compiled artifacts) must live with the engine or substrate module that consumes them. Never in /assets/ or /static/.",
    sovereign: "EVOLUTION / SUBSTRATE",
    violation: "A .wasm file is placed in /assets/ or /static/ rather than with its engine sovereign",
    rationale: "Binary artifacts are part of the implementation of a sovereign capability. They live with the engine that uses them."
  },
  {
    id: "SR-013",
    description: "JSON and data files must live with the sovereign that consumes them. Authority-owned config JSON goes under authorities/. Schema JSON goes with the consuming module. Engine data goes inside the engine folder.",
    sovereign: "ALL",
    violation: "A global /data/ or /config/ directory is created; JSON is placed outside its consuming sovereign",
    rationale: "JSON is not 'global data.' It is configuration or schema, and sovereignty applies."
  },
  {
    id: "SR-014",
    description: "Variants must live in the parent sovereign's variants/ subdirectory. Variants must never go in /legacy/, /experimental/, /global/, or /misc/ unless formally deprecated and removed from the active registry.",
    sovereign: "ALL",
    violation: "A variant is placed in evolution/legacy/, /experimental/, or any prohibited directory while still active",
    rationale: "Variants are sovereigns, not loose files. They must declare their parentage and live with their parent to enable auto-discovery and dependency graph accuracy."
  },

  // ─── Layer 3 Specific Rules ──────────────────────────────────────────────
  {
    id: "SR-015",
    description: "Layer 3 JS/TS modules must not reference window.* globals without a typeof window !== 'undefined' guard.",
    sovereign: "SUBSTRATE",
    violation: "A service or workflow file contains bare 'window.' references",
    rationale: "Layer 3 modules run in Node.js where window is undefined. Bare window access causes runtime crashes."
  },
  {
    id: "SR-016",
    description: "setTimeout() is forbidden inside init() in Layer 3 modules. setTimeout() usage requires corresponding clearTimeout() and _timers tracking.",
    sovereign: "SUBSTRATE",
    violation: "An init() method contains setTimeout(); a module uses setTimeout() without tracking for cleanup",
    rationale: "setTimeout() in init() is an anti-pattern (the 'setTimeout catch hack'). Proper async init() with await and lifecycle order replaces it. Untracked timers cause memory leaks."
  },
  {
    id: "SR-017",
    description: "eval() is prohibited in all layers and all module types.",
    sovereign: "ALL",
    violation: "Any file contains eval() or eval ",
    rationale: "eval() is a security vulnerability that violates the sandbox guarantees the ProbationOfficer enforces."
  },
  {
    id: "SR-018",
    description: "Layer 3 JS files must declare 'use strict' at the top. TypeScript files are exempt (implicit strict mode in ES modules).",
    sovereign: "SUBSTRATE",
    violation: "A .js file in substrate/ or authorities/ does not have 'use strict'",
    rationale: "Strict mode prevents accidental globals and enforces safer coding patterns in the Node.js environment."
  },

  // ─── Lifecycle Rules ─────────────────────────────────────────────────────
  {
    id: "SR-019",
    description: "Layer 1 features must implement and export both mount and unmount lifecycle methods.",
    sovereign: "UI",
    violation: "A .feature.js file does not declare mount or unmount",
    rationale: "mount() and unmount() are the lifecycle symmetry pair. Implementing mount without unmount causes ghost listeners and memory leaks."
  },
  {
    id: "SR-020",
    description: "Layer 2 primitives must not use fetch(). Primitives must be pure DOM.",
    sovereign: "UI",
    violation: "A .prim.js file contains fetch()",
    rationale: "Primitives are generic UI atoms with no backend connections. Fetching data would couple them to a specific application context, destroying their reusability."
  },

  // ─── StateStore Rule ─────────────────────────────────────────────────────
  {
    id: "SR-021",
    description: "All application state must flow through StateStore.get/set/watch. window.* global state is prohibited.",
    sovereign: "UI",
    violation: "Code uses window.currentProject = ..., window._attachedFiles, or any window.* state variable",
    rationale: "window.* globals create invisible dependencies between modules not declared in manifests, break testing, and cause state persistence bugs."
  },

  // ─── Workflow Auto-Discovery Rule ────────────────────────────────────────
  {
    id: "SR-022",
    description: "Creating a workflow file IS the registration step. No manual switch statements or registration calls in Router.service.js.",
    sovereign: "SUBSTRATE",
    violation: "A new workflow requires manual entry in a switch statement or routing table",
    rationale: "Router.service.js converts incoming snake_case message types to PascalCase workflow IDs and dispatches automatically. Manual registration is the anti-pattern this architecture replaces."
  },

  // ─── Gate Rules ──────────────────────────────────────────────────────────
  {
    id: "SR-023",
    description: "Gate 2 (Atomic File Delivery): All code modifications must be delivered as complete source files. Partial snippets are prohibited.",
    sovereign: "ALL",
    violation: "A file patch is delivered as a diff or snippet rather than a complete file",
    rationale: "A complete file is always safe to drop in. A partial file can break module discovery if the manifest or export is incomplete."
  },
  {
    id: "SR-024",
    description: "Gate 3 (Temporal Metadata Headers): Every file must begin with a standardized header block containing File, Version, Updated, and Changes fields.",
    sovereign: "ALL",
    violation: "A file is modified without updating its header block",
    rationale: "The header block is the audit trail for every file in the system."
  },
  {
    id: "SR-025",
    description: "Gate 5 (Declarative Compliance): Before writing any code, verify architectural placement. The module must comply with its layer rules, declare all dependencies, and follow the lifecycle contract.",
    sovereign: "ALL",
    violation: "Code is written before confirming architectural compliance",
    rationale: "Fix the architecture first, then write the code. Retrofitting architecture into existing code is far more expensive."
  }
];

module.exports = { SOVEREIGNTY_RULES };
