"use strict";

/**
 * inheritance.js — SDOA Manifest Inheritance and Variant Rules
 *
 * Extracted from: SDOA-Whitepaper-Technical.txt Sections 13, 14,
 * sdoav5 clarification.txt (variant placement rules),
 * substrate/services/variants/ResponseFormatter.legacy/manifest.json,
 * environment/variants/sdoa-base.legacy/manifest.json,
 * SDOA-Governance-Outline.txt Section 5
 */

const MANIFEST_INHERITANCE_RULES = {

  // ─── No Manifest Inheritance ──────────────────────────────────────────────
  NO_INHERITANCE: {
    statement: "SDOA does not have manifest inheritance. Variants do not inherit manifest fields from their parent.",
    rule:      "Every module — including variants — must declare a complete, valid SDOA v1.2 manifest. There is no 'inherits: parent' mechanism.",
    rationale: "Inheritance creates invisible couplings. A variant is a sovereign, and its contract is fully self-declared.",
    implication: "When creating a variant, copy the relevant fields from the parent and modify as needed. Do not reference the parent manifest."
  },

  // ─── variant_of Declaration ────────────────────────────────────────────────
  VARIANT_OF: {
    description: "The only 'inheritance-like' field: variant_of declares parentage",
    field:       "variant_of",
    type:        "string — ID of the parent module",
    required_for_variants: true,
    purpose:     "Declares which sovereign this is a variant of. Used by the Registrar to group variants when resolving functional identity conflicts.",
    not_a_reference: "'variant_of' is informational metadata. It does not cause any fields to be copied from the parent.",
    examples: [
      "\"variant_of\": \"ResponseFormatter.service\"",
      "\"variant_of\": \"sdoa-base\"",
      "\"variant_of\": \"Button.prim\""
    ]
  },

  // ─── Complete Manifest Requirement ────────────────────────────────────────
  COMPLETE_MANIFEST: {
    description: "Every variant must have a fully valid manifest with all v1.2 mandatory fields",
    mandatory_fields: ["id", "type", "version", "runtime", "capabilities", "dependencies", "docs", "last_modified"],
    plus_variant_field: "variant_of must also be set",
    examples: {
      ResponseFormatter_legacy: {
        id:           "ResponseFormatter.legacy",
        type:         "service",
        version:      "4.0.0",
        variant_of:   "ResponseFormatter.service",
        note:         "Full manifest — not just variant_of"
      },
      sdoa_base_legacy: {
        id:           "sdoa-base.legacy",
        type:         "primitive",
        version:      "3.0.0",
        variant_of:   "sdoa-base",
        note:         "Full manifest — not just variant_of"
      }
    }
  },

  // ─── Version Relationship ─────────────────────────────────────────────────
  VERSION_RELATIONSHIP: {
    description: "How variant versions relate to parent versions",
    rule:        "A variant's version is its own — typically the version it was forked from. It does not track the parent's current version.",
    example:     "If parent is at v5.0.0 but the variant implements v4.0.0 behavior, variant.version = '4.0.0'.",
    implication: "The Registrar can compare variant versions against the parent and against each other. The variant with the highest SemVer (or optimization priority) wins the champion slot."
  },

  // ─── Variant Placement (reinforcement) ───────────────────────────────────
  VARIANT_PLACEMENT: {
    description: "Where variants must be placed",
    rule:        "Variants live inside the parent sovereign's variants/ subdirectory",
    patterns: [
      "substrate/services/{ModuleName}/variants/{variant-descriptor}/",
      "ui/features/{ModuleName}/variants/{variant-descriptor}/",
      "ui/primitives/{ModuleName}/variants/{variant-descriptor}/",
      "environment/{module}/variants/{variant-descriptor}/"
    ],
    confirmed_examples: [
      "substrate/services/variants/ResponseFormatter.legacy/ (manifest.json)",
      "environment/variants/sdoa-base.legacy/ (manifest.json)"
    ],
    prohibited: [
      "evolution/legacy/ (while still active — legacy is a graveyard)",
      "Any top-level /variants/ directory outside of a parent sovereign's folder",
      "/experimental/, /misc/, /global/"
    ]
  },

  // ─── TypeScript Class Inheritance (different from manifest inheritance) ──
  CLASS_INHERITANCE: {
    description:  "TypeScript class inheritance from SdoaModule base classes is allowed and encouraged. This is different from manifest inheritance.",
    note:         "Class inheritance (extends Service, extends Adapter) is an implementation detail. The manifest is still fully declared on every module class.",
    base_classes: {
      JS:  ["SdoaModule", "Service", "Adapter", "Task", "Component"],
      TS:  ["SdoaModule", "Service", "Adapter", "Task", "Component", "Engine", "Primitive", "Feature"]
    },
    rule:         "The base class provides shared lifecycle methods (emit, bump_patch, etc.). The manifest must still be declared as a static property on the subclass — it is NOT inherited from the base class."
  }
};

module.exports = { MANIFEST_INHERITANCE_RULES };
