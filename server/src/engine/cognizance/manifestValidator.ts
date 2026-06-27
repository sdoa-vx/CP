// ------------------------------------------------------------------
// File:    manifestValidator.ts
// Version: 1.1.0
// Updated: 2026-06-25T00:00:00.000Z
// Changes: Multi-dialect MANIFEST recognition. extractManifest now reads
//          `export const MANIFEST = {..} as const`, `static MANIFEST = {..}`
//          (JS classes), `const MANIFEST = {..}`, and Python `MANIFEST = {..}`
//          dicts, via balanced-brace extraction + comment stripping + a
//          scalar-field fallback. Previously only the TS `export const ...
//          as const` form was recognized, so wild .js/.py modules read as
//          "MANIFEST missing".
// SDOA compliance is required
// ------------------------------------------------------------------

export const MANIFEST = {
  id: "engine.cognizance.manifestValidator",
  type: "engine",
  layer: "substrate",
  runtime: "node",
  version: "1.0.0",
  action_surface: [],
  commands: [],
  events: [],
  accepts: [],
  slots: [],
  dependencies: [],
  sovereign_lineage: "engine.cognizance.manifestValidator",
  variant_of: null,
  docs: {
    description: "Validates SDOA MANIFEST blocks inside source files.",
    last_modified: "2026-06-23T15:41:00.000Z"
  }
} as const;

import type { SdoaManifest } from "../sdoaFileApi";

export function validateManifest(source: string, issues: string[], suggestions: string[]): SdoaManifest {
  const manifest = extractManifest(source);

  if (!manifest) {
    issues.push("MANIFEST export missing or unreadable");
    suggestions.push("Add `export const MANIFEST = { ... } as const;` with full v5.1 fields.");
    return {
      id: "UNKNOWN",
      type: "primitive",
      layer: "application",
      runtime: "node",
      version: "0.0.0",
      action_surface: [],
      commands: [],
      events: [],
      accepts: [],
      slots: [],
      dependencies: [],
      sovereign_lineage: "UNKNOWN",
      variant_of: null,
      docs: {
        description: "Missing MANIFEST",
        last_modified: new Date().toISOString()
      }
    };
  }

  const required = ["id", "type", "layer", "runtime", "version"] as const;
  for (const key of required) {
    if (!manifest[key] || typeof manifest[key] !== "string") {
      issues.push(`MANIFEST missing or invalid field: ${key}`);
      suggestions.push(`Ensure MANIFEST.${key} is a non-empty string.`);
    }
  }

  if (!manifest.docs?.description) {
    issues.push("MANIFEST.docs.description is missing");
    suggestions.push("Add a clear description to MANIFEST.docs.description.");
  }

  if (!manifest.docs?.last_modified) {
    issues.push("MANIFEST.docs.last_modified is missing");
    suggestions.push("Set MANIFEST.docs.last_modified to an ISO-8601 timestamp.");
  }

  if (!manifest.sovereign_lineage) {
    issues.push("MANIFEST.sovereign_lineage is missing");
    suggestions.push("Set sovereign_lineage to the canonical module lineage ID.");
  }

  if (!Array.isArray(manifest.dependencies)) {
    issues.push("MANIFEST.dependencies must be an array");
    suggestions.push("Initialize MANIFEST.dependencies as an array, even if empty.");
  }

  return manifest;
}

// --- Multi-dialect manifest recognition --------------------------------------
//
// SDOA modules declare their MANIFEST in several dialects depending on language
// and era:
//   export const MANIFEST = { ... } as const;   (current TS modules)
//   static MANIFEST = { ... };                   (JS class members)
//   const MANIFEST = { ... };
//   MANIFEST = { ... }                            (Python dicts / bare assignment)
//   self.MANIFEST = { ... } / Foo.MANIFEST = { ... }
// We anchor on the `MANIFEST {:=} {` token, take the balanced-brace block, then
// parse it tolerantly (JSON-ish first, scalar-field fallback second).

function extractManifest(source: string): SdoaManifest | null {
  const block = findManifestBlock(source);
  if (!block) return null;

  const parsed = tryParseObjectLiteral(block);
  if (parsed && parsed.id) return coerceManifest(parsed);

  // Fallback: Python dicts, deeply nested objects, or comment-laden blocks the
  // JSON path can't handle — pull the identifying scalars directly.
  const scalar = scalarExtract(block);
  if (scalar.id) return coerceManifest(scalar);

  return null;
}

// Locate a MANIFEST object literal across dialects and return the balanced
// `{ ... }` slice (string-literal aware so braces inside strings don't miscount).
function findManifestBlock(source: string): string | null {
  const anchor = /(?:^|[\s.;({])MANIFEST(?:_JSON)?\s*[:=]\s*\{/m;
  const m = anchor.exec(source);
  if (!m) return null;
  const braceStart = source.indexOf("{", m.index);
  if (braceStart === -1) return null;
  return balancedSlice(source, braceStart);
}

function balancedSlice(s: string, start: number): string | null {
  let depth = 0;
  let inStr: string | null = null;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (c === "\\") { i++; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { inStr = c; continue; }
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) return s.slice(start, i + 1); }
  }
  return null;
}

function stripComments(block: string): string {
  return block
    .replace(/\/\*[\s\S]*?\*\//g, "")   // /* block */
    .replace(/\/\/[^\n]*/g, "")          // // line
    .replace(/(^|\s)#[^\n]*/g, "$1");    // python #
}

function tryParseObjectLiteral(block: string): any | null {
  try {
    const j = stripComments(block)
      .replace(/`/g, '"')
      .replace(/'/g, '"')
      .replace(/\bTrue\b/g, "true")
      .replace(/\bFalse\b/g, "false")
      .replace(/\b(None|undefined)\b/g, "null")
      .replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":') // quote bare keys
      .replace(/,\s*([}\]])/g, "$1");                          // trailing commas
    return JSON.parse(j);
  } catch {
    return null;
  }
}

function scalarExtract(block: string): Partial<SdoaManifest> {
  const clean = stripComments(block);
  const str = (key: string): string | undefined => {
    const m = clean.match(new RegExp(key + "\\s*[:=]\\s*[\"'`]([^\"'`]+)[\"'`]"));
    return m ? m[1] : undefined;
  };
  const num = (key: string): string | undefined => {
    const m = clean.match(new RegExp(key + "\\s*[:=]\\s*([0-9]+)"));
    return m ? m[1] : undefined;
  };
  return {
    id: str("id"),
    type: str("type") as SdoaManifest["type"],
    layer: str("layer") ?? num("layer"),
    runtime: str("runtime"),
    version: str("version"),
  };
}

// Normalize whatever we parsed into a well-typed SdoaManifest. Scalars are
// coerced to strings (the wild manifests use e.g. numeric `layer: 3`), and the
// v5 `requires` field is accepted as an alias for `dependencies`.
function coerceManifest(o: any): SdoaManifest {
  const s = (v: any) => (v === undefined || v === null ? undefined : String(v));
  const arr = (v: any) => (Array.isArray(v) ? v.map(String) : []);
  return {
    id: s(o.id) ?? "UNKNOWN",
    type: (o.type as SdoaManifest["type"]) ?? "primitive",
    layer: s(o.layer) ?? "application",
    runtime: s(o.runtime) ?? "unknown",
    version: s(o.version) ?? "0.0.0",
    action_surface: arr(o.action_surface),
    commands: arr(o.commands),
    events: arr(o.events),
    accepts: arr(o.accepts),
    slots: arr(o.slots),
    dependencies: Array.isArray(o.dependencies) ? o.dependencies.map(String) : arr(o.requires),
    sovereign_lineage: s(o.sovereign_lineage) ?? s(o.id),
    variant_of: o.variant_of ?? o.variantOf ?? null,
    docs: {
      description:
        (o.docs && typeof o.docs === "object" ? o.docs.description : undefined) ??
        (typeof o.docs === "string" ? o.docs : undefined) ??
        "",
      last_modified:
        (o.docs && typeof o.docs === "object" ? o.docs.last_modified : undefined) ??
        o.last_modified ??
        "",
    },
  };
}
