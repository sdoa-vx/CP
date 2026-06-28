// ──────────────────────────────────────────────────────────────────
// File:    Prism.service.js
// Version: 5.0.0
// Updated: 2026-06-17T00:00:00Z
// Changes: Relocated to canonical sdoavx/ structure
// ──────────────────────────────────────────────────────────────────
// Last modified: 2026-06-01 00:00 UTC
// Prism.service.js — SDOA v5.0 Service (Universal)
// Validated by: ProbationOfficer.workflow.rs
//
// Change log:
//   5.0.0 — Initial implementation. Declarative schema transformer.
//            Modules declare a .map.json file describing how an incoming
//            data shape maps to a target schema. Prism reads the map and
//            transforms — no hand-written transformation code in adapters.
//            Supports dot-notation paths, type coercion, default values,
//            array mapping, computed fields via expression templates,
//            and conditional field inclusion.

"use strict";

class PrismService {
  static MANIFEST = {
    // ── Identity ──────────────────────────────
    id:              "Prism.service",
    type:            "service",
    layer:           3,
    runtime:         "Universal",
    version:         "5.0.0",
    operationalRole: "savant",

    // ── Dependencies ──────────────────────────
    requires:  [],
    dataFiles: [],

    // ── Lifecycle ─────────────────────────────
    lifecycle: ["init", "run", "dispose"],

    // ── Action Surface ────────────────────────
    actions: {
      commands: {
        transform: {
          description: "Transform a data object using a named or inline map. Returns the mapped output.",
          input: {
            data:    "object",   // Source data to transform
            mapId:   "string?",  // ID of a pre-loaded map
            map:     "object?",  // Inline map definition (alternative to mapId)
            strict:  "boolean?"  // If true, throw on missing required source fields (default: false)
          },
          output: "object"
        },
        transformArray: {
          description: "Transform every item in an array using a named or inline map.",
          input: {
            data:   "object[]",
            mapId:  "string?",
            map:    "object?",
            strict: "boolean?"
          },
          output: "object[]"
        },
        loadMap: {
          description: "Register a named map definition for reuse. Validates the map schema before storing.",
          input: {
            mapId: "string",
            map:   "object"
          },
          output: "void"
        },
        unloadMap: {
          description: "Remove a named map from the registry.",
          input:  { mapId: "string" },
          output: "void"
        },
        validateMap: {
          description: "Validate a map definition without registering it. Returns errors if any.",
          input:  { map: "object" },
          output: "object"  // { valid: boolean, errors: string[] }
        },
        listMaps: {
          description: "Return all registered map IDs and their metadata.",
          input:  {},
          output: "object[]"
        },
        inspect: {
          description: "Dry-run a transform — returns the resolved field plan without executing it. Useful for debugging map files.",
          input: {
            data:  "object",
            mapId: "string?",
            map:   "object?"
          },
          output: "object[]"  // [{ destField, srcPath, resolvedValue, coercedType, included }]
        }
      },
      events: {
        "prism:transformed": {
          payload: { mapId: "string?", fieldCount: "number", durationMs: "number" }
        },
        "prism:mapLoaded":   { payload: { mapId: "string" } },
        "prism:mapUnloaded": { payload: { mapId: "string" } }
      },
      accepts: {},
      slots:   {}
    },

    docs: {
      description: "Declarative schema transformer. Modules declare a .map.json file describing how an incoming data shape maps to a target schema. Prism reads the map and transforms — no hand-written transformation code in adapters. Supports dot-notation paths, type coercion, defaults, array mapping, computed fields via template strings, and conditional inclusion. Perfectly aligned with the SDOA principle: data lives outside code.",
      author: "ProtoAI Core Architecture Group",
      sdoa:   "5.0.0"
    }
  };

  // ── Private State ─────────────────────────────────────────────
  _maps     = new Map();   // mapId → PrismMap
  _registry = null;

  // ── Lifecycle ──────────────────────────────────────────────────

  async init(registry) {
    this._registry = registry;
  }

  async run() {
    return { status: "ready", loadedMaps: this._maps.size };
  }

  async dispose() {
    this._maps.clear();
  }

  // ── Public Commands ────────────────────────────────────────────

  /**
   * transform({ data, mapId?, map?, strict? }) → object
   *
   * Applies a map to a single data object.
   * Map resolution order: mapId → inline map → error.
   */
  transform({ data, mapId, map: inlineMap, strict = false } = {}) {
    const t0      = Date.now();
    const mapDef  = this._resolveMap(mapId, inlineMap);
    const result  = this._applyMap(data ?? {}, mapDef, strict);
    const ms      = Date.now() - t0;

    this._emit("prism:transformed", {
      mapId:      mapId ?? "(inline)",
      fieldCount: Object.keys(result).length,
      durationMs: ms
    });

    return result;
  }

  /**
   * transformArray({ data, mapId?, map?, strict? }) → object[]
   */
  transformArray({ data, mapId, map: inlineMap, strict = false } = {}) {
    if (!Array.isArray(data)) throw new Error("Prism.transformArray: `data` must be an array.");
    const mapDef = this._resolveMap(mapId, inlineMap);
    return data.map(item => this._applyMap(item, mapDef, strict));
  }

  /**
   * loadMap({ mapId, map }) → void
   */
  loadMap({ mapId, map } = {}) {
    if (!mapId?.trim()) throw new Error("Prism.loadMap: `mapId` is required.");
    const { valid, errors } = this._validateMapDef(map);
    if (!valid) throw new Error(`Prism.loadMap: Invalid map — ${errors.join("; ")}`);
    this._maps.set(mapId, map);
    this._emit("prism:mapLoaded", { mapId });
  }

  /**
   * unloadMap({ mapId }) → void
   */
  unloadMap({ mapId } = {}) {
    this._maps.delete(mapId);
    this._emit("prism:mapUnloaded", { mapId });
  }

  /**
   * validateMap({ map }) → { valid, errors }
   */
  validateMap({ map } = {}) {
    return this._validateMapDef(map);
  }

  /**
   * listMaps() → object[]
   */
  listMaps() {
    return [...this._maps.entries()].map(([mapId, def]) => ({
      mapId,
      from:       def.from ?? null,
      to:         def.to   ?? null,
      fieldCount: Array.isArray(def.fields) ? def.fields.length : 0,
      description: def.description ?? ""
    }));
  }

  /**
   * inspect({ data, mapId?, map? }) → object[]
   * Dry-run — returns the field plan without writing the output.
   */
  inspect({ data, mapId, map: inlineMap } = {}) {
    const mapDef = this._resolveMap(mapId, inlineMap);
    const plan   = [];

    for (const fieldDef of mapDef.fields ?? []) {
      const { dest, src, type, default: defVal, when, template } = fieldDef;
      const srcVal  = src       ? this._getPath(data ?? {}, src)    : undefined;
      const included = when     ? this._evalCondition(data ?? {}, when) : true;
      const resolved = template ? this._evalTemplate(data ?? {}, template)
                     : srcVal !== undefined ? srcVal : defVal;
      const coerced  = type && resolved !== undefined ? this._coerce(resolved, type) : resolved;

      plan.push({ destField: dest, srcPath: src ?? null, resolvedValue: coerced, coercedType: type ?? "any", included });
    }

    return plan;
  }

  // ── Core Transform Engine ──────────────────────────────────────

  /**
   * _applyMap(data, mapDef, strict) → object
   *
   * MapDef shape:
   * {
   *   "from":        "api.user",          // metadata — not used at runtime
   *   "to":          "store.currentUser", // metadata
   *   "description": "...",
   *   "fields": [
   *     {
   *       "dest":     "id",               // destination key (dot-notation supported)
   *       "src":      "user_id",          // source path (dot-notation)
   *       "type":     "string",           // coerce to: string|number|boolean|array|object
   *       "default":  null,               // value if src resolves to undefined
   *       "required": true,               // throw in strict mode if src missing
   *       "when":     "$.active === true",// conditional — skip field if falsy
   *       "template": "{{first}} {{last}}" // computed from source fields; overrides src
   *     }
   *   ]
   * }
   */
  _applyMap(data, mapDef, strict) {
    const output = {};

    for (const fieldDef of mapDef.fields ?? []) {
      const { dest, src, type, default: defVal, required, when, template } = fieldDef;

      if (!dest) continue;

      // Conditional inclusion
      if (when && !this._evalCondition(data, when)) continue;

      // Resolve value
      let value;
      if (template) {
        value = this._evalTemplate(data, template);
      } else if (src) {
        value = this._getPath(data, src);
      }

      // Required check (strict mode)
      if (strict && required && value === undefined) {
        throw new Error(`Prism: Required source field "${src}" is missing.`);
      }

      // Apply default
      if (value === undefined) value = defVal;

      // Skip if still undefined and no default
      if (value === undefined) continue;

      // Type coercion
      if (type) value = this._coerce(value, type);

      // Write to destination (dot-notation path)
      this._setPath(output, dest, value);
    }

    // Carry-through: pass any unmapped fields if map declares passthrough: true
    if (mapDef.passthrough) {
      const mappedSrcs = new Set((mapDef.fields ?? []).map(f => f.src).filter(Boolean));
      for (const [key, val] of Object.entries(data)) {
        if (!mappedSrcs.has(key) && !(key in output)) {
          output[key] = val;
        }
      }
    }

    return output;
  }

  // ── Path Utilities ─────────────────────────────────────────────

  /**
   * _getPath(obj, path) — resolve dot-notation path e.g. "address.city"
   * Supports bracket notation for arrays: "items[0].name"
   */
  _getPath(obj, path) {
    if (!path) return obj;
    return path
      .replace(/\[(\d+)\]/g, ".$1")
      .split(".")
      .reduce((acc, key) => (acc != null ? acc[key] : undefined), obj);
  }

  /**
   * _setPath(obj, path, value) — write value at dot-notation path
   */
  _setPath(obj, path, value) {
    const keys = path.replace(/\[(\d+)\]/g, ".$1").split(".");
    let cur = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (cur[k] == null || typeof cur[k] !== "object") cur[k] = {};
      cur = cur[k];
    }
    cur[keys[keys.length - 1]] = value;
  }

  // ── Type Coercion ──────────────────────────────────────────────

  _coerce(value, type) {
    try {
      switch (type) {
        case "string":  return String(value);
        case "number":  return Number(value);
        case "boolean": return Boolean(value);
        case "array":   return Array.isArray(value) ? value : [value];
        case "object":  return (typeof value === "object" && value !== null) ? value
                             : JSON.parse(String(value));
        case "date":    return new Date(value).toISOString();
        default:        return value;
      }
    } catch {
      return value; // coercion failure is non-fatal — return original
    }
  }

  // ── Template Evaluation ────────────────────────────────────────

  /**
   * _evalTemplate(data, template)
   * Simple {{field}} interpolation. Supports dot-notation inside braces.
   * Example: "{{first_name}} {{last_name}}" → "Jane Smith"
   */
  _evalTemplate(data, template) {
    return template.replace(/\{\{([^}]+)\}\}/g, (_, path) => {
      const val = this._getPath(data, path.trim());
      return val != null ? String(val) : "";
    });
  }

  // ── Condition Evaluation ───────────────────────────────────────

  /**
   * _evalCondition(data, when)
   * Evaluates a simple condition expression. Supports:
   *   "$.fieldName"              — truthy check
   *   "$.field === value"        — equality (string/number/boolean)
   *   "$.field !== value"        — inequality
   *   "$.field > value"          — numeric comparison
   *   "$.field < value"
   * $ refers to the root data object.
   */
  _evalCondition(data, when) {
    try {
      // Replace $.path expressions with resolved values
      const resolved = when.replace(/\$\.([a-zA-Z0-9_.[\]]+)/g, (_, path) => {
        const val = this._getPath(data, path);
        if (val === undefined || val === null) return "undefined";
        if (typeof val === "string") return JSON.stringify(val);
        return String(val);
      });

      // Safe evaluation of simple comparisons only
      // Allowed: ===, !==, >, <, >=, <=, &&, ||, !
      if (/[^a-zA-Z0-9\s"'._=!<>&|()null undefined true false]/.test(resolved)) {
        return false; // Reject unsafe expressions
      }

      // eslint-disable-next-line no-new-func
      return Boolean(new Function(`"use strict"; return (${resolved})`)());
    } catch {
      return false;
    }
  }

  // ── Map Validation ─────────────────────────────────────────────

  _validateMapDef(map) {
    const errors = [];
    if (!map || typeof map !== "object") { errors.push("Map must be an object."); return { valid: false, errors }; }
    if (!Array.isArray(map.fields))      errors.push("Map must have a `fields` array.");
    else {
      map.fields.forEach((f, i) => {
        if (!f.dest) errors.push(`Field [${i}]: missing required "dest" key.`);
        if (!f.src && !f.template && f.default === undefined) {
          errors.push(`Field [${i}] "${f.dest}": must have "src", "template", or "default".`);
        }
        if (f.type && !["string","number","boolean","array","object","date"].includes(f.type)) {
          errors.push(`Field [${i}] "${f.dest}": unknown type "${f.type}".`);
        }
      });
    }
    return { valid: errors.length === 0, errors };
  }

  // ── Map Resolution ─────────────────────────────────────────────

  _resolveMap(mapId, inlineMap) {
    if (mapId) {
      const found = this._maps.get(mapId);
      if (!found) throw new Error(`Prism: No map registered with id "${mapId}".`);
      return found;
    }
    if (inlineMap) {
      const { valid, errors } = this._validateMapDef(inlineMap);
      if (!valid) throw new Error(`Prism: Invalid inline map — ${errors.join("; ")}`);
      return inlineMap;
    }
    throw new Error("Prism: Either `mapId` or `map` must be provided.");
  }

  // ── EventBus ──────────────────────────────────────────────────

  _emit(eventName, payload) {
    try {
      const bus = this._registry?.get?.("EventBus.service")
               ?? (typeof window !== "undefined" ? window.EventBus : null);
      bus?.emit?.(eventName, payload);
    } catch (_) {}
  }
}

module.exports = PrismService;
