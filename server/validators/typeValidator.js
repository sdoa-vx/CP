"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateType = validateType;
const allowed = [
    "primitive",
    "feature",
    "adapter",
    "service",
    "workflow",
    "repository",
    "engine",
    "schema",
    "rule",
    "exemplar",
];
function validateType(type) {
    return allowed.includes(type);
}
