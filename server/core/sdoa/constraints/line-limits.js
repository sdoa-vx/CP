
const MANIFEST = {
  id: "line-limits.js",
  type: "module",
  layer: 4,
  runtime: "JavaScript",
  version: "1.0.0",
  operationalRole: "infrastructure",
  optimization: { priority: "stability" },
  capabilities: [
    "LINTER_LIMITS_V4",
    "AMENDMENT_V4_1",
    "PROBATION_OFFICER_LIMITS",
    "EFFECTIVE_LIMITS",
    "RATIONALE"
  ],
  dependencies: [],
  docs: "Auto-generated enriched SDOA manifest via static analysis for line limit rules and guidelines"
};

"use strict";

/**
 * line-limits.js — SDOA Line Limit Rules
 *
 * Extracted from: sdoa-linter.js / linter.ts (LINE_LIMITS object),
 * SDOA-Whitepaper-Technical.txt Section 17 (v4.1 Amendment),
 * SDOA-Governance-Outline.txt Section 3.4,
 * ProbationOfficer.workflow.js (CONSTRAINTS.MAX_LINE_LIMITS)
 *
 * NOTE: The linter enforces v4.0 limits (Layer 1: 200, Layer 2: 150, Layer 3: 200).
 * The v4.1 Amendment raised the TARGET limits. The absolute hard ceiling is ~500 lines.
 * ProbationOfficer enforces v4.1 per-type limits on scaffolded modules.
 */

const LINE_LIMIT_RULES = {

  // ─── v4.0 Linter Limits (enforced by sdoa-linter.js) ─────────────────────
  // Source: sdoa-linter.js const LINE_LIMITS = { 1: 200, 2: 150, 3: 200 }
  LINTER_LIMITS_V4: {
    description:  "Line limits enforced by sdoa-linter.js / linter.ts at lint time (v4.0 values)",
    version:      "4.0",
    by_layer: {
      1: { limit: 200, note: "Layer 1 features" },
      2: { limit: 150, note: "Layer 2 primitives" },
      3: { limit: 200, note: "Layer 3 adapters, services, workflows, repositories, engines" }
    }
  },

  // ─── v4.1 Amendment Limits (target limits after amendment) ───────────────
  // Source: SDOA-Whitepaper-Technical.txt Section 17 (v4.1 Amendment)
  // SDOA-Historical-Timeline.txt (May/June 2026 amendments)
  AMENDMENT_V4_1: {
    description:  "v4.1 Amendment raised target line limits per module type",
    version:      "4.1",
    by_module_type: {
      primitive:    { target: 250, hard_ceiling: 500, note: "Layer 2 primitives — raised from 150 to 250" },
      feature:      { target: 350, hard_ceiling: 500, note: "Layer 1 features — raised from 200 to 350" },
      adapter:      { target: 350, hard_ceiling: 500, note: "Layer 3 adapters — raised from 200 to 350" },
      workflow:     { target: 400, hard_ceiling: 500, note: "Layer 3 workflows — raised from 200 to 400" },
      repository:   { target: 400, hard_ceiling: 500, note: "Layer 3 repositories — raised from 200 to 400" },
      service:      { target: 350, hard_ceiling: 500, note: "Layer 3 services — implied by amendment" },
      engine:       { target: 400, hard_ceiling: 500, note: "Layer 3 engines — implied by amendment" }
    },
    hard_ceiling: {
      value:  500,
      note:   "Absolute ceiling across ALL module types. No file may exceed ~500 lines.",
      rationale: "Large files indicate poor decomposition. If a module approaches 500 lines, split it into sub-sovereigns."
    }
  },

  // ─── ProbationOfficer Limits ──────────────────────────────────────────────
  // Source: ProbationOfficer.workflow.js CONSTRAINTS.MAX_LINE_LIMITS
  PROBATION_OFFICER_LIMITS: {
    description:  "Limits enforced by ProbationOfficer.workflow.js on AI-scaffolded modules before portfolio acceptance",
    note:         "ProbationOfficer uses tighter limits than the linter; these gates apply to newly generated code",
    by_module_type: {
      primitive:    150,
      feature:      200,
      adapter:      200,
      workflow:     200,
      repository:   200
    }
  },

  // ─── Combined Effective Limits ────────────────────────────────────────────
  EFFECTIVE_LIMITS: {
    description:  "Practical guidance: use v4.1 targets for newly written modules, v4.0 for existing",
    recommendation: [
      "For new modules: target v4.1 Amendment limits (250/350/400). Do not exceed the 500-line hard ceiling.",
      "For existing modules: the linter will fire at v4.0 limits (150/200). Refactor before limits are breached.",
      "ProbationOfficer enforces the stricter probation limits on AI-scaffolded output.",
      "If a module is approaching its limit, split domain concerns into separate sovereigns."
    ]
  },

  // ─── Rationale ───────────────────────────────────────────────────────────
  RATIONALE: {
    description: "Why line limits exist",
    reasons: [
      "Enforces the Single Responsibility Principle at the file level.",
      "Files over 250-500 lines are a signal that a module has grown beyond its defined sovereign scope.",
      "Smaller files are easier to review, test, and reason about.",
      "The SDOA architecture is designed to have many small, focused sovereigns, not few large ones.",
      "The line limit is a pressure valve that forces decomposition before complexity becomes unmanageable."
    ]
  }
};

module.exports = { LINE_LIMIT_RULES };
