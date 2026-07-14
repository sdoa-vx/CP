// ──────────────────────────────────────────────────────────────────
// File:    LlmPolicyEngine.js
// Version: 3.1.0
// Updated: 2026-06-27T00:00:00Z
// Changes: V5 compliance — removed dependency on BackendConnector
//          (no NodeJS BackendConnector sovereign exists; the existing
//          BackendConnector is a Browser module using window.__TAURI__).
//          Policy file is now read/written directly via fs + PathResolver,
//          which is the correct NodeJS pattern.
// ──────────────────────────────────────────────────────────────────
// ============================================================
// LlmPolicyEngine — SDOA v3.1 Governance Service
// ============================================================

const fs      = require("fs");
const path    = require("path");
const { Service } = require('../../environment/sdoa-base.js');
const paths   = require('../access/env/paths');

class LlmPolicyEngine extends Service {

    // ------------------------------------------------------------
    // SDOA v3.1 MANIFEST (embedded, authoritative)
    // ------------------------------------------------------------
    static MANIFEST = {
        id: "LlmPolicyEngine.engine",
        type: "engine",
        layer: 3,
        runtime: "NodeJS",
        version: "3.1.1",
        last_modified: "2026-07-13T00:00:00Z",

        // v1.2 compatibility fields
        capabilities: [
            "policy.read",
            "policy.write",
            "policy.resolve",
            "workflow.invoke"
        ],

        // BackendConnector removed — NodeJS BackendConnector does not exist
        dependencies: [],

        // --------------------------------------------------------
        // v3.1 ACTION SURFACE
        // --------------------------------------------------------
        actions: {
            commands: {
                resolveRoute: {
                    description: "Resolve the best model route based on tier and policy state.",
                    input: { requestedTier: "string" },
                    output: "PolicyRoute"
                },
                getPolicy: {
                    description: "Load the current LLM policy from config.",
                    input: {},
                    output: "PolicyObject"
                },
                updatePolicy: {
                    description: "Merge and persist new policy settings.",
                    input: { newSettings: "object" },
                    output: "void"
                }
            },

            triggers: {
                policyUpdated: {
                    description: "Fires when the policy file is updated.",
                    payload: { updated: "object" }
                }
            },

            emits: {
                routeResolved: {
                    description: "Emits the resolved route before LlmBridge uses it.",
                    payload: { requestedTier: "string", resolved: "object" }
                }
            },

            workflows: {
                resolveRoute: {
                    description: "Primary policy resolution workflow.",
                    input: { requestedTier: "string" },
                    output: "PolicyRoute"
                },
                updatePolicy: {
                    description: "Primary policy update workflow.",
                    input: { newSettings: "object" },
                    output: "void"
                }
            }
        },

        docs: {
            description: "Governance service for LLM routing, policy resolution, and config persistence.",
            input: {
                resolveRoute: { requestedTier: "string" },
                updatePolicy: { newSettings: "object" }
            },
            output: {
                resolveRoute: "PolicyRoute",
                updatePolicy: "void"
            },
            author: "ProtoAI team",
            sdoa_compatibility: `
                SDOA Compatibility Contract:
                - v1.2 Manifest is minimum requirement (Name/Type/Version/Description/Capabilities/Dependencies/Docs).
                - v2.0 may also read sidecars, hot-reload, version-CLI.
                - v3.0 may add actions.commands, actions.triggers, actions.emits, actions.workflows.
                - Lower versions MUST ignore unknown/unexpressed fields.
                - Higher versions MUST NOT change meaning of older fields.
                - All versions are backward and forward compatible.
            `
        }
    };

    // ------------------------------------------------------------
    // Resolve model route based on tier + policy state
    // ------------------------------------------------------------
    async resolveRoute(requestedTier) {
        const policy = await this.getPolicy();

        // Economic failover mode
        if (policy.state === "low_credits") {
            const resolved = policy.tiers["local_fallback"];
            this.emit("routeResolved", { requestedTier, resolved });
            return resolved;
        }

        const resolved = policy.tiers[requestedTier] || policy.tiers["standard"];
        this.emit("routeResolved", { requestedTier, resolved });
        return resolved;
    }

    // ------------------------------------------------------------
    // Load policy from config file (direct fs read — no Browser dep)
    // ------------------------------------------------------------
    async getPolicy() {
        const policyPath = paths.data("sdoa_llm_policy.json");
        try {
            const raw = fs.readFileSync(policyPath, "utf8");
            return JSON.parse(raw);
        } catch (_) {
            // Return safe defaults when the policy file does not exist yet
            return {
                state: "active",
                tiers: {
                    high_reasoning: { primary: "anthropic/claude-sonnet-4-6", fallback: "openai/gpt-4o-mini" },
                    standard:       { primary: "openai/gpt-4o-mini",          fallback: null },
                    local_fallback: { primary: "local",                        fallback: null }
                }
            };
        }
    }

    // ------------------------------------------------------------
    // Update + persist policy (direct fs write — no Browser dep)
    // ------------------------------------------------------------
    async updatePolicy(newSettings) {
        const current = await this.getPolicy();
        const updated = { ...current, ...newSettings };

        const policyPath = paths.data("sdoa_llm_policy.json");
        fs.writeFileSync(policyPath, JSON.stringify(updated, null, 2), "utf8");

        this.bump_minor("Policy updated: " + JSON.stringify(newSettings));

        // v3.1 trigger
        this.emit("policyUpdated", { updated });
    }
}

module.exports = LlmPolicyEngine;
