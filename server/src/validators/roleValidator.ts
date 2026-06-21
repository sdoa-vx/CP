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
