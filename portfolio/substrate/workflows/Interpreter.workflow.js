// ──────────────────────────────────────────────────────────────────
// File:    Interpreter.workflow.js
// Version: 5.0.0
// Updated: 2026-06-17T00:00:00Z
// Changes: Relocated to canonical sdoavx/ structure; FIXED broken require path
//          for ResponseFormatter (was "../ResponseFormatter.service", now
//          "../services/ResponseFormatter.service")
// ──────────────────────────────────────────────────────────────────
// Interpreter.workflow.js — SDOA v5.0 Workflow (NodeJS)
// Validated by: ProbationOfficer.workflow.rs
//
// Change log:
//   5.0.0 — Initial implementation. Natural language → SDOA command dispatcher.
//            Pulls the full registry surface from Oracle.service, constructs a
//            structured LLM prompt, parses the resolution, validates the resolved
//            command against the live manifest surface, then dispatches via Router.
//
//            SAFETY CONTRACT: The manifest surface is the only command space the
//            LLM may resolve into. Any moduleId or commandId not present in the
//            current registry surface is rejected before dispatch — the architecture
//            is the guardrail, not the LLM.

"use strict";

const ResponseFormatter = require("../services/ResponseFormatter.service");

class InterpreterWorkflow {
  static MANIFEST = {
    // ── Identity ──────────────────────────────
    id:              "Interpreter.workflow",
    type:            "workflow",
    layer:           3,
    runtime:         "NodeJS",
    version:         "5.0.1",
    last_modified:   "2026-07-13T00:00:00Z",
    operationalRole: "savant",
    capabilities: ["interpreter:resolve", "interpreter:dispatch"],

    // ── Dependencies ──────────────────────────
    requires:  [
      "Oracle.service",
      "Router.service",
      "Chronicle.service",
      "ResponseFormatter.service"
    ],
    dependencies: ["Oracle.service", "Router.service", "Chronicle.service", "ResponseFormatter.service"],
    dataFiles: [],

    // ── Lifecycle ─────────────────────────────
    lifecycle: ["init", "run", "dispose"],

    // ── Action Surface ────────────────────────
    actions: {
      commands: {
        run: {
          description: "Interpret a natural language instruction and dispatch the resolved SDOA command. Returns the dispatch result.",
          input: {
            instruction:  "string",    // e.g. "fetch all users created this week"
            context:      "object?",   // optional caller context merged into params
            dryRun:       "boolean?",  // if true, resolve but do not dispatch
            sessionId:    "string?"    // for conversation continuity
          },
          output: "object"
          // { resolvedModule, resolvedCommand, resolvedParams, result, confidence, durationMs }
        },
        resolveOnly: {
          description: "Resolve a natural language instruction to a command without dispatching. Useful for UI previews before execution.",
          input:  { instruction: "string", context: "object?" },
          output: "object"
          // { resolvedModule, resolvedCommand, resolvedParams, confidence }
        }
      },
      events: {
        "interpreter:resolved": {
          payload: {
            instruction:     "string",
            resolvedModule:  "string",
            resolvedCommand: "string",
            resolvedParams:  "object",
            confidence:      "string",
            durationMs:      "number"
          }
        },
        "interpreter:dispatched": {
          payload: { resolvedModule: "string", resolvedCommand: "string", durationMs: "number" }
        },
        "interpreter:failed": {
          payload: { instruction: "string", reason: "string" }
        },
        "interpreter:rejected": {
          payload: {
            instruction:     "string",
            resolvedModule:  "string?",
            resolvedCommand: "string?",
            reason:          "string"
          }
        }
      },
      accepts: {},
      slots:   {}
    },

    // ── Documentation ─────────────────────────
    docs: {
      description: "Natural language → SDOA command dispatcher. Queries Oracle for the full registry surface, builds a structured prompt that describes every available module, command, and input schema, then asks an LLM to resolve the instruction to a specific dispatch target. The resolved command is validated against the live manifest before dispatch — any module or command not in the registry is rejected. Hallucinations cannot reach the Router.",
      author: "ProtoAI Core Architecture Group",
      sdoa:   "5.0.0"
    }
  };

  // ── Private State ─────────────────────────────────────────────
  _oracle    = null;
  _router    = null;
  _chronicle = null;
  _llm       = null;   // AI provider — resolved from registry at init
  _registry  = null;

  // ── Lifecycle ──────────────────────────────────────────────────

  async init(registry) {
    this._registry  = registry;
    this._oracle    = registry.get("Oracle.service");
    this._router    = registry.get("Router.service");
    this._chronicle = registry.get("Chronicle.service");

    // LLM provider is optional at init — resolved lazily on first run
    // so Interpreter boots even if the AI provider registers after startup
    this._llm = registry.get?.("AiProvider.adapter") ?? null;
  }

  async run(payload) {
    const {
      instruction,
      context  = {},
      dryRun   = false,
      sessionId = null
    } = payload ?? {};

    if (!instruction?.trim()) {
      return ResponseFormatter.fail("Interpreter: `instruction` is required.");
    }

    const t0 = Date.now();

    // ── 1. Build Oracle surface ──────────────
    const surface = this._oracle?.dumpSurface({ layerFilter: null }) ?? [];
    if (surface.length === 0) {
      this._emit("interpreter:failed", { instruction, reason: "Oracle surface is empty — registry may not be initialized." });
      return ResponseFormatter.fail("Interpreter: Oracle surface is empty.");
    }

    // ── 2. Resolve via LLM ───────────────────
    let resolution;
    try {
      resolution = await this._resolve(instruction, surface, context, sessionId);
    } catch (err) {
      this._emit("interpreter:failed", { instruction, reason: err.message });
      return ResponseFormatter.fail(`Interpreter: LLM resolution failed — ${err.message}`);
    }

    const { resolvedModule, resolvedCommand, resolvedParams, confidence, raw } = resolution;

    // ── 3. Validate against live surface ────────────────────────
    // This is the safety contract: the LLM is only allowed to resolve
    // into commands that are declared in the current registry manifest.
    const validationError = this._validate(resolvedModule, resolvedCommand, resolvedParams, surface);

    if (validationError) {
      this._emit("interpreter:rejected", {
        instruction,
        resolvedModule,
        resolvedCommand,
        reason: validationError
      });
      this._chronicle?.record({
        type:    "interpreter:rejected",
        source:  "Interpreter.workflow",
        payload: { instruction, resolvedModule, resolvedCommand, reason: validationError }
      });
      return ResponseFormatter.fail(`Interpreter: Rejected — ${validationError}`);
    }

    const durationResolve = Date.now() - t0;

    this._emit("interpreter:resolved", {
      instruction, resolvedModule, resolvedCommand,
      resolvedParams, confidence, durationMs: durationResolve
    });

    // ── 4. Dry-run exit ──────────────────────
    if (dryRun) {
      return ResponseFormatter.ok({
        resolvedModule,
        resolvedCommand,
        resolvedParams,
        confidence,
        durationMs: durationResolve,
        dispatched: false,
        result:     null
      });
    }

    // ── 5. Dispatch through Router ───────────
    let result;
    try {
      const msg = {
        type:    this._toSnakeCase(`${resolvedModule.replace(/\.\w+$/, "")}_${resolvedCommand}`),
        payload: resolvedParams
      };
      result = await this._router.dispatchMessage(msg);
    } catch (err) {
      this._emit("interpreter:failed", { instruction, reason: `Dispatch error: ${err.message}` });
      return ResponseFormatter.fail(`Interpreter: Dispatch failed — ${err.message}`);
    }

    const durationMs = Date.now() - t0;

    this._emit("interpreter:dispatched", { resolvedModule, resolvedCommand, durationMs });

    this._chronicle?.record({
      type:    "interpreter:dispatched",
      source:  "Interpreter.workflow",
      payload: { instruction, resolvedModule, resolvedCommand, resolvedParams, confidence, durationMs }
    });

    return ResponseFormatter.ok({
      resolvedModule,
      resolvedCommand,
      resolvedParams,
      confidence,
      durationMs,
      dispatched: true,
      result:     result?.data ?? result
    });
  }

  // resolveOnly — resolve without dispatching
  async resolveOnly(payload) {
    return this.run({ ...payload, dryRun: true });
  }

  // ── Resolution Engine ──────────────────────────────────────────

  /**
   * _resolve(instruction, surface, context, sessionId)
   *
   * Constructs a structured prompt from the Oracle surface and sends it
   * to the registered LLM provider. Parses the response JSON.
   *
   * Expected LLM response (JSON):
   * {
   *   "moduleId":   "FetchUsers.workflow",
   *   "commandId":  "run",
   *   "params":     { "filter": { "createdAfter": "2026-05-25" } },
   *   "confidence": "high" | "medium" | "low",
   *   "reasoning":  "..."
   * }
   */
  async _resolve(instruction, surface, context, sessionId) {
    const prompt = this._buildPrompt(instruction, surface, context);

    // Resolve LLM provider lazily — may have registered after init
    if (!this._llm) {
      this._llm = this._registry?.get?.("AiProvider.adapter") ?? null;
    }

    let raw;
    if (this._llm?.complete) {
      raw = await this._llm.complete({
        system:    SYSTEM_PROMPT,
        prompt,
        sessionId,
        format:    "json"
      });
    } else {
      // Fallback: heuristic keyword matching when no LLM is wired
      raw = this._heuristicResolve(instruction, surface);
    }

    return this._parseResolution(raw, surface);
  }

  /**
   * _buildPrompt(instruction, surface, context)
   *
   * Produces a compact, structured surface listing. Groups commands by module.
   * Keeps the prompt tight to minimize token cost.
   */
  _buildPrompt(instruction, surface, context) {
    // Group surface entries into modules → commands only
    const byModule = new Map();
    for (const entry of surface) {
      if (entry.surfaceType !== "command") continue;
      if (!byModule.has(entry.moduleId)) byModule.set(entry.moduleId, []);
      byModule.get(entry.moduleId).push(entry);
    }

    const moduleLines = [];
    for (const [moduleId, commands] of byModule) {
      const cmdLines = commands.map(c => {
        const inputs = Object.entries(c.schema?.input ?? {})
          .map(([k, t]) => `${k}: ${t}`)
          .join(", ");
        return `    • ${c.name}(${inputs}) — ${c.description}`;
      }).join("\n");
      moduleLines.push(`MODULE: ${moduleId}\n${cmdLines}`);
    }

    const contextBlock = Object.keys(context ?? {}).length > 0
      ? `\nCALLER CONTEXT:\n${JSON.stringify(context, null, 2)}\n`
      : "";

    return [
      "INSTRUCTION:",
      `"${instruction}"`,
      contextBlock,
      "",
      "AVAILABLE COMMANDS:",
      moduleLines.join("\n\n"),
      "",
      'Respond with a single JSON object: { "moduleId", "commandId", "params", "confidence", "reasoning" }',
      "Only use modules and commands listed above. If no match exists, set confidence to \"none\" and omit moduleId/commandId."
    ].join("\n");
  }

  /**
   * _heuristicResolve(instruction, surface)
   *
   * Keyword-scoring fallback when no LLM provider is registered.
   * Scores each command by word overlap with the instruction.
   * Returns a synthetic resolution object matching the LLM schema.
   */
  _heuristicResolve(instruction, surface) {
    const words = instruction.toLowerCase().split(/\W+/).filter(Boolean);
    let bestScore = 0, bestEntry = null;

    for (const entry of surface) {
      if (entry.surfaceType !== "command") continue;
      const target = `${entry.moduleId} ${entry.name} ${entry.description}`.toLowerCase();
      const score  = words.reduce((acc, w) => acc + (target.includes(w) ? 1 : 0), 0);
      if (score > bestScore) { bestScore = score; bestEntry = entry; }
    }

    if (!bestEntry || bestScore === 0) {
      return JSON.stringify({ confidence: "none", reasoning: "No keyword overlap found." });
    }

    return JSON.stringify({
      moduleId:   bestEntry.moduleId,
      commandId:  bestEntry.name,
      params:     {},
      confidence: bestScore >= 3 ? "medium" : "low",
      reasoning:  `Heuristic match — score ${bestScore}`
    });
  }

  /**
   * _parseResolution(raw, surface)
   * Extracts and normalises the JSON resolution from the LLM response.
   */
  _parseResolution(raw, surface) {
    let parsed;
    try {
      // LLM may wrap JSON in markdown fences — strip them
      const cleaned = (typeof raw === "string" ? raw : JSON.stringify(raw))
        .replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error("LLM response was not valid JSON.");
    }

    return {
      resolvedModule:  parsed.moduleId   ?? null,
      resolvedCommand: parsed.commandId  ?? null,
      resolvedParams:  parsed.params     ?? {},
      confidence:      parsed.confidence ?? "low",
      raw:             parsed
    };
  }

  // ── Validation ─────────────────────────────────────────────────

  /**
   * _validate(moduleId, commandId, params, surface)
   *
   * Returns an error string if the resolution is invalid, null if safe.
   * Checks:
   *   1. moduleId is non-null and present in the surface
   *   2. commandId is non-null and present on that module
   *   3. Required params (those without trailing ?) are present
   */
  _validate(moduleId, commandId, params, surface) {
    if (!moduleId)  return "LLM returned no moduleId — cannot dispatch.";
    if (!commandId) return "LLM returned no commandId — cannot dispatch.";

    const entry = surface.find(
      e => e.surfaceType === "command" && e.moduleId === moduleId && e.name === commandId
    );

    if (!entry) {
      return `"${moduleId} › ${commandId}" is not registered in the live surface — dispatch blocked.`;
    }

    // Check required params
    const inputSchema = entry.schema?.input ?? {};
    for (const [key, type] of Object.entries(inputSchema)) {
      const isOptional = key.endsWith("?") || String(type).endsWith("?");
      const cleanKey   = key.replace("?", "");
      if (!isOptional && !(cleanKey in (params ?? {}))) {
        return `Required param "${cleanKey}" is missing for ${moduleId} › ${commandId}.`;
      }
    }

    return null;
  }

  // ── Helpers ────────────────────────────────────────────────────

  _toSnakeCase(str) {
    return str
      .replace(/\.([A-Z])/g, "_$1")
      .replace(/([A-Z])/g, c => "_" + c.toLowerCase())
      .replace(/^_/, "")
      .replace(/__+/g, "_")
      .toLowerCase();
  }

  _emit(eventName, payload) {
    try {
      const bus = this._registry?.get?.("EventBus.service");
      bus?.emit?.(eventName, payload);
    } catch (_) {}
  }

  async dispose() {
    this._oracle    = null;
    this._router    = null;
    this._chronicle = null;
    this._llm       = null;
  }
}

// ── System Prompt ──────────────────────────────────────────────
const SYSTEM_PROMPT = `You are the SDOA Interpreter — a command resolution engine for a Self-Describing Object Architecture system.

Your job is to map a natural language instruction to exactly one registered SDOA command.

Rules:
1. You MUST only resolve to moduleId and commandId values that appear in the AVAILABLE COMMANDS list.
2. If no command is a reasonable match, set confidence to "none" and omit moduleId and commandId.
3. Infer params from the instruction where possible. Mark uncertain values as null.
4. Respond with ONLY a valid JSON object — no explanation outside the JSON.
5. Never invent module names. The manifest surface is the only valid command space.

Confidence levels:
  "high"   — Instruction maps clearly to one command with all params resolvable.
  "medium" — Reasonable match but params are partially inferred.
  "low"    — Weak match; human review recommended before dispatch.
  "none"   — No suitable command found.`;

module.exports = InterpreterWorkflow;
