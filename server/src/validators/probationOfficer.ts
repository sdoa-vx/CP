import { enforceLayerBoundaries } from "./layerEnforcer";

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

  // Pre-gate: Mandatory Manifest Fields check
  if (!/\bMANIFEST\b/.test(content)) {
    return { ok: false, reason: "Missing mandatory MANIFEST declaration" };
  }
  if (!/["']?version["']?\s*[:=]/i.test(content)) {
    return { ok: false, reason: "Missing mandatory MANIFEST field: version" };
  }
  if (!/["']?docs["']?\s*[:=]/i.test(content)) {
    return { ok: false, reason: "Missing mandatory MANIFEST field: docs" };
  }

  // Pre-gate: Banned Globals & Malicious Payload Sandbox
  const banned = [
    /window\./, /document\./, /localStorage/, /sessionStorage/, /eval\(/,
    /process\.env/, /XMLHttpRequest/, /WebSocket/
  ];

  for (const rule of banned) {
    if (rule.test(content)) {
      return { ok: false, reason: `Prohibited pattern detected: ${rule}` };
    }
  }

  // Cross-Module Layer Enforcement
  const layerMatch = content.match(/["']?layer["']?\s*[:=]\s*(\d+)/i);
  if (layerMatch && layerMatch[1]) {
    const layer = parseInt(layerMatch[1], 10);
    const layerCheck = enforceLayerBoundaries(content, layer);
    if (!layerCheck.ok) return layerCheck;
  }

  return { ok: true };
}
