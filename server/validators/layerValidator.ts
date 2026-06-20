import { SdoaLayer } from "../../shared/types";

export function validateLayer(layer: SdoaLayer): boolean {
  return layer === 1 || layer === 2 || layer === 3;
}
