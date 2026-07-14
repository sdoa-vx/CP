// ──────────────────────────────────────────────────────────────────
// File:    PolicySleeve.module.js
// Version: 1.0.0
// Updated: 2026-06-27T00:00:00Z
// Changes: Phase 2 Step 6 — Sleeve ratification (SDOA v5.4 §2.7).
//          Replaces LlmBridge.js as the boundary sovereign for
//          external LLM provider HTTP calls.
//          external.system = "llm-providers",
//          transport = "https".
//          Policy routing owned by LlmPolicyEngine (internal).
//          All await on async resolveRoute() call retained from V2 fix.
// ──────────────────────────────────────────────────────────────────

"use strict";

const { Adapter } = require("../../environment/sdoa-base.js");

class PolicySleeve extends Adapter {

    static MANIFEST = {
        id:              "PolicySleeve.module",
        type:            "adapter",          // "sleeve" pending typedef extension
        layer:           3,
        runtime:         "NodeJS",
        version:         "1.0.1",
        last_modified:   "2026-07-13T00:00:00Z",
        operationalRole: "savant",
        requires:        ["LlmPolicyEngine", "AiProvider.adapter",
                          "ResponseFormatter.service", "PathResolver.service"],
        dependencies:    ["LlmPolicyEngine", "AiProvider.adapter",
                          "ResponseFormatter.service", "PathResolver.service"],
        capabilities:    ["llm.generate", "llm.failover", "llm.route", "llm.economic-mode"],
        lifecycle:       ["init", "run", "dispose"],

        external: {
            system:    "llm-providers",
            transport: "https",
            path:      "auto",
            commands:  ["complete", "stream"]
        },

        actions: {
            commands: {
                generate: {
                    description: "Generate an LLM response using tier-aware policy routing and fail-over.",
                    input:  { prompt: "string", systemPrompt: "string?", tier: "string?" },
                    output: "string | LlmResponse"
                }
            },
            triggers: {
                failoverActivated:  { description: "Fires when a model fails (402/credits) and bridge falls back." },
                allRoutesExhausted: { description: "Fires when no LLM route succeeds." }
            },
            emits: {
                routeSelected: { description: "Emits the chosen model route before execution.", payload: { target: "string" } },
                routeFailed:   { description: "Emits when a route fails.", payload: { target: "string", error: "string" } }
            },
            workflows: {
                generate: {
                    description: "Primary LLM generation workflow.",
                    input:  { prompt: "string", systemPrompt: "string?", tier: "string?" },
                    output: "string | LlmResponse"
                }
            },
            accepts: {},
            slots:   {}
        },

        docs: {
            description: "Sleeve boundary module. Routes LLM generation requests through LlmPolicyEngine for tier resolution, then delegates HTTP execution to AiProvider.adapter. Never writes files or mutates live instances.",
            author: "ProtoAI team",
            sdoa:   "5.4.0"
        }
    };

    async generate(prompt, systemPrompt = "", tier = "high_reasoning") {
        // await on async resolveRoute (V2 fix retained)
        const policy       = await this.registry.get("LlmPolicyEngine").resolveRoute(tier);
        const attemptOrder = [policy.primary, policy.fallback].filter(Boolean);

        for (const target of attemptOrder) {
            this.emit("routeSelected", { target });
            try {
                return await this.registry.get("AiProvider.adapter").complete({
                    prompt, system: systemPrompt, model: target
                });
            } catch (error) {
                if (error.status === 402 || (error.message ?? "").includes("credits")) {
                    console.warn(`[PolicySleeve] Credits exhausted for ${target}. Failing over.`);
                    this.emit("failoverActivated", { target });
                    continue;
                }
                this.emit("routeFailed", { target, error: error.message });
            }
        }

        this.emit("allRoutesExhausted", {});
        throw new Error("[PolicySleeve] All LLM routes exhausted.");
    }
}

module.exports = PolicySleeve;
