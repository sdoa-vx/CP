import { SdoaType } from "../shared/types";

export const MANIFEST = {
  id: "typeValidator.ts",
  type: "module",
  layer: 4,
  runtime: "TypeScript",
  version: "1.0.0",
  operationalRole: "infrastructure",
  optimization: { priority: "stability" },
  capabilities: [
    "validateType"
  ],
  dependencies: [
    "../shared/types"
  ],
  docs: "Auto-generated enriched SDOA manifest via static analysis"
};



const allowed: SdoaType[] = [
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

export function validateType(type: string): boolean {
  return allowed.includes(type as SdoaType);
}
