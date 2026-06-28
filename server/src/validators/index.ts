
export const MANIFEST = {
  id: "index.ts",
  type: "module",
  layer: 4,
  runtime: "TypeScript",
  version: "1.0.0",
  operationalRole: "infrastructure",
  optimization: { priority: "stability" },
  capabilities: [
    "*",
    "./layerValidator",
    "./typeValidator",
    "./roleValidator",
    "./probationOfficer",
    "./structureValidator"
  ],
  dependencies: [
    "*"
  ],
  docs: "Auto-generated enriched SDOA manifest via static analysis"
};


export * from "./layerValidator";
export * from "./typeValidator";
export * from "./roleValidator";
export * from "./probationOfficer";
export * from "./structureValidator";
