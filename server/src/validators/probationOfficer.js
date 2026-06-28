
const MANIFEST = {
  id: "probationOfficer.js",
  type: "module",
  layer: 4,
  runtime: "JavaScript",
  version: "1.0.0",
  operationalRole: "infrastructure",
  optimization: { priority: "stability" },
  capabilities: [
    "JavaScript"
  ],
  dependencies: [],
  docs: "Auto-generated enriched SDOA manifest via static analysis"
};

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runProbationOfficer = runProbationOfficer;
function runProbationOfficer(payload) {
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
