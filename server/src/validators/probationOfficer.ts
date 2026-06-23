
export const MANIFEST = {
  id: "probationOfficer.ts",
  type: "module",
  layer: 4,
  runtime: "TypeScript",
  version: "1.0.0",
  operationalRole: "infrastructure",
  optimization: { priority: "stability" },
  capabilities: [
    "runProbationOfficer"
  ],
  dependencies: [],
  docs: "Auto-generated enriched SDOA manifest via static analysis"
};


export function runProbationOfficer(payload: any) {
  const content = payload?.source?.content || "";

  if (content.split("\n").length > 500) {
    return { ok: false, reason: "Line count exceeds 500-line limit" };
  }

  const banned = [/window\./, /document\./, /localStorage/, /sessionStorage/, /eval\(/];

  for (const rule of banned) {
    if (rule.test(content)) {
      return { ok: false, reason: `Prohibited pattern detected: ${rule}` };
    }
  }

  return { ok: true };
}
