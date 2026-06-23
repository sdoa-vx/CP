import { getForbiddenStrings, getMaxLineLimit } from "../engine/doctrine";

export const MANIFEST = {
  id: "runComplianceSuite.ts",
  type: "module",
  layer: 4,
  runtime: "TypeScript",
  version: "1.0.0",
  operationalRole: "infrastructure",
  optimization: { priority: "stability" },
  capabilities: [
    "runComplianceSuite"
  ],
  dependencies: [
    "../engine/doctrine"
  ],
  docs: "Auto-generated enriched SDOA manifest via static analysis"
};

export async function runComplianceSuite(path: string, proposal: any) {
  const errors: string[] = [];
  const content = proposal.source?.content || "";
  const proposalType = proposal.type || "primitive";

  // 1. Dynamic Line limits from Doctrine
  const lines = content.split("\n").length;
  const maxLimit = getMaxLineLimit(proposalType);
  if (lines > maxLimit) {
    errors.push(`Hard limit exceeded: File contains ${lines} lines (ceiling is ${maxLimit} for ${proposalType}). Please use the Decomposer.`);
  }

  // 2. Manifest check
  if (!content.includes("MANIFEST")) {
    errors.push(`Constitutional violation: Missing MANIFEST block.`);
  }

  // 3. Dynamic Prohibited globals from Doctrine
  const forbidden = getForbiddenStrings();
  for (const str of forbidden) {
    // Basic string inclusion check, stripping regex escapes for simple matching
    const cleanStr = str.replace(/\\/g, "");
    if (content.includes(cleanStr)) {
      errors.push(`Anti-pattern detected: Direct usage of '${cleanStr}' is prohibited by the Compendium.`);
    }
  }

  // 4. Prohibited paths
  if (path.includes("/assets/") || path.includes("/misc/") || path.includes("/static/")) {
    errors.push(`Placement violation: Directory is prohibited by canonical root rules.`);
  }

  return { ok: errors.length === 0, errors };
}
