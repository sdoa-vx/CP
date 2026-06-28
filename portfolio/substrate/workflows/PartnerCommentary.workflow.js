// ──────────────────────────────────────────────────────────────────
// File:    PartnerCommentary.workflow.js
// Version: 1.1.0
// Updated: 2026-06-17T00:00:00Z
// Changes: Relocated to canonical sdoavx/ structure; adjusted require paths
// ──────────────────────────────────────────────────────────────────
// ============================================================
// PartnerCommentary.workflow.js — SDOA v4 Workflow
// version: 1.1.0
//
// v1.1.0: Register orchestrator event listeners before calling
//   commentary() so events (generating, result, errors) are
//   collected and returned in the response. PartnerTicker then
//   calls playback(events) to animate them in the sidebar.
//   Previously the internal orchestrator bus fired events that
//   nobody was listening to, so the ticker saw nothing.
// ============================================================
"use strict";

const WorkflowBase = require("./WorkflowBase");
const WorkflowResult = require("./WorkflowResult");
const orchestrator = require("./MultiModelOrchestrator");

class PartnerCommentaryWorkflow extends WorkflowBase {
    static MANIFEST = {
        id: "PartnerCommentaryWorkflow",
        type: "service",
        runtime: "NodeJS",
        version: "1.1.0",
        capabilities: ["partner.commentary"],
        dependencies: ["MultiModelOrchestrator"],
        docs: {
            description: "Generates side-channel commentary from the Silent Partner.",
            input:  { message: "string", response: "string", persona: "string?" },
            output: { text: "string", persona: "string", events: "array" }
        }
    };

    async run(context) {
        const { message, response, persona = "advisor", msgId = null } = context;

        // Collect orchestrator events so they can be played back in the UI ticker.
        // orchestrator.commentary() emits on its internal Node.js event bus; without
        // listeners here those events are lost and the ticker shows nothing.
        const events   = [];
        const handlers = new Map();
        const evtTypes = [
            "orchestrator:commentary",
            "orchestrator:error",
            "orchestrator:continuity_editor_rewrite"
        ];
        evtTypes.forEach(t => {
            const h = (data) => events.push({ type: t, ts: Date.now(), data });
            handlers.set(t, h);
            orchestrator.on(t, h);
        });

        try {
            const result = await orchestrator.commentary(message, response, persona, msgId);
            return new WorkflowResult("ok", {
                text:   result.text   || "",
                persona: result.persona || persona,
                events,
            });
        } catch (err) {
            return new WorkflowResult("error", { events }, err.message);
        } finally {
            handlers.forEach((h, t) => orchestrator.off(t, h));
        }
    }
}

module.exports = PartnerCommentaryWorkflow;
