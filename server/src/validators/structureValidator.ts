import { validateLayer } from "./layerValidator";
import { validateType } from "./typeValidator";
import { validateRole } from "./roleValidator";

export function validateStructure(payload: any) {
  const errors: string[] = [];

  if (!validateLayer(payload.sdoa.layer)) {
    errors.push("Invalid SDOA layer");
  }

  if (!validateType(payload.type)) {
    errors.push("Invalid SDOA type");
  }

  if (!validateRole(payload.sdoa.manifest.operationalRole)) {
    errors.push("Invalid operational role");
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}
