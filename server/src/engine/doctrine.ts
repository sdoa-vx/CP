import * as fs from "node:fs";
import * as path from "node:path";

export const MANIFEST = {
  id: "doctrine.ts",
  type: "module",
  layer: 4,
  runtime: "TypeScript",
  version: "1.0.0",
  operationalRole: "infrastructure",
  optimization: { priority: "stability" },
  capabilities: [
    "SOVEREIGNTY_RULES",
    "MANIFEST_RULES",
    "getForbiddenStrings",
    "getMaxLineLimit",
    "getAiSystemPromptBlock"
  ],
  dependencies: [
    "node:fs",
    "node:path"
  ],
  docs: "Auto-generated enriched SDOA manifest via static analysis"
};

// We dynamically require the CJS rules from the core directory
const rulesPath = path.join(process.cwd(), "server", "core", "sdoa", "sovereignty", "rules.js");
const manifestRulesPath = path.join(process.cwd(), "server", "core", "sdoa", "manifests", "manifest.rules.js");

let _sovereigntyRules: any[] = [];
let _manifestRules: any = {};

try {
  if (fs.existsSync(rulesPath)) {
    const r = require(rulesPath);
    _sovereigntyRules = r.SOVEREIGNTY_RULES || [];
  }
  if (fs.existsSync(manifestRulesPath)) {
    const m = require(manifestRulesPath);
    _manifestRules = m.MANIFEST_RULES || m;
  }
} catch (e) {
  console.error("[Doctrine] Failed to load Compendium rules:", e);
}

export const SOVEREIGNTY_RULES = _sovereigntyRules;
export const MANIFEST_RULES = _manifestRules;

export function getForbiddenStrings(): string[] {
  return _manifestRules?.VALIDATION_LOGIC?.probation_officer_validation?.forbidden_strings || [
    "eval\\(", "window\\.", "global\\."
  ];
}

export function getMaxLineLimit(type: string): number {
  const limits = _manifestRules?.VALIDATION_LOGIC?.probation_officer_validation?.max_line_limits || {};
  return limits[type] || 200; // Default fallback to 200
}

export function getAiSystemPromptBlock(): string {
  if (!_sovereigntyRules.length) return "Adhere to standard SDOA architecture.";
  const rules = _sovereigntyRules.map((r: any) => `[${r.id}] (${r.sovereign}): ${r.description}`).join("\n");
  return `
=== SDOA COMPENDIUM DOCTRINE (MANDATORY EXECUTION BOUNDARIES) ===
You are strictly governed by the following 25 Sovereignty Rules. You must apply them mathematically to any code you process:

${rules}

FAILURE TO ADHERE TO THESE RULES IS AN ARCHITECTURAL VIOLATION.
================================================================
`;
}
