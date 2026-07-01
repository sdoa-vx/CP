"use strict";

/**
 * violations.js — SDOA Sovereignty Violation Patterns
 *
 * Extracted from: sdoa-linter.js / linter.ts (all checks),
 * SDOA-Whitepaper-Technical.txt Sections 3, 7, 12, 13, 17,
 * SDOA-Governance-Outline.txt Sections 2, 4, 7,
 * ProbationOfficer.workflow.js FORBIDDEN_STRINGS,
 * sdoav5 clarification.txt (file placement rules)
 */

const SOVEREIGNTY_VIOLATIONS = {

  // ─── Layer Violations ─────────────────────────────────────────────────────
  LAYER_VIOLATIONS: {
    description: "Violations of the three-layer architecture traffic rules",
    violations: [
      {
        pattern:   "A .prim.js file calls fetch()",
        rule:      "SR-020",
        category:  "Layer 2 backend call",
        detection: "Linter: checks layer 2 files for fetch() occurrence",
        severity:  "error"
      },
      {
        pattern:   "A .prim.js file directly calls a backend adapter, service, or IPC method",
        rule:      "SR-002",
        category:  "Layer 2 backend call",
        detection: "Linter: layer check on imports and require() calls",
        severity:  "error"
      },
      {
        pattern:   "A .feature.js file directly requires or imports a .adapter.js, .service.js, or .workflow.js",
        rule:      "SR-001",
        category:  "Layer 1 skips layer 2",
        detection: "Linter: layer check on requires",
        severity:  "error"
      },
      {
        pattern:   "A .feature.js imports a .repository.js",
        rule:      "SR-004",
        category:  "Layer skip",
        detection: "Linter: layer check on imports",
        severity:  "error"
      },
      {
        pattern:   "A .prim.js imports a .feature.js",
        rule:      "SR-004",
        category:  "Reverse layer skip",
        detection: "Linter: layer check on imports",
        severity:  "error"
      }
    ]
  },

  // ─── Manifest Violations ──────────────────────────────────────────────────
  MANIFEST_VIOLATIONS: {
    description: "Violations of the manifest declaration and content rules",
    violations: [
      {
        pattern:   "A Layer 3 JS module does not declare 'static MANIFEST = { ... }'",
        rule:      "SR-008",
        category:  "Missing manifest",
        detection: "Linter: checks for 'static MANIFEST' in layer 3 JS/TS files",
        severity:  "error"
      },
      {
        pattern:   "A browser module (Layer 1/2) uses 'static MANIFEST' instead of 'const MANIFEST'",
        rule:      "SR-008",
        category:  "Wrong manifest pattern",
        detection: "Linter: checks for 'static MANIFEST' in browser files",
        severity:  "error"
      },
      {
        pattern:   "A module manifest is missing one of: id, type, version, runtime, layer",
        rule:      "SR-008",
        category:  "Missing required field",
        detection: "Registry validateManifest(), Linter: REQUIRED_FIELDS check",
        severity:  "error"
      },
      {
        pattern:   "Two modules declare the same id value in their MANIFESTs",
        rule:      "SR-010",
        category:  "Duplicate ID",
        detection: "Registry register() duplicate ID check",
        severity:  "error"
      },
      {
        pattern:   "A file is modified but has no manifest and no 'non-sdoa-compliant: true' declaration",
        rule:      "SR-009",
        category:  "Undeclared non-compliance",
        detection: "Governance audit",
        severity:  "error"
      },
      {
        pattern:   "manifest.version does not match the version in the file's header block",
        rule:      "SR-024 / Gate 3",
        category:  "Header/manifest desync",
        detection: "Linter: header version vs manifest version comparison",
        severity:  "warning"
      }
    ]
  },

  // ─── IIFE / Module Structure Violations ───────────────────────────────────
  STRUCTURE_VIOLATIONS: {
    description: "Violations of the structural rules for browser layer modules",
    violations: [
      {
        pattern:   "A non-TypeScript Layer 1 or Layer 2 file is not wrapped in an IIFE",
        rule:      "SR-008",
        category:  "Missing IIFE wrapper",
        detection: "Linter: checks layer 1/2 JS files for (function() { pattern",
        severity:  "error"
      },
      {
        pattern:   "A Layer 2 primitive does not call window.ModuleLoader.register",
        rule:      "SR-008",
        category:  "Missing ModuleLoader registration",
        detection: "Linter: warning check for window.ModuleLoader.register in .prim.js",
        severity:  "warning"
      }
    ]
  },

  // ─── Security Violations ─────────────────────────────────────────────────
  SECURITY_VIOLATIONS: {
    description: "Prohibited patterns that violate sandbox and security guarantees",
    violations: [
      {
        pattern:   "Any file contains eval() call",
        rule:      "SR-017",
        category:  "Forbidden: eval",
        detection: "Linter: string match for 'eval(' or 'eval '; ProbationOfficer: FORBIDDEN_STRINGS",
        severity:  "error"
      },
      {
        pattern:   "Any file contains Function() constructor call",
        rule:      "SR-017",
        category:  "Forbidden: Function constructor",
        detection: "ProbationOfficer: FORBIDDEN_STRINGS includes 'Function('",
        severity:  "error"
      },
      {
        pattern:   "Any file accesses __proto__ or prototype for chain manipulation",
        rule:      "SR-017",
        category:  "Forbidden: prototype mutation",
        detection: "ProbationOfficer: FORBIDDEN_STRINGS includes 'prototype', '__proto__'",
        severity:  "error"
      },
      {
        pattern:   "Any substrate/authorities JS file lacks 'use strict' declaration",
        rule:      "SR-018",
        category:  "Missing strict mode",
        detection: "Linter: checks layer 3 JS files for 'use strict'",
        severity:  "error"
      }
    ]
  },

  // ─── Node.js / Layer 3 Runtime Violations ────────────────────────────────
  RUNTIME_VIOLATIONS: {
    description: "Violations specific to Node.js Layer 3 runtime modules",
    violations: [
      {
        pattern:   "A Layer 3 JS/TS file contains bare 'window.' reference without typeof guard",
        rule:      "SR-015",
        category:  "Bare window reference",
        detection: "Linter: regex for 'window.' not preceded by 'typeof window' check",
        severity:  "error"
      },
      {
        pattern:   "A Layer 3 module's init() method contains setTimeout()",
        rule:      "SR-016",
        category:  "setTimeout in init",
        detection: "Linter: checks for setTimeout inside init() method body",
        severity:  "error"
      },
      {
        pattern:   "A Layer 3 module uses setTimeout() without a corresponding clearTimeout() or _timers tracking",
        rule:      "SR-016",
        category:  "Untracked timer",
        detection: "Linter: checks for setTimeout without clearTimeout",
        severity:  "warning"
      },
      {
        pattern:   "A Layer 3 module references window.EventBus (except EventBus module itself)",
        rule:      "SR-015",
        category:  "window.EventBus reference",
        detection: "Linter: specific check for window.EventBus in layer 3",
        severity:  "error"
      },
      {
        pattern:   "A Layer 3 module (non-substrate) references process., child_process, or cluster directly",
        rule:      "SR-015",
        category:  "Forbidden node globals",
        detection: "ProbationOfficer: FORBIDDEN_STRINGS includes 'process.', 'child_process', 'cluster'",
        severity:  "error"
      }
    ]
  },

  // ─── Lifecycle Violations ─────────────────────────────────────────────────
  LIFECYCLE_VIOLATIONS: {
    description: "Violations of the module lifecycle contract",
    violations: [
      {
        pattern:   "A Layer 1 feature file does not declare mount() method",
        rule:      "SR-019",
        category:  "Missing mount",
        detection: "Linter: checks .feature.js for 'mount' keyword",
        severity:  "error"
      },
      {
        pattern:   "A Layer 1 feature file does not declare unmount() method",
        rule:      "SR-019",
        category:  "Missing unmount",
        detection: "Linter: checks .feature.js for 'unmount' keyword",
        severity:  "error"
      },
      {
        pattern:   "Event listeners registered in init() are not removed in destroy()",
        rule:      "SR-019",
        category:  "Ghost listeners",
        detection: "Code review",
        severity:  "warning"
      },
      {
        pattern:   "DOM manipulation performed inside init() before mount()",
        rule:      "SR-019",
        category:  "DOM in init",
        detection: "Code review",
        severity:  "error"
      }
    ]
  },

  // ─── State Violations ─────────────────────────────────────────────────────
  STATE_VIOLATIONS: {
    description: "Violations of the state management rules",
    violations: [
      {
        pattern:   "Code assigns values to window.* as application state (e.g., window.currentProject, window._files)",
        rule:      "SR-021",
        category:  "Global state on window",
        detection: "ProbationOfficer: FORBIDDEN_STRINGS includes 'window.currentUser', 'window.appState'; code review",
        severity:  "error"
      },
      {
        pattern:   "A module directly modifies another module's internal object properties",
        rule:      "SR-007",
        category:  "Cross-module mutation",
        detection: "Code review",
        severity:  "error"
      }
    ]
  },

  // ─── File Placement Violations ───────────────────────────────────────────
  PLACEMENT_VIOLATIONS: {
    description: "Violations of the file placement and directory rules",
    violations: [
      {
        pattern:   "Any file placed in /assets/, /static/, /deps/, /resources/, /misc/, or /global/",
        rule:      "SR-011 / SR-012 / SR-013",
        category:  "Prohibited directory",
        detection: "Registry scan: prohibited directory filter on registered paths",
        severity:  "error"
      },
      {
        pattern:   "CSS placed outside of the UI sovereign (co-located or tokens.css)",
        rule:      "SR-011",
        category:  "CSS outside UI",
        detection: "sdoav5 clarification.txt rules — CSS belongs in UI",
        severity:  "error"
      },
      {
        pattern:   "A .wasm or binary file placed in /assets/ or /static/",
        rule:      "SR-012",
        category:  "Binary outside engine",
        detection: "sdoav5 clarification.txt rules — binary belongs with consuming engine",
        severity:  "error"
      },
      {
        pattern:   "An active variant module placed in evolution/legacy/ or /experimental/ instead of parent/variants/",
        rule:      "SR-014",
        category:  "Variant in wrong directory",
        detection: "sdoav5 clarification.txt variant placement rules",
        severity:  "error"
      },
      {
        pattern:   "A variant module's manifest lacks the 'variant_of' field",
        rule:      "SR-014",
        category:  "Variant missing parentage declaration",
        detection: "Registry: checks variant_of field presence for modules with variant- in ID",
        severity:  "error"
      }
    ]
  },

  // ─── Line Limit Violations ────────────────────────────────────────────────
  LINE_LIMIT_VIOLATIONS: {
    description: "Violations of the v4.1 Amendment line limit rules",
    violations: [
      {
        pattern:   "A .prim.js file exceeds 250 lines (target) or 500 lines (hard ceiling)",
        rule:      "v4.1 Amendment",
        category:  "Line limit exceeded — primitive",
        detection: "Linter: line count check with layer-specific limits",
        severity:  "error"
      },
      {
        pattern:   "A .feature.js file exceeds 350 lines (target) or 500 lines (hard ceiling)",
        rule:      "v4.1 Amendment",
        category:  "Line limit exceeded — feature",
        detection: "Linter: line count check with layer-specific limits",
        severity:  "error"
      },
      {
        pattern:   "Any file exceeds 500 lines (absolute ceiling across all module types)",
        rule:      "v4.1 Amendment",
        category:  "Hard ceiling exceeded",
        detection: "Linter: absolute line count check",
        severity:  "error"
      }
    ]
  },

  // ─── Routing / Auto-Discovery Violations ──────────────────────────────────
  ROUTING_VIOLATIONS: {
    description: "Violations of the auto-discovery and routing rules",
    violations: [
      {
        pattern:   "A new workflow is registered via a manual switch case in Router.service.js",
        rule:      "SR-022",
        category:  "Manual routing registration",
        detection: "Code review: inspect Router.service.js for switch statements",
        severity:  "error"
      },
      {
        pattern:   "A workflow file ID does not match the PascalCase convention that Router auto-generates from snake_case message type",
        rule:      "SR-022",
        category:  "Routing ID mismatch",
        detection: "Router._toWorkflowId() conversion check: snake_case -> PascalCase",
        severity:  "error"
      }
    ]
  },

  // ─── Gate Violations ──────────────────────────────────────────────────────
  GATE_VIOLATIONS: {
    description: "Violations of the Five Implementation Protocol Gates",
    violations: [
      {
        gate:      1,
        name:      "Pending State",
        pattern:   "A module is scaffolded but not committed to the registry as 'pending' before implementation begins",
        severity:  "warning"
      },
      {
        gate:      2,
        name:      "Atomic File Delivery",
        pattern:   "A file modification is delivered as a partial snippet or diff instead of a complete file",
        severity:  "error"
      },
      {
        gate:      3,
        name:      "Temporal Metadata Headers",
        pattern:   "A file is modified without updating its header block (File, Version, Updated, Changes)",
        severity:  "error"
      },
      {
        gate:      4,
        name:      "Micro-Incrementation",
        pattern:   "A file is modified but version is not incremented; last_modified is not updated",
        severity:  "error"
      },
      {
        gate:      5,
        name:      "Declarative Compliance",
        pattern:   "Code is written before verifying architectural placement, layer compliance, dependency declaration, and lifecycle contract",
        severity:  "error"
      }
    ]
  }
};

module.exports = { SOVEREIGNTY_VIOLATIONS };
