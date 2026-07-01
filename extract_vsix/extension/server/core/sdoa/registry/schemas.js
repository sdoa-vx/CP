"use strict";

/**
 * schemas.js — SDOA Schema Registry
 *
 * Extracted from: authorities/registrar/Registry.service.ts (SdoaManifest interface),
 * _variances/SDOAvX/sdoa-core/src/registry.ts (SdoaManifest),
 * substrate/services/ConfigValidator.service.js (settings schema),
 * SDOA-Whitepaper-Technical.txt Sections 4, 8
 */

const SCHEMA_REGISTRY = {

  // ─── Core Schemas ─────────────────────────────────────────────────────────
  MANIFEST_SCHEMA: {
    id:          "manifest.schema",
    file:        "sdoa-mcp/server/core/sdoa/manifests/manifest.schema.json",
    description: "JSON Schema (draft-07) for SDOA module manifests. Required fields: id, type, version, runtime, layer.",
    source:      "Synthesized from Registry.service.ts SdoaManifest interface, registry.ts, and sdoa-linter.js"
  },

  SDOA_MANIFEST_INTERFACE: {
    id:          "SdoaManifest",
    source:      "authorities/registrar/Registry.service.ts, _variances/SDOAvX/sdoa-core/src/registry.ts",
    description: "TypeScript interface defining the shape of an SDOA manifest object",
    fields: {
      id:              "string — required",
      type:            "string — required",
      version:         "string — required",
      runtime:         "string — required",
      layer:           "number — required",
      capabilities:    "string[] — optional",
      dependencies:    "string[] — optional",
      requires:        "string[] — optional",
      dataFiles:       "string[] — optional",
      lifecycle:       "string[] — optional",
      actions:         "{ commands, events, accepts, slots } — optional",
      backendDeps:     "array — optional",
      operationalRole: "string — optional",
      optimization:    "{ priority: string, assertionSuite: string } — optional",
      variant_of:      "string — optional",
      compliance:      "object — optional",
      docs:            "{ description, author, sdoa } — optional",
      last_modified:   "string — optional"
    }
  },

  // ─── Config Validator Schemas ─────────────────────────────────────────────
  CONFIG_VALIDATOR_SCHEMA: {
    id:          "ConfigValidator.schema",
    source:      "substrate/services/ConfigValidator.service.js",
    description: "Schema for application settings/config validation",
    config_paths: {
      settings:  "Path to application settings file",
      models:    "Path to AI model configuration",
      fallback:  "Fallback config path if primary is invalid"
    },
    auto_repair: "ConfigValidator._attemptJsonRecovery() tries to parse malformed JSON by stripping comments and trailing commas"
  },

  // ─── ResponseFormatter Schema ──────────────────────────────────────────────
  RESPONSE_FORMATTER_SCHEMA: {
    id:          "ResponseFormatter.schema",
    source:      "substrate/services/ResponseFormatter.service.js, _variances/SDOAvX/sdoa-core/src/response.ts",
    description: "The canonical shape of all SDOA responses",
    success_shape: "{ ok: true, data: any }",
    failure_shape: "{ ok: false, error: string, detail?: string }",
    methods: {
      ok:            "ok(data) → { ok: true, data }",
      fail:          "fail(error, detail?) → { ok: false, error, detail }",
      writeResponse: "writeResponse(res, data) → sends HTTP JSON response with data",
      writeError:    "writeError(res, error, code?) → sends HTTP error JSON response",
      writeSuccess:  "writeSuccess(res, data) → alias for writeResponse",
      writeEvent:    "writeEvent(res, event, payload) → sends SSE event"
    }
  },

  // ─── EventBus Schema ──────────────────────────────────────────────────────
  EVENTBUS_SCHEMA: {
    id:          "EventBus.schema",
    source:      "_variances/SDOAvX/sdoa-core/src/eventbus.ts",
    description: "EventBus API surface",
    methods: {
      on:      "on(event, handler) — Subscribe to a named event",
      off:     "off(event, handler) — Unsubscribe from a named event",
      once:    "once(event, handler) — Subscribe for one occurrence only",
      onAny:   "onAny(handler) — Subscribe to all events",
      offAny:  "offAny(handler) — Unsubscribe from all-events handler",
      emit:    "emit(event, payload) — Publish an event",
      command: "command(event, payload) — Publish a command (same as emit, semantic distinction)",
      bridge:  "bridge(events, targetBus) — Bridge events to another EventBus instance",
      getHistory: "getHistory(event?) — Get event history (for replay)"
    }
  },

  // ─── PolyglotBridge Schema ────────────────────────────────────────────────
  POLYGLOT_BRIDGE_SCHEMA: {
    id:          "PolyglotBridge.schema",
    source:      "substrate/services/PolyglotBridge.ts, _variances/SDOAvX/sdoa-core/src/polyglot.ts",
    description: "Cross-language subprocess bridge protocol",
    mechanism:   "Spawns a Python subprocess and communicates via stdin/stdout JSON messages",
    protocol: {
      request:  "{ id: string, method: string, params: any } → JSON line to stdin",
      response: "{ id: string, result?: any, error?: string } ← JSON line from stdout"
    }
  }
};

module.exports = { SCHEMA_REGISTRY };
