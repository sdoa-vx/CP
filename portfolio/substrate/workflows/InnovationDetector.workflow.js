// ──────────────────────────────────────────────────────────────────
// File:    InnovationDetector.workflow.js
// Version: 5.4.0
// Updated: 2026-06-27T00:00:00Z
// Changes: Initial v5.4 implementation. Detects repeating patterns
//          across the portfolio that should become new SDOA modules.
//          Sleeve-aware: scores boundary-safe suggestions, flags when
//          a candidate should be a sleeve rather than a plain adapter.
// ──────────────────────────────────────────────────────────────────
"use strict";

class InnovationDetectorWorkflow {
  static MANIFEST = {
    id:              "InnovationDetector.workflow",
    type:            "workflow",
    layer:           3,
    runtime:         "NodeJS",
    version:         "5.4.0",
    operationalRole: "savant",
    requires:  ["Oracle.service", "Cartographer.workflow", "ResponseFormatter.service"],
    dataFiles: [],
    lifecycle: ["init", "run", "dispose"],
    actions: {
      commands: {
        run: {
          description: "Analyse analysis.json + mapping.json + reuse.json and emit a ranked list of proposed new SDOA modules. Includes sleeve candidates when the proposal touches an external system.",
          input: {
            analysisPath: "string?",   // path to analysis.json (defaults to SDOA_ANALYSIS_PATH)
            mappingPath:  "string?",   // path to mapping.json
            reusePath:    "string?",   // path to reuse.json
            inline:       "object?"    // pass { analysis, mapping, reuse } directly instead of file paths
          },
          output: "object"
            // { ok, data: { newPrimitives[], newFeatures[], newWorkflows[], newSchemas[],
            //               newEngines[], newSleeves[], newTokens[], summary } }
        },
        suggest: {
          description: "Lightweight shorthand: describe a problem in plain text and get module suggestions back.",
          input:  { description: "string", context: "object?" },
          output: "object"
        }
      },
      events: {
        "innovation:detected": {
          payload: { totalProposals: "number", sleeveCount: "number", durationMs: "number" }
        },
        "innovation:sleeveRequired": {
          payload: { id: "string", externalSystem: "string", reason: "string" }
        }
      },
      accepts: {},
      slots:   {}
    },
    docs: {
      description: "Pattern-detection workflow. Scans the portfolio surface via Oracle, identifies repeated structures that should become new sovereign modules, and scores proposals by SDOA fit. v5.4: sleeve-aware — flags external-touching candidates as sleeve proposals rather than plain adapters.",
      author: "ProtoAI Core Architecture Group",
      sdoa:   "5.4"
    }
  };

  _registry    = null;
  _oracle      = null;
  _cartographer = null;
  _formatter   = null;

  async init(registry) {
    this._registry     = registry;
    this._oracle       = registry.get("Oracle.service");
    this._cartographer = registry.get("Cartographer.workflow");
    this._formatter    = registry.get("ResponseFormatter.service");
  }

  async run(payload = {}) {
    const t0 = Date.now();

    let analysis, mapping, reuse;

    if (payload.inline) {
      ({ analysis, mapping, reuse } = payload.inline);
    } else {
      try {
        const fs   = require("fs");
        const path = require("path");
        const root = process.env.SDOA_ANALYSIS_ROOT ?? process.cwd();
        analysis = JSON.parse(fs.readFileSync(path.join(root, payload.analysisPath ?? "analysis.json"), "utf8"));
        mapping  = JSON.parse(fs.readFileSync(path.join(root, payload.mappingPath  ?? "mapping.json"),  "utf8"));
        reuse    = JSON.parse(fs.readFileSync(path.join(root, payload.reusePath    ?? "reuse.json"),    "utf8"));
      } catch (err) {
        return { ok: false, error: `InnovationDetector: Could not load input files — ${err.message}` };
      }
    }

    const existingSurface = this._oracle?.dumpSurface({}) ?? [];
    const existingIds     = [...new Set(existingSurface.map(e => e.moduleId))];
    const sleeveSurface   = existingSurface.filter(e => e.surfaceType === "boundary");

    const newPrimitives = this._detectPrimitives(analysis, mapping, reuse, existingIds);
    const newFeatures   = this._detectFeatures(analysis, mapping, reuse, existingIds);
    const newWorkflows  = this._detectWorkflows(analysis, mapping, reuse, existingIds);
    const newSchemas    = this._detectSchemas(analysis, mapping, reuse, existingIds);
    const newEngines    = this._detectEngines(analysis, mapping, reuse, existingIds);
    const newSleeves    = this._detectSleeves(analysis, mapping, reuse, existingIds, sleeveSurface);
    const newTokens     = this._detectTokens(analysis);

    // Emit sleeve-required events for each candidate
    for (const s of newSleeves) {
      this._emit("innovation:sleeveRequired", {
        id:             s.id,
        externalSystem: s.external?.system ?? "unknown",
        reason:         s.reason
      });
    }

    const totalProposals = newPrimitives.length + newFeatures.length + newWorkflows.length +
                           newSchemas.length + newEngines.length + newSleeves.length + newTokens.length;

    this._emit("innovation:detected", {
      totalProposals,
      sleeveCount: newSleeves.length,
      durationMs: Date.now() - t0
    });

    return {
      ok: true,
      data: {
        newPrimitives,
        newFeatures,
        newWorkflows,
        newSchemas,
        newEngines,
        newSleeves,
        newTokens,
        summary: {
          totalProposals,
          sleeveCount:     newSleeves.length,
          durationMs:      Date.now() - t0,
          analyzedModules: existingIds.length
        }
      }
    };
  }

  async suggest({ description, context = {} } = {}) {
    if (!description?.trim()) {
      return { ok: false, error: "suggest: description is required" };
    }

    const desc  = description.toLowerCase();
    const suggestions = [];

    // Sleeve trigger: description mentions external system contact
    const externalKeywords = ["api", "http", "https", "cli", "daemon", "ipc", "spawn", "python", "binary", "endpoint", "webhook", "tauri", "llm", "llama", "inference"];
    const isBoundary = externalKeywords.some(k => desc.includes(k));

    if (isBoundary) {
      suggestions.push({
        type:         "sleeve",
        confidence:   "high",
        reason:       "Description references an external system or transport. A sleeve is required to maintain boundary sovereignty.",
        template:     "sdoa new sleeve",
        manifestHint: { type: "sleeve", layer: 3, requires: ["ResponseFormatter.service", "PathResolver.service"] }
      });
    }

    // Workflow trigger
    if (desc.includes("process") || desc.includes("pipeline") || desc.includes("orchestrat") || desc.includes("step")) {
      suggestions.push({ type: "workflow", confidence: "medium", reason: "Description implies a multi-step orchestration pipeline.", template: "sdoa new workflow" });
    }

    // Service trigger
    if (desc.includes("cache") || desc.includes("store") || desc.includes("index") || desc.includes("track") || desc.includes("registry")) {
      suggestions.push({ type: "service", confidence: "medium", reason: "Description implies shared stateful storage or indexing.", template: "sdoa new service" });
    }

    // Primitive trigger
    if (desc.includes("button") || desc.includes("input") || desc.includes("modal") || desc.includes("widget") || desc.includes("component")) {
      suggestions.push({ type: "primitive", confidence: "high", reason: "Description references a UI element that should be a reusable primitive.", template: "sdoa new primitive" });
    }

    if (!suggestions.length) {
      suggestions.push({ type: "workflow", confidence: "low", reason: "Default fallback — a workflow is the most general module class.", template: "sdoa new workflow" });
    }

    return { ok: true, data: { suggestions, isBoundary } };
  }

  // ── Detection Engines ──────────────────────────────────────────

  _detectPrimitives(analysis, mapping, reuse, existingIds) {
    const fragments = analysis?.ui?.fragments ?? [];
    return this._cluster(fragments, 3)
      .filter(c => !existingIds.includes(`${c.name}.prim`) && !reuse?.primitives?.includes(c.name))
      .map(c => ({
        id:           `${c.name}.prim`,
        type:         "primitive",
        layer:        2,
        suggestedFile:`ui/primitives/${c.name}/${c.name}.prim.js`,
        locations:    c.locations,
        count:        c.count,
        isSleeve:     false
      }));
  }

  _detectFeatures(analysis, mapping, reuse, existingIds) {
    const features = analysis?.ui?.features ?? [];
    return this._cluster(features, 2)
      .filter(c => !existingIds.includes(`${c.name}.feature`))
      .map(c => ({
        id:           `${c.name}.feature`,
        type:         "feature",
        layer:        1,
        suggestedFile:`ui/features/${c.name}/${c.name}.feature.js`,
        locations:    c.locations,
        count:        c.count,
        isSleeve:     false
      }));
  }

  _detectWorkflows(analysis, mapping, reuse, existingIds) {
    const calls = analysis?.backend?.calls ?? [];
    return this._cluster(calls, 3)
      .filter(c => !existingIds.includes(`${c.name}.workflow`))
      .map(c => ({
        id:           `${c.name}.workflow`,
        type:         "workflow",
        layer:        3,
        suggestedFile:`portfolio/substrate/workflows/${c.name}.workflow.js`,
        usedBy:       c.locations,
        count:        c.count,
        isSleeve:     false
      }));
  }

  _detectSchemas(analysis, mapping, reuse, existingIds) {
    const forms = analysis?.ui?.forms ?? [];
    return this._cluster(forms, 2)
      .filter(c => !existingIds.includes(`${c.name}.schema.json`))
      .map(c => ({
        id:           `${c.name}.schema.json`,
        type:         "schema",
        suggestedFile:`ui/data/schemas/${c.name}.schema.json`,
        fields:       c.fields ?? [],
        usedBy:       c.locations,
        count:        c.count,
        isSleeve:     false
      }));
  }

  _detectEngines(analysis, mapping, reuse, existingIds) {
    const tasks = analysis?.runtime?.tasks ?? [];
    return this._cluster(tasks, 2)
      .filter(c => !existingIds.includes(`${c.name}.engine`))
      .map(c => ({
        id:           `${c.name}.engine`,
        type:         "engine",
        layer:        3,
        suggestedFolder: c.isEvolution
          ? `portfolio/evolution/engines/${c.name}/`
          : `portfolio/substrate/engines/${c.name}/`,
        tasks:        c.tasks ?? [],
        count:        c.count,
        isSleeve:     false
      }));
  }

  // v5.4: Sleeve detection — any proposal that touches an external system
  // must be a sleeve, not a plain adapter or workflow.
  _detectSleeves(analysis, mapping, reuse, existingIds, sleeveSurface) {
    const externalCalls = analysis?.external?.calls ?? [];
    const coveredSystems = new Set(sleeveSurface.map(e => e.schema?.system).filter(Boolean));

    return externalCalls
      .filter(call => !coveredSystems.has(call.system))
      .filter(call => !existingIds.some(id => id.toLowerCase().includes(call.system?.toLowerCase())))
      .map(call => ({
        id:           `${this._toPascal(call.system ?? "External")}Sleeve.module`,
        type:         "sleeve",
        layer:        3,
        suggestedFile:`portfolio/substrate/adapters/${this._toPascal(call.system ?? "External")}Sleeve.module.js`,
        external: {
          system:    call.system,
          transport: call.transport ?? "https",
          path:      "auto",
          commands:  call.commands ?? []
        },
        requires:  ["ResponseFormatter.service", "PathResolver.service"],
        locations: call.locations ?? [],
        count:     call.count ?? 1,
        isSleeve:  true,
        reason:    `Detected ${call.count ?? 1} uncovered external system contact(s) to "${call.system}" via ${call.transport ?? "https"}. A sleeve is required — no plain adapter or workflow may contact external systems directly.`
      }));
  }

  _detectTokens(analysis) {
    const rules = analysis?.css?.rules ?? [];
    return this._cluster(rules, 3)
      .map(c => ({
        name:    `--${c.category ?? "unknown"}-${c.slug ?? c.name}`,
        value:   c.value,
        usedIn:  c.selectors ?? [],
        count:   c.count,
        isSleeve: false
      }));
  }

  // ── Utility ────────────────────────────────────────────────────

  _cluster(items, minCount) {
    // Group items by `name` field; filter by minimum occurrence threshold
    const map = new Map();
    for (const item of items) {
      const key = item.name ?? item.id ?? item.action ?? String(item);
      if (!map.has(key)) map.set(key, { name: key, count: 0, locations: [], ...item });
      const entry = map.get(key);
      entry.count++;
      if (item.location) entry.locations.push(item.location);
    }
    return [...map.values()].filter(c => c.count >= minCount);
  }

  _toPascal(str) {
    return (str ?? "").replace(/[-_\s]+(.)/g, (_, c) => c.toUpperCase())
      .replace(/^(.)/, c => c.toUpperCase());
  }

  _emit(eventName, payload) {
    try {
      const bus = this._registry?.get?.("EventBus.service");
      bus?.emit?.(eventName, payload);
    } catch (_) {}
  }

  async dispose() {
    this._registry     = null;
    this._oracle       = null;
    this._cartographer = null;
    this._formatter    = null;
  }
}

module.exports = InnovationDetectorWorkflow;
