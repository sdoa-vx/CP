"use strict";

/**
 * index.js — SDOA Rulebook Root Barrel Export
 *
 * Synthesized from: SDOA-Whitepaper-Technical.txt, SDOA-Governance-Outline.txt,
 * SDOA-Historical-Timeline.txt, all source files in C:\SDOAvX
 *
 * This is the single entry point for the SDOA canonical rulebook.
 * All rules, schemas, registries, and constraints are accessible from here.
 */

// ─── Manifests ────────────────────────────────────────────────────────────────
const manifestRules    = require("./manifests/manifest.rules");
const manifestSchema   = require("./manifests/manifest.schema.json");
const manifestExample  = require("./manifests/manifest.example.json");

// ─── Sovereignty ──────────────────────────────────────────────────────────────
const boundaries       = require("./sovereignty/boundaries");
const sovereigntyRules = require("./sovereignty/rules");
const violations       = require("./sovereignty/violations");

// ─── Constraints ─────────────────────────────────────────────────────────────
const naming           = require("./constraints/naming");
const placement        = require("./constraints/placement");
const layer            = require("./constraints/layer");
const lifecycle        = require("./constraints/lifecycle");
const lineLimits       = require("./constraints/line-limits");
const json             = require("./constraints/json");

// ─── Resolver ────────────────────────────────────────────────────────────────
const identity         = require("./resolver/identity");
const routing          = require("./resolver/routing");
const dependencies     = require("./resolver/dependencies");
const inheritance      = require("./resolver/inheritance");

// ─── Registry ────────────────────────────────────────────────────────────────
const primitives       = require("./registry/primitives");
const workflows        = require("./registry/workflows");
const schemas          = require("./registry/schemas");
const engines          = require("./registry/engines");
const moduleTypes      = require("./registry/module-types");

// ─── Version ─────────────────────────────────────────────────────────────────
const version          = require("./version/sdoa.version");

// ─── Export ───────────────────────────────────────────────────────────────────
module.exports = {

  // Manifests
  MANIFEST_RULES:          manifestRules.MANIFEST_RULES,
  REQUIRED_FIELDS:         manifestRules.REQUIRED_FIELDS,
  V1_2_MANDATORY_FIELDS:   manifestRules.V1_2_MANDATORY_FIELDS,
  OPTIONAL_FIELDS:         manifestRules.OPTIONAL_FIELDS,
  LIFECYCLE_FIELDS:        manifestRules.LIFECYCLE_FIELDS,
  DEPENDENCY_FIELDS:       manifestRules.DEPENDENCY_FIELDS,
  DATA_FILE_FIELDS:        manifestRules.DATA_FILE_FIELDS,
  VERSIONING_RULES:        manifestRules.VERSIONING_RULES,
  VALIDATION_LOGIC:        manifestRules.VALIDATION_LOGIC,
  MANIFEST_SCHEMA:         manifestSchema,
  MANIFEST_EXAMPLE:        manifestExample,

  // Sovereignty
  SOVEREIGNTY_BOUNDARIES:  boundaries.SOVEREIGNTY_BOUNDARIES,
  PROHIBITED_DIRECTORIES:  boundaries.PROHIBITED_DIRECTORIES,
  CROSS_SOVEREIGN_RULES:   boundaries.CROSS_SOVEREIGN_COMMUNICATION_RULES,
  SOVEREIGNTY_RULES:       sovereigntyRules.SOVEREIGNTY_RULES,
  SOVEREIGNTY_VIOLATIONS:  violations.SOVEREIGNTY_VIOLATIONS,

  // Constraints
  NAMING_RULES:            naming.NAMING_RULES,
  PLACEMENT_RULES:         placement.PLACEMENT_RULES,
  LAYER_RULES:             layer.LAYER_RULES,
  LIFECYCLE_RULES:         lifecycle.LIFECYCLE_RULES,
  LINE_LIMIT_RULES:        lineLimits.LINE_LIMIT_RULES,
  JSON_CATEGORY_RULES:     json.JSON_CATEGORY_RULES,

  // Resolver
  MODULE_IDENTITY_RULES:   identity.MODULE_IDENTITY_RULES,
  ROUTING_RULES:           routing.ROUTING_RULES,
  DEPENDENCY_RESOLUTION:   dependencies.DEPENDENCY_RESOLUTION_RULES,
  MANIFEST_INHERITANCE:    inheritance.MANIFEST_INHERITANCE_RULES,

  // Registry
  PRIMITIVE_REGISTRY:      primitives.PRIMITIVE_REGISTRY,
  PRIMITIVE_RULES:         primitives.PRIMITIVE_RULES,
  WORKFLOW_REGISTRY:       workflows.WORKFLOW_REGISTRY,
  WORKFLOW_RULES:          workflows.WORKFLOW_RULES,
  SCHEMA_REGISTRY:         schemas.SCHEMA_REGISTRY,
  ENGINE_REGISTRY:         engines.ENGINE_REGISTRY,
  ENGINE_RULES:            engines.ENGINE_RULES,
  OPERATIONAL_ROLES:       engines.OPERATIONAL_ROLES,
  MODULE_TYPE_DEFINITIONS: moduleTypes.MODULE_TYPE_DEFINITIONS,

  // Version
  SDOA_VERSION:            version.SDOA_VERSION,
  SDOA_NAME:               version.SDOA_NAME,
  SDOA_NAME_NOTE:          version.SDOA_NAME_NOTE,
  VERSION_HISTORY:         version.VERSION_HISTORY,
  VERSION_RULES:           version.VERSION_RULES,
  COMPATIBILITY_MATRIX:    version.COMPATIBILITY_MATRIX
};
