import { SdoaType } from "../../shared/types";

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
