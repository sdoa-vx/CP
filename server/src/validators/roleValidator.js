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
