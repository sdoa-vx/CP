// ──────────────────────────────────────────────────────────────────
// File:    ConfigValidator.service.js
// Version: 5.0.0
// Updated: 2026-06-17T00:00:00Z
// Changes: Relocated to canonical sdoavx/ structure (6.9-only file)
// ──────────────────────────────────────────────────────────────────
"use strict";

const path = require("path");
const fs   = require("fs");

class ConfigValidatorService {
  static MANIFEST = {
    id:              "ConfigValidator.service",
    type:            "service",
    layer:           3,
    runtime:         "NodeJS",
    version:         "5.0.1",
    last_modified:   "2026-07-13T00:00:00Z",
    operationalRole: "savant",
    requires:        ["Chronicle.service"],
    dependencies:    ["Chronicle.service"],
    capabilities:    ["config:validate", "config:validate-all", "config:get-defaults", "config:auto-repair"],
    dataFiles:       [],
    lifecycle:       ["init", "run", "dispose"],
    actions: {
      commands: {
        validate: {
          description: "Validate a config file by path. Returns { valid, errors, warnings, repaired }.",
          input:  { filePath: "string", autoRepair: "boolean?" },
          output: "object"
        },
        validateAll: {
          description: "Validate all known config files. Returns a summary of all results.",
          input:  { autoRepair: "boolean?" },
          output: "object[]"
        },
        getDefaults: {
          description: "Return the default values for a config file type.",
          input:  { configType: "string" },
          output: "object"
        }
      },
      events: {
        "config:validationFailed": { payload: { filePath: "string", errors: "string[]", repaired: "boolean" } },
        "config:repaired":         { payload: { filePath: "string", changesApplied: "string[]" } },
        "config:allValid":         { payload: { fileCount: "number" } },
        "app:sovereignStatus":     { payload: { status: "string", sovereignId: "string?", detail: "string?" } }
      },
      accepts: {},
      slots:   {}
    },
    docs: {
      description: "Settings schema guardian. Validates settings.json, models config, and policy files against built-in schemas on startup and on file change. Auto-repairs known corruption patterns.",
      author: "ProtoAI Core Architecture Group",
      sdoa:   "5.0.0"
    }
  };

  _registry  = null;
  _chronicle = null;

  _CONFIG_PATHS = {
    settings: [
      path.join(process.cwd(), "ui", "data", "settings.json"),
      "C:\\protoai\\data\\settings.json",
      path.join(process.cwd(), "data", "settings.json")
    ],
    models: [
      "C:\\protoai\\config\\models.json",
      path.join(process.cwd(), "config", "models.json")
    ],
    fallback: [
      "C:\\protoai\\config\\fallback.json",
      path.join(process.cwd(), "config", "fallback.json")
    ]
  };

  _SETTINGS_SCHEMA = {
    required: {
      apiKeys:  {},
      models:   { defaults: { default: null, coding: null }, fallbackList: [] },
      profiles: { defaultProfile: "default", fallbackProfile: null, userProfiles: {} },
      backend:  { timeoutMs: 30000, retryCount: 3, fallbackBehavior: "http" },
      advanced: { debugLogging: false }
    }
  };

  _MODELS_SCHEMA = { required: { entries: [] } };

  async init(registry) {
    this._registry  = registry;
    this._chronicle = registry.get("Chronicle.service");
  }

  async run() {
    const results = await this.validateAll({ autoRepair: true });
    const failed  = results.filter(r => !r.valid);
    for (const r of failed) {
      this._emit("config:validationFailed", { filePath: r.filePath, errors: r.errors, repaired: r.repaired });
    }
    if (!failed.length) this._emit("config:allValid", { fileCount: results.length });
    this._emit("app:sovereignStatus", { status: failed.length ? "warning" : "ready" });
    return results;
  }

  async dispose() {
    this._registry  = null;
    this._chronicle = null;
  }

  async validate({ filePath, autoRepair = false } = {}) {
    let raw;
    try { raw = fs.readFileSync(filePath, "utf8"); }
    catch { return { valid: false, filePath, errors: ["File not found"], warnings: [], repaired: false }; }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      const recovered = this._attemptJsonRecovery(raw);
      if (!recovered) return { valid: false, filePath, errors: ["JSON syntax error: " + err.message], warnings: [], repaired: false };
      parsed = recovered;
      if (autoRepair) {
        fs.writeFileSync(filePath, JSON.stringify(parsed, null, 2), "utf8");
        this._emit("config:repaired", { filePath, changesApplied: ["Recovered from JSON syntax error"] });
      }
    }

    const configType = this._detectConfigType(filePath);
    const schema     = configType === "settings" ? this._SETTINGS_SCHEMA
                     : configType === "models"   ? this._MODELS_SCHEMA
                     : null;

    if (!schema) return { valid: true, filePath, errors: [], warnings: [], repaired: false };
    return this._validateAgainstSchema(parsed, schema, filePath, autoRepair);
  }

  async validateAll({ autoRepair = false } = {}) {
    const results = [];
    for (const [, paths] of Object.entries(this._CONFIG_PATHS)) {
      for (const p of paths) {
        if (!fs.existsSync(p)) continue;
        results.push(await this.validate({ filePath: p, autoRepair }));
        break;
      }
    }
    return results;
  }

  getDefaults({ configType } = {}) {
    const map = { settings: this._SETTINGS_SCHEMA, models: this._MODELS_SCHEMA };
    return map[configType] ? { ...map[configType].required } : {};
  }

  _attemptJsonRecovery(raw) {
    try {
      let fixed = raw.replace(/,(\s*[}\]])/g, "$1");
      fixed = fixed.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
      if (!fixed.trim().startsWith("{")) fixed = "{" + fixed + "}";
      return JSON.parse(fixed);
    } catch { return null; }
  }

  _validateAgainstSchema(parsed, schema, filePath, autoRepair) {
    const errors = [], warnings = [], repairs = [];
    for (const [key, defaultVal] of Object.entries(schema.required)) {
      if (!(key in parsed)) {
        warnings.push(`Missing key "${key}" — will use default`);
        if (autoRepair) {
          parsed[key] = defaultVal;
          repairs.push(`Added missing key "${key}" with default value`);
        } else {
          errors.push(`Required key "${key}" is missing`);
        }
      }
    }
    const repaired = repairs.length > 0;
    if (repaired) {
      fs.writeFileSync(filePath, JSON.stringify(parsed, null, 2), "utf8");
      this._emit("config:repaired", { filePath, changesApplied: repairs });
    }
    return { valid: errors.length === 0, filePath, errors, warnings, repaired, repairedContent: repaired ? parsed : undefined };
  }

  _detectConfigType(filePath) {
    const lower = filePath.toLowerCase();
    if (lower.includes("settings")) return "settings";
    if (lower.includes("models"))   return "models";
    if (lower.includes("fallback")) return "fallback";
    return "unknown";
  }

  _getBus()             { return this._registry?.get?.("EventBus.service"); }
  _emit(event, payload) { try { this._getBus()?.emit?.(event, payload); } catch (_) {} }
}

module.exports = ConfigValidatorService;
