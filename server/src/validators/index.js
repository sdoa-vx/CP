
const MANIFEST = {
  id: "index.js",
  type: "module",
  layer: 4,
  runtime: "JavaScript",
  version: "1.0.0",
  operationalRole: "infrastructure",
  optimization: { priority: "stability" },
  capabilities: [
    "./layerValidator",
    "./typeValidator",
    "./roleValidator",
    "./probationOfficer",
    "./structureValidator"
  ],
  dependencies: [
    "./layerValidator",
    "./typeValidator",
    "./roleValidator",
    "./probationOfficer",
    "./structureValidator"
  ],
  docs: "Auto-generated enriched SDOA manifest via static analysis"
};

"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
__exportStar(require("./layerValidator"), exports);
__exportStar(require("./typeValidator"), exports);
__exportStar(require("./roleValidator"), exports);
__exportStar(require("./probationOfficer"), exports);
__exportStar(require("./structureValidator"), exports);
