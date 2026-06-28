
const MANIFEST = {
  id: "roleValidator.js",
  type: "module",
  layer: 4,
  runtime: "JavaScript",
  version: "1.0.0",
  operationalRole: "infrastructure",
  optimization: { priority: "stability" },
  capabilities: [
    "validateRole"
  ],
  dependencies: [],
  docs: "Validates whether a given role is part of a predefined set of roles."
};

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateRole = validateRole;
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
function validateRole(role) {
    return roles.has(role);
}
