// ──────────────────────────────────────────────────────────────────
// File:    MultiModelSend.workflow.js
// Version: 1.0.0
// Updated: 2026-06-17T00:00:00Z
// Changes: Relocated to canonical sdoavx/ structure
// ──────────────────────────────────────────────────────────────────
// Last modified: 2026-06-03 05:00 UTC
// ============================================================
// MultiModelSend.workflow.js — SDOA v5.0 Workflow (NodeJS)
// version: 1.0.0
// ============================================================
// Orchestrated chat pipeline:
//   1. route()    — local model classifies request, picks prime profile
//   2. engineer() — local model rewrites prompt for optimal prime output
//   3. prime      — SendMessageWorkflow runs with engineered prompt;
//                   watch() fires non-blocking on every ~400 chars of stream
//   4. audit()    — local model scores the completed response
//
// Returns WorkflowResult.ok({ reply, orchestrator: { events, route,
//   engineer, watchFlags, audit, engineeredPrompt, resolvedProfile } })
// ============================================================

"use strict";

const WorkflowBase        = require("./WorkflowBase");
const WorkflowResult      = require("./WorkflowResult");
const SendMessageWorkflow = require("./SendMessage.workflow");
const orchestrator        = require("../services/MultiModelOrchestrator.service");
let commentaryPool        = null;

class MultiModelSendWorkflow extends WorkflowBase {
    async init(registry) {
        this.registry = registry;
        try {
            commentaryPool = registry.get("CommentaryPool.service");
        } catch (_) { }
    }

    // ── SDOA v1.2 / v5.0 MANIFEST ────────────────────────────
    static MANIFEST = {
        id:           "MultiModelSendWorkflow.workflow",
        type:         "workflow",
        layer:        3,
        runtime:      "NodeJS",
        version:      "1.0.1",
        last_modified: "2026-07-13T00:00:00Z",
        capabilities: ["chat.send", "chat.stream", "orchestrator.pipeline"],
        dependencies: ["SendMessageWorkflow", "MultiModelOrchestrator.service"],
        docs: {
            description: "Orchestrated chat workflow. Routes request through local models and delegates to the prime model via SendMessageWorkflow.",
            input: {
                project:  "string",
                profile:  "string?",
                message:  "string",
                stream:   "boolean?",
                onChunk:  "function?",
            },
            output: { reply: "string", orchestrator: "object" },
            author: "ProtoAI Core Architecture Group",
            sdoa: "5.0.0"
        },
        actions: {
            commands: {},
            triggers: {},
            emits: {
                "orchestrator:routing":    {},
                "orchestrator:routed":     {},
                "orchestrator:engineering":{},
                "orchestrator:engineered": {},
                "orchestrator:watching":   {},
                "orchestrator:flagged":    {},
                "orchestrator:auditing":   {},
                "orchestrator:audited":    {},
            },
            workflows: {
                run: {
                    description: "Full orchestrated send: route → engineer → prime (+ watch) → audit.",
                    input:  { project: "string", profile: "string?", message: "string" },
                    output: "WorkflowResult",
                },
            },
        },
    };

    async run(context) {
        const { project, message, profile: requestedProfile, engine, facets, msgId, onChunk, onEvent, stream } = context;

        const events = [];
        const _track = (type, data = {}) => {
            events.push({ type, ts: Date.now(), data });
            if (typeof onEvent === "function") {
                onEvent(type, data);
            }
            if (typeof window !== "undefined" && window.EventBus) {
                window.EventBus.emit(type, data);
            }
        };

        const handlers = new Map();
        const _evtTypes = [
            "orchestrator:routing", "orchestrator:routed",
            "orchestrator:engineering", "orchestrator:engineered",
            "orchestrator:watching", "orchestrator:flagged",
            "orchestrator:auditing", "orchestrator:audited",
            "orchestrator:commentary_generating", "orchestrator:commentary",
            "orchestrator:continuity_editor_rewrite",
            "orchestrator:error",
        ];

        _evtTypes.forEach(t => {
            const h = (data) => _track(t, data);
            handlers.set(t, h);
            orchestrator.on(t, h);
        });

        try {
            let resolvedProfile = requestedProfile || "default";
            let finalMessage    = message;

            setImmediate(async () => {
                try {
                    // Background Housekeeper tasks
                } catch (e) {
                    _track("housekeeper_error", { error: e.message });
                }
            });

            const watchResults = [];
            let   watchBuffer  = "";

            const watchingOnChunk = async (chunk) => {
                onChunk?.(chunk);
                watchBuffer += chunk;
                if (watchBuffer.length > 0 && (watchBuffer.length % 400) < (chunk.length + 8)) {
                    setImmediate(async () => {
                        try {
                            const w = await orchestrator.watch(watchBuffer, message);
                            if (w && !w.ok && w.flag) {
                                watchResults.push(w);
                                _track("orchestrator:flagged", { flag: w.flag });
                            }
                        } catch (_) {}
                    });
                }
            };

            const primaryWf     = new SendMessageWorkflow();
            const primaryResult = await primaryWf.run({
                ...context,
                message: finalMessage,
                profile: resolvedProfile,
                onChunk: stream ? watchingOnChunk : onChunk,
            });

            if (primaryResult.status !== "ok") {
                const primeError  = primaryResult.data?.error  || primaryResult.error  || "Prime workflow failed";
                return new WorkflowResult("error", {
                    orchestrator: { events },
                }, primeError);
            }

            const primeReply = stream ? watchBuffer : (primaryResult.data?.reply || "");

            let activeFacets = facets;
            if (!activeFacets || activeFacets.length === 0) {
                const allPersonas = ["advisor", "critic", "friend", "comedy", "slutty", "scary", "scared", "alien"];
                activeFacets = [...allPersonas].sort(() => 0.5 - Math.random()).slice(0, 3);
            }
            const hasOpenRouter = orchestrator._hasOpenRouterKey();
            const resolvedMsgId = msgId || "msg_" + Date.now();

            if (!commentaryPool) {
                try {
                    const CommentaryPoolClass = require("../services/CommentaryPool.service");
                    commentaryPool = new CommentaryPoolClass();
                    if (this.registry) {
                        await commentaryPool.init(this.registry);
                    }
                } catch (_) {}
            }
            if (commentaryPool && typeof commentaryPool.generateParallel === "function") {
                commentaryPool.generateParallel(message, primeReply, activeFacets, hasOpenRouter, resolvedMsgId);
            }

            setImmediate(async () => {
                try {
                    const auditResult = await orchestrator.audit(message, primeReply);
                    _track("orchestrator:audited", { score: auditResult.score, note: auditResult.note });
                } catch (e) {
                    _track("audit_error", { error: e.message });
                }
            });

            return new WorkflowResult("ok", {
                reply:        primeReply,
                project,
                profile:      resolvedProfile,
                orchestrator: {
                    events,
                },
                streaming:    !!stream,
            });

        } finally {
            handlers.forEach((h, t) => orchestrator.off(t, h));
        }
    }
}

module.exports = MultiModelSendWorkflow;
