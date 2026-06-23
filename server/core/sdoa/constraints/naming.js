
const MANIFEST = {
  id: "naming.js",
  type: "module",
  layer: 4,
  runtime: "JavaScript",
  version: "1.0.0",
  operationalRole: "infrastructure",
  optimization: { priority: "stability" },
  capabilities: [
    "Naming Rules",
    "SDOA-Whitepaper-Technical.txt Sections 5, 6, 8",
    "sdoa-linter.js (layer detection patterns)",
    "Router.service.js (_toWorkflowId)",
    "Registrar.service.js (ID conflict resolution)",
    "blueprint.schema.json (module names)"
  ],
  dependencies: [
    "JavaScript",
    "PascalCase",
    "snake_case",
    "camelCase",
    "kebab-case",
    "all-lowercase",
    "var",
    "ts",
    "json"
  ],
  docs: "Auto-generated enriched SDOA manifest via static analysis"
};

"use strict";

/**
 * naming.js — SDOA Naming Rules
 *
 * Extracted from: SDOA-Whitepaper-Technical.txt Sections 5, 6, 8,
 * SDOA-Governance-Outline.txt Section 3, sdoav5 clarification.txt,
 * sdoa-linter.js (layer detection patterns), Router.service.js (_toWorkflowId),
 * Registrar.service.js (ID conflict resolution), blueprint.schema.json (module names)
 */

const NAMING_RULES = {

  // ─── Module ID Rules ─────────────────────────────────────────────────────
  MODULE_ID: {
    description: "Rules for the 'id' field in every SDOA manifest. IDs are the canonical identity of a module.",
    format:      "PascalCase + '.' + type-suffix",
    examples:    ["Button.prim", "Registry.service", "ProbationOfficer.workflow", "Workspace.feature"],
    rules: [
      "Must be unique across the entire system. No two modules may share an id.",
      "Format: Name.type — PascalCase name, dot, lowercase type suffix.",
      "Name part must be PascalCase (UpperCamelCase). Never snake_case, kebab-case, or all-lowercase.",
      "Type suffix must match the module's 'type' field shorthand (see TYPE_SUFFIXES below).",
      "Variant IDs follow the pattern ParentId.variant-descriptor — e.g., 'Workspace.feature.compact', 'Queue.service.legacy'."
    ]
  },

  TYPE_SUFFIXES: {
    description: "The conventional ID suffix for each module type",
    map: {
      primitive:   ".prim",
      feature:     ".feature",
      adapter:     ".adapter",
      service:     ".service",
      workflow:    ".workflow",
      repository:  ".repository",
      task:        ".task",
      engine:      ".engine",
      utility:     ".utility",
      component:   ".component",
      dashboard:   ".dashboard",
      validator:   ".validator"
    }
  },

  // ─── File Name Rules ──────────────────────────────────────────────────────
  FILE_NAMES: {
    description: "Naming conventions for source files of each module type",
    conventions: {
      primitive:      "PascalCase.prim.js — e.g., Button.prim.js, TabGroup.prim.js",
      primitive_css:  "PascalCase.prim.css — e.g., Button.prim.css, Modal.prim.css",
      feature:        "PascalCase.feature.js — e.g., UserSettings.feature.js, ChatWindow.feature.js",
      feature_css:    "PascalCase.feature.css (optional) — e.g., Dashboard.feature.css",
      adapter_js:     "PascalCase.adapter.js — e.g., AiBroker.adapter.js",
      adapter_ts:     "PascalCase.adapter.ts — e.g., LlmConnector.adapter.ts",
      service_js:     "PascalCase.service.js — e.g., Chronicle.service.js",
      service_ts:     "PascalCase.service.ts — e.g., Registry.service.ts",
      workflow_js:    "PascalCase.workflow.js — e.g., ProbationOfficer.workflow.js",
      workflow_ts:    "PascalCase.workflow.ts — e.g., TestCore.workflow.ts",
      repository_js:  "PascalCase.repository.js — e.g., Memory.repository.js",
      repository_ts:  "PascalCase.repository.ts",
      engine:         "(varies — engine folder name is PascalCase, e.g., MathSolver/)",
      tests:          "ModuleName.tests.json — e.g., MathSolver.tests.json"
    },
    rules: [
      "All source file names use PascalCase for the module name part.",
      "The type suffix is lowercase and dot-separated: .prim.js, .feature.js, .service.js, etc.",
      "TypeScript files use the same convention as JS files but with .ts extension.",
      "Test suites: ModuleName.tests.json, co-located with the module.",
      "CSS class names: sdoa-{primitive-name} — e.g., sdoa-button, sdoa-modal, sdoa-panel (always lowercase kebab-case)."
    ]
  },

  // ─── Workflow Routing Names ────────────────────────────────────────────────
  WORKFLOW_ROUTING_NAMES: {
    description: "The Router.service.js auto-discovery convention. Message type -> workflow ID.",
    rule:        "Incoming IPC message types are snake_case. Router._toWorkflowId() converts them to PascalCase workflow IDs.",
    algorithm:   "Split on '_', capitalize first letter of each word, join, append '.workflow'",
    examples: [
      { message_type: "fetch_users",          workflow_id: "FetchUsers.workflow" },
      { message_type: "send_message",         workflow_id: "SendMessage.workflow" },
      { message_type: "run_test",             workflow_id: "RunTest.workflow" },
      { message_type: "probation_officer",    workflow_id: "ProbationOfficer.workflow" },
      { message_type: "scaffold",             workflow_id: "Scaffold.workflow" }
    ],
    suffixes_tried: ["workflow", "service", "repository", "adapter"],
    rule_implication: "The name of your workflow file must match the PascalCase conversion of the IPC message type you want it to handle. Creating the file IS the registration."
  },

  // ─── Variant Naming Rules ──────────────────────────────────────────────────
  VARIANT_NAMES: {
    description: "Naming conventions for variant modules",
    id_format:    "ParentId.variant-descriptor — e.g., 'Workspace.feature.compact', 'Queue.service.legacy', 'ResponseFormatter.service.legacy'",
    folder_format: "variants/{variant-descriptor}/ — inside the parent sovereign's folder",
    manifest_field: "'variant_of': must be set to the parent module's canonical ID",
    examples: [
      {
        parent_id:    "ResponseFormatter.service",
        variant_id:   "ResponseFormatter.legacy",
        folder:       "substrate/services/variants/ResponseFormatter.legacy/",
        manifest:     "{ id: 'ResponseFormatter.legacy', type: 'service', version: '4.0.0', variant_of: 'ResponseFormatter.service' }"
      },
      {
        parent_id:    "sdoa-base",
        variant_id:   "sdoa-base.legacy",
        folder:       "environment/variants/sdoa-base.legacy/",
        manifest:     "{ id: 'sdoa-base.legacy', type: 'primitive', version: '3.0.0', variant_of: 'sdoa-base' }"
      }
    ]
  },

  // ─── CSS Class Naming Rules ───────────────────────────────────────────────
  CSS_CLASS_NAMES: {
    description: "Rules for CSS class names used by UI primitives",
    prefix:     "sdoa-",
    format:     "sdoa-{primitive-name} — always lowercase kebab-case",
    examples:   ["sdoa-button", "sdoa-modal", "sdoa-panel", "sdoa-tab-group", "sdoa-code-editor", "sdoa-empty-state"],
    rules: [
      "All SDOA primitive CSS classes use the 'sdoa-' prefix.",
      "PascalCase primitive names convert to kebab-case for CSS: TabGroup -> sdoa-tab-group, CodeEditor -> sdoa-code-editor.",
      "Never use bare class names (e.g., .button, .modal) without the sdoa- prefix — namespace collision risk."
    ]
  },

  // ─── Event Name Rules ─────────────────────────────────────────────────────
  EVENT_NAMES: {
    description: "Naming conventions for EventBus events",
    format:      "moduleName:eventDescription — lowercase:camelCase",
    examples: [
      "registry:moduleRegistered",
      "conductor:eventSuppressed",
      "scaffold:moduleGenerated",
      "mathsolver:transformComplete",
      "router:dispatch",
      "testrunner:progress"
    ],
    rules: [
      "Event names follow the pattern: sender:action (colon-separated namespace).",
      "Sender namespace is camelCase of the module name.",
      "Action part is camelCase describing the event.",
      "Events must be declared in the manifest's actions.events block.",
      "Accepted events must be declared in the manifest's actions.accepts block."
    ]
  },

  // ─── Prohibited Names ─────────────────────────────────────────────────────
  PROHIBITED_NAMES: {
    description: "Directory and module names that are prohibited in SDOA",
    prohibited_directories: [
      "/assets/",
      "/static/",
      "/deps/",
      "/resources/",
      "/misc/",
      "/global/"
    ],
    reason: "These names create undiscoverable dumping grounds that violate sovereignty. If you need one of these names, determine which sovereign owns the files and place them there instead."
  }
};

module.exports = { NAMING_RULES };
