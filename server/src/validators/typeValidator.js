
const MANIFEST = {
  id: "typeValidator.js",
  type: "module",
  layer: 4,
  runtime: "JavaScript",
  version: "1.0.0",
  operationalRole: "infrastructure",
  optimization: { priority: "stability" },
  capabilities: [
    "primitive",
    "feature",
    "adapter",
    "service"
  ],
  dependencies: [],
  docs: "Auto-generated enriched SDOA manifest via static analysis"
};

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
