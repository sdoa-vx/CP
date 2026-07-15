// ──────────────────────────────────────────────────────────────────
// File:    Engineer.workflow.js
// Version: 1.0.0
// Updated: 2026-06-17T00:00:00Z
// Changes: Relocated to canonical sdoavx/ structure; adjusted require paths
// ──────────────────────────────────────────────────────────────────
// ============================================================
// Engineer.workflow.js — SDOA v4 Workflow
// ============================================================
"use strict";

const WorkflowBase = require("./WorkflowBase");
const WorkflowResult = require("./WorkflowResult");
const orchestrator = require("../services/MultiModelOrchestrator.service");

class EngineerWorkflow extends WorkflowBase {
    static MANIFEST = {
        id: "EngineerWorkflow.workflow",
        type: "workflow",
        layer: 3,
        runtime: "NodeJS",
        version: "1.0.1",
        capabilities: ["orchestrator.engineer"],
        dependencies: ["MultiModelOrchestrator.service"],
        docs: {
            description: "Rewrites a prompt for optimal performance using the local model.",
            input: { message: "string" },
            output: "{ prompt: string, original: string }"
        },
        last_modified: "2026-07-13T00:00:00Z",
    };

    async run(context) {
        const { message } = context;
        if (!message) return new WorkflowResult("error", null, "Message is required");

        try {
            const result = await orchestrator.engineer(message);
            return new WorkflowResult("ok", { prompt: result.prompt, original: result.original });
        } catch (err) {
            return new WorkflowResult("error", null, err.message);
        }
    }
}

module.exports = EngineerWorkflow;
