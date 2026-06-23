
export const MANIFEST = {
  id: "roleValidator.ts",
  type: "module",
  layer: 4,
  runtime: "TypeScript",
  version: "1.0.0",
  operationalRole: "infrastructure",
  optimization: { priority: "stability" },
  capabilities: [
    "validateRole"
  ],
  dependencies: [],
  docs: "Verifies if a given role exists in the predefined set of roles."
};


const roles = new Set([
  "registrar",
  "captain",
  "conductor",
  "coach",
  "probation-officer",
  "assembly-line",
  "triage",
  "savant",
]);

export function validateRole(role: string): boolean {
  return roles.has(role);
}
