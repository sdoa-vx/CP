
const MANIFEST = {
  id: "identity.js",
  type: "module",
  layer: 4,
  runtime: "JavaScript",
  version: "1.0.0",
  operationalRole: "infrastructure",
  optimization: { priority: "stability" },
  capabilities: [
    "register",
    "validateManifest",
    "arbitrateRosterEvolution",
    "register",
    "compareSemVer",
    "probationOfficer",
    "resolveOptimizationTie"
  ],
  dependencies: [
    "@stdlib/sdoa-types",
    "@stdlib/typescript-registry"
  ],
  docs: "SDOA Module Identity Resolution Rules"
};

"use strict";

/**
 * identity.js — SDOA Module Identity Resolution Rules
 *
 * Extracted from: authorities/registrar/Registry.service.ts (validateManifest, register),
 * authorities/registrar/Registrar.service.js (arbitrateRosterEvolution, compareSemVer),
 * SDOA-Whitepaper-Technical.txt Sections 5, 13, 14,
 * SDOA-Governance-Outline.txt Sections 3, 5
 */

const MODULE_IDENTITY_RULES = {

  // ─── Canonical Identity ───────────────────────────────────────────────────
  CANONICAL_IDENTITY: {
    description:   "The canonical identity of a module is its 'id' field. This is the system-wide unique identifier.",
    format:        "PascalCaseName.typeSuffix — e.g., 'Button.prim', 'Registrar.service', 'ProbationOfficer.workflow'",
    uniqueness:    "No two modules in the registry may share the same id. Attempting to register a duplicate id throws a SDOA Validation Error.",
    resolution:    "When two modules claim the same functional identity (same id), the Registrar's arbitrateRosterEvolution() function resolves the conflict using SemVer scoring and optimization priority."
  },

  // ─── Identity Validation Pipeline ────────────────────────────────────────
  VALIDATION_PIPELINE: {
    description: "Steps performed by Registry.service.ts validateManifest() before accepting a module",
    steps: [
      { step: 1, check: "manifest is not null or undefined",           error: "SDOA Validation Error: manifest missing" },
      { step: 2, check: "manifest.id is present and non-empty",        error: "SDOA Validation Error: id field missing" },
      { step: 3, check: "manifest.type is present and non-empty",      error: "SDOA Validation Error: type field missing" },
      { step: 4, check: "manifest.version is present and non-empty",   error: "SDOA Validation Error: version field missing" },
      { step: 5, check: "manifest.runtime is present and non-empty",   error: "SDOA Validation Error: runtime field missing" },
      { step: 6, check: "manifest.layer is present and non-empty",     error: "SDOA Validation Error: layer field missing" },
      { step: 7, check: "manifest.id is not already in registry",      error: "SDOA Duplicate ID Error: {id} already registered" }
    ],
    post_validation: "After passing all steps, the module is added to the registry map keyed by manifest.id. All get() calls on the registry are proxied for telemetry."
  },

  // ─── SemVer Comparison ────────────────────────────────────────────────────
  SEMVER_COMPARISON: {
    description:   "How the Registrar compares module versions to resolve identity conflicts (arbitrateRosterEvolution)",
    algorithm:     "compareSemVer(a, b) — Returns positive if a > b, negative if a < b, 0 if equal",
    steps: [
      "Strip pre-release suffix (e.g., '-rc1') from both versions",
      "Split on '.' to get [major, minor, patch] arrays",
      "Compare major first: if not equal, return difference",
      "Compare minor second: if not equal, return difference",
      "Compare patch last: if not equal, return difference",
      "If all three are equal, return 0 (tie — proceed to optimization tie-break)"
    ],
    tie_break: {
      description: "When SemVer scores are equal, resolveOptimizationTie() is called",
      priority_order: ["speed", "safety", "readability", "memory-footprint"],
      rule:           "The module with the higher-priority optimization wins. Speed > Safety > Readability > Memory-footprint.",
      final_tie:      "If optimization priority is also identical, the incumbent (already-registered) module wins."
    }
  },

  // ─── Two-Tier Ingestion Pipeline ──────────────────────────────────────────
  TWO_TIER_PIPELINE: {
    description:   "All new modules pass through ProbationOfficer before portfolio acceptance (Registrar.service.js)",
    tiers: [
      {
        tier:        1,
        name:        "ProbationOfficer",
        description: "Static analysis gatekeeper. Validates manifest presence, line counts, and forbidden patterns.",
        passes:      "If ProbationOfficer approves, module moves to Tier 2.",
        fails:       "If ProbationOfficer rejects, module is refused. It is never added to the portfolio."
      },
      {
        tier:        2,
        name:        "Portfolio Acceptance",
        description: "Module is written to /portfolio directory and registered with the Registry.",
        passes:      "Module is now 'active' in the registry and eligible to serve requests.",
        arbitration: "If a module with the same id already exists, arbitrateRosterEvolution() compares them and selects the champion."
      }
    ]
  },

  // ─── Variant Identity ─────────────────────────────────────────────────────
  VARIANT_IDENTITY: {
    description:   "Rules for the identity of variant modules",
    id_format:     "ParentId.variant-descriptor — e.g., 'ResponseFormatter.service.legacy', 'Button.prim.compact'",
    required_field: "'variant_of' must be set to the parent module's canonical id",
    independence:  "Variants are sovereign modules with their own full SDOA v1.2 manifest. They are NOT subclasses or partial overrides.",
    registration:  "Variants are registered as independent entries in the registry with their own unique id.",
    examples: [
      {
        id:         "ResponseFormatter.legacy",
        type:       "service",
        version:    "4.0.0",
        variant_of: "ResponseFormatter.service",
        path:       "substrate/services/variants/ResponseFormatter.legacy/manifest.json"
      },
      {
        id:         "sdoa-base.legacy",
        type:       "primitive",
        version:    "3.0.0",
        variant_of: "sdoa-base",
        path:       "environment/variants/sdoa-base.legacy/manifest.json"
      }
    ]
  },

  // ─── Functional Identity Paths ────────────────────────────────────────────
  FUNCTIONAL_IDENTITY_PATHS: {
    description:   "When two modules claim the same functional identity path (same type serving the same role), the Registrar arbitrates which is the 'champion'",
    rule:          "Functional identity is determined by the combination of (type, operationalRole, capabilities). Two modules with the same combination are competitors.",
    resolution:    "The Registrar's arbitrateRosterEvolution() selects the champion using SemVer + optimization priority scoring.",
    note:          "This is different from ID conflicts (same id) — functional identity conflicts are allowed and expected as the system evolves. The Registrar handles them gracefully."
  }
};

module.exports = { MODULE_IDENTITY_RULES };
