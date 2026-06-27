// ──────────────────────────────────────────────────────────────────
// File:    MemoryDistiller.workflow.js
// Version: 5.1.0
// Updated: 2026-06-17T00:00:00Z
// Changes: Relocated to canonical sdoavx/ structure
// ──────────────────────────────────────────────────────────────────
// Last modified: 2026-06-03 08:20 UTC
// Module Type: workflow | Operational Role: savant
// Version: 5.1.0 | Runtime: NodeJS

"use strict";

const crypto = require("crypto");

class MemoryDistillerWorkflow {
  static MANIFEST = {
    id: "MemoryDistiller.workflow",
    type: "workflow",
    layer: 3,
    runtime: "NodeJS",
    version: "5.1.0",
    operationalRole: "savant",
    requires: ["Memory.repository", "EventBus.service"], // Enforced complete alignment with actions dependencies
    capabilities: ["lossless_context_distillation"],
    dependencies: [],
    lifecycle: ["init"],
    actions: {
      commands: {
        run: { description: "Executes distillation compilation against targeted workspace payload" }
      },
      events: {
        "distiller:complete": { description: "Emitted when target context namespace collection is updated" }
      },
      accepts: {}
    },
    optimization: {
      priority: "speed",
      assertionSuite: "MemoryDistiller.tests.json"
    },
    docs: {
      description: "Lossless memory compression worker with strictly declared ecosystem metrics contracts.",
      author: "SDOA Core Architecture Group",
      sdoa: "5.0.0"
    }
  };

  async init(registry) {
    this.registry = registry;
    this.repo = registry.get("Memory.repository");
    this.bus = registry.get("EventBus.service");
  }

  async execute(commandName, payload) {
    if (commandName === "run") {
      return await this.run(payload);
    }
    throw new Error(`[MemoryDistiller.workflow] Action Command Match Collapse: ${commandName}`);
  }

  async run(payload) {
    if (!payload || typeof payload !== "object") {
      return { status: "failed", reason: "Invalid payload object." };
    }
    const { namespace, targetId } = payload;
    if (!namespace || !targetId) {
      return { status: "failed", reason: "Missing namespace or targetId in payload." };
    }

    try {
      const rawEntries = await this.repo.execute("read", { namespace, targetId });

      if (!rawEntries || rawEntries.length === 0) {
        return { status: "skipped", reason: "Zero context profiles available." };
      }

      const compiledVerbatim = [];
      const compiledConstraints = [];
      const compiledTags = new Set();

      const entriesArray = Array.isArray(rawEntries) ? rawEntries : [rawEntries];
      for (const entry of entriesArray) {
        if (!entry) continue;
        const content = entry.content || {};

        if (content.verbatim) {
          if (Array.isArray(content.verbatim)) {
            compiledVerbatim.push(...content.verbatim);
          } else {
            compiledVerbatim.push(content.verbatim);
          }
        }
        if (content.constraints) {
          if (Array.isArray(content.constraints)) {
            compiledConstraints.push(...content.constraints);
          } else {
            compiledConstraints.push(content.constraints);
          }
        }
        if (content.tags) {
          if (Array.isArray(content.tags)) {
            content.tags.forEach(t => compiledTags.add(t));
          } else {
            compiledTags.add(content.tags);
          }
        }
      }

      const uuid = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString("hex");

      const distilledPayload = [{
        id: uuid,
        type: namespace,
        source: "distilled",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        content: {
          summary: `Canonical SDOA distilled compilation for ${namespace} [${targetId}].`,
          verbatim: [...new Set(compiledVerbatim)],
          constraints: [...new Set(compiledConstraints)],
          tags: [...compiledTags]
        }
      }];

      await this.repo.execute("write", { namespace, targetId, data: distilledPayload });

      if (this.bus && typeof this.bus.emit === "function") {
        this.bus.emit("distiller:complete", { namespace, targetId });
      }

      return { status: "success", count: distilledPayload.length };
    } catch (err) {
      console.error(`[MemoryDistillerWorkflow] Distillation compilation failed:`, err.message);
      return { status: "failed", reason: err.message };
    }
  }

  async dispose() {}
}

module.exports = MemoryDistillerWorkflow;
