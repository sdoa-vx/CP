"use strict";

/**
 * json.js — SDOA JSON File Placement Rules
 *
 * Extracted from: SDOA-Whitepaper-Technical.txt Sections 8, 9.3,
 * SDOA-Governance-Outline.txt Sections 7.2, 7.3,
 * sdoav5 clarification.txt (JSON file placement rules),
 * substrate/services/variants/ResponseFormatter.legacy/manifest.json,
 * environment/variants/sdoa-base.legacy/manifest.json,
 * blueprint.schema.json (authority config JSON examples)
 */

const JSON_CATEGORY_RULES = {

  // ─── Guiding Principle ────────────────────────────────────────────────────
  PRINCIPLE: {
    statement: "JSON is not 'global data.' It is configuration, schema, or engine data — and sovereignty applies. JSON files live with the sovereign that consumes them.",
    anti_pattern: "Creating a /global/, /data/, /config/, /resources/, /assets/, or /static/ directory for JSON files is a sovereignty violation."
  },

  // ─── JSON Categories ──────────────────────────────────────────────────────
  CATEGORIES: {

    MANIFEST: {
      description:  "SDOA module manifests (standalone JSON form)",
      pattern:      "manifest.json",
      placement:    "Co-located with the module's source file, inside the module's folder",
      examples: [
        "substrate/services/variants/ResponseFormatter.legacy/manifest.json",
        "environment/variants/sdoa-base.legacy/manifest.json",
        "ui/primitives/Button/manifest.json"
      ],
      rules: [
        "A standalone manifest.json is used when the manifest cannot be embedded in the source file (e.g., compiled languages, legacy files).",
        "Must be co-located in the same folder as the module file it describes.",
        "Must contain all SDOA v1.2 mandatory fields (id, type, version, runtime, capabilities, dependencies, docs, last_modified).",
        "Variant manifests must also include 'variant_of' field pointing to the parent module ID."
      ]
    },

    AUTHORITY_CONFIG: {
      description:  "Configuration files owned by authority modules",
      pattern:      "{name}.jsn (or {name}.json)",
      placement:    "Inside the authority's folder under authorities/",
      examples: [
        "authorities/registrar/registry.jsn",
        "authorities/router/routes.jsn",
        "authorities/conductor/circuit-config.jsn"
      ],
      rules: [
        "Authority-owned configuration goes under the specific authority's folder.",
        "Use .jsn extension to distinguish SDOA config from generic JSON files.",
        "Config is owned by the authority module — other modules read it through the authority's API, not directly."
      ]
    },

    MODULE_SCHEMA: {
      description:  "Schema definitions and data models owned by a specific module",
      pattern:      "{Name}.schema.json or {name}-schema.json",
      placement:    "Co-located with the consuming module, inside its folder",
      examples: [
        "ui/features/Workspace/workspace.schema.json",
        "substrate/services/ConfigValidator.service.schema.json",
        "evolution/engines/TextClassifier/v2/classifier-schema.json"
      ],
      rules: [
        "Schema JSON lives with the module that owns and validates it.",
        "If a UI feature uses a schema to drive rendering, the schema is a UI sovereign — put it in the feature's folder.",
        "If a substrate service validates against a schema, the schema is part of that service's sovereign.",
        "Never put schema files in a shared /schemas/ or /models/ directory."
      ]
    },

    ENGINE_DATA: {
      description:  "Data files consumed at runtime by evolution-zone engine modules",
      pattern:      "{name}.json or domain-specific filenames",
      placement:    "Inside the engine's versioned folder: evolution/engines/{EngineName}/v{version}/",
      examples: [
        "evolution/engines/TextClassifier/v2/metadata.json",
        "evolution/engines/WasmSolver/v3/constants.json",
        "evolution/engines/MathSolver/v1/precision-tables.json"
      ],
      rules: [
        "Engine data is part of the engine's sovereign — it lives in the engine folder.",
        "Never place engine data files in /assets/, /static/, /data/, or /resources/.",
        "If the data changes between engine versions, version the folder (v1/, v2/, etc.)."
      ]
    },

    TEST_SUITE: {
      description:  "Assertion suites referenced by manifest.optimization.assertionSuite",
      pattern:      "{ModuleName}.tests.json",
      placement:    "Co-located with the module",
      examples: [
        "substrate/workflows/TestCore.workflow.tests.json",
        "evolution/engines/MathSolver/MathSolver.tests.json"
      ],
      rules: [
        "The test suite file path must match the value declared in manifest.optimization.assertionSuite.",
        "Test suite JSON lives with the module it tests.",
        "Empty string in assertionSuite is valid for modules without a test suite yet."
      ]
    },

    BLUEPRINT: {
      description:  "The system-wide blueprint/schema file describing all registered modules and their connections",
      pattern:      "blueprint.schema.json",
      placement:    "Project root (one per project)",
      rules: [
        "The blueprint is a registry snapshot — it lists all module IDs, their commands, events, and connections.",
        "It is generated by the Registrar, not manually edited.",
        "Contains: id, commands, events, accepts, requires arrays for each module."
      ]
    }
  },

  // ─── Prohibited JSON Locations ────────────────────────────────────────────
  PROHIBITED_LOCATIONS: [
    "/global/",
    "/data/",
    "/config/",
    "/assets/",
    "/static/",
    "/deps/",
    "/resources/",
    "/misc/"
  ],

  // ─── File Extension Convention ────────────────────────────────────────────
  EXTENSION_CONVENTION: {
    ".json":  "Standard JSON files — schemas, manifests, test suites, engine data",
    ".jsn":   "SDOA authority configuration files — distinguishes from generic JSON. Example: registry.jsn, routes.jsn",
    note:     "Both extensions are valid JSON. The .jsn extension is a SDOA convention to signal 'this is an SDOA system config file owned by an authority.'"
  }
};

module.exports = { JSON_CATEGORY_RULES };
