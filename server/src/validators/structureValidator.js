
const MANIFEST = {
  id: "structureValidator.js",
  type: "module",
  layer: 4,
  runtime: "JavaScript",
  version: "1.0.0",
  operationalRole: "infrastructure",
  optimization: { priority: "stability" },
  capabilities: [
    "validateLayer",
    "validateType",
    "validateRole"
  ],
  dependencies: [
    "./layerValidator",
    "./typeValidator",
    "./roleValidator"
  ],
  docs: "Auto-generated enriched SDOA manifest via static analysis"
};

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateStructure = validateStructure;
const layerValidator_1 = require("./layerValidator");
const typeValidator_1 = require("./typeValidator");
const roleValidator_1 = require("./roleValidator");
function validateStructure(payload) {
    const errors = [];
    if (!(0, layerValidator_1.validateLayer)(payload.sdoa.layer)) {
        errors.push("Invalid SDOA layer");
    }
    if (!(0, typeValidator_1.validateType)(payload.type)) {
        errors.push("Invalid SDOA type");
    }
    if (!(0, roleValidator_1.validateRole)(payload.sdoa.manifest.operationalRole)) {
        errors.push("Invalid operational role");
    }
    return {
        ok: errors.length === 0,
        errors,
    };
}
