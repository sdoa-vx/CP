// ──────────────────────────────────────────────────────────────────
// File:    LlmPolicyEngine.ui.js
// Version: 3.0.0
// Updated: 2026-06-17T00:00:00Z
// Changes: Relocated to canonical sdoavx/ structure
// ──────────────────────────────────────────────────────────────────
// ============================================================
// LlmPolicyEngine.ui.js — UI Adapter (Browser-Safe)
// version: 3.0.0
// Last modified: 2026-05-04 03:11 UTC
// depends: tauri-utils.js, BackendConnector.ui.js
// ============================================================

(function () {
    "use strict";

    const { domReady } = window.TauriUtils;

    // ── LlmPolicyEngine.ui ───────────────────────────────────
    // Browser-safe UI adapter for LLM governance.
    // Mirrors LlmPolicyEngine.js (backend) public surface but
    // delegates all execution to BackendConnector.ui via
    // window.backendConnector.runWorkflow().
    // Never uses require(). Never calls Tauri directly —
    // all IPC is owned by BackendConnector.ui.
    // ── end of LlmPolicyEngine.ui ───────────────────────────

    class LlmPolicyEngine {

        // ── SDOA v3.0 MANIFEST ───────────────────────────────
        static MANIFEST = {
            id:      "LlmPolicyEngine.ui",
            type:    "adapter",
            runtime: "Browser",
            version: "3.0.0",

            capabilities: [
                "policy.read",
                "policy.write",
                "policy.resolve",
                "workflow.invoke"
            ],
            dependencies: [
                "tauri-utils.js",
                "BackendConnector.ui.js"
            ],
            docs: {
                description: "Browser-safe governance adapter. Reads and writes LLM routing policy via BackendConnector.ui. Exposes resolveRoute, getPolicy, and updatePolicy to UI surfaces.",
                input: {
                    resolveRoute:  { requestedTier: "string" },
                    updatePolicy:  { newSettings: "object" }
                },
                output: {
                    resolveRoute:  "PolicyRoute",
                    getPolicy:     "PolicyObject",
                    updatePolicy:  "void"
                },
                author: "ProtoAI team",
                sdoa_compatibility: `
                    SDOA Compatibility Contract:
                    - v1.2 Manifest is minimum requirement (Name/Type/Version/Description/Capabilities/Dependencies/Docs).
                    - v2.0 may also read sidecars, hot-reload, version-CLI.
                    - v3.0+ may add actions.commands, actions.triggers, actions.emits, actions.workflows.
                    - Lower versions MUST ignore unknown/unexpressed fields.
                    - Higher versions MUST NOT change meaning of older fields.
                    - All versions are backward and forward compatible.
                `
            },

            actions: {
                commands: {
                    resolveRoute: {
                        description: "Resolve the best model route based on tier and current policy state.",
                        input:  { requestedTier: "string" },
                        output: "PolicyRoute"
                    },
                    getPolicy: {
                        description: "Load the current LLM policy from backend config.",
                        input:  {},
                        output: "PolicyObject"
                    },
                    updatePolicy: {
                        description: "Merge and persist new policy settings to backend.",
                        input:  { newSettings: "object" },
                        output: "void"
                    }
                },
                triggers: {
                    policyUpdated: {
                        description: "Fires when the policy is successfully updated.",
                        payload: { updated: "object" }
                    }
                },
                emits: {
                    routeResolved: {
                        description: "Emits the resolved route after resolution.",
                        payload: { requestedTier: "string", resolved: "object" }
                    }
                },
                workflows: {
                    resolveRoute: {
                        description: "Primary policy resolution workflow.",
                        input:  { requestedTier: "string" },
                        output: "PolicyRoute"
                    },
                    updatePolicy: {
                        description: "Primary policy update workflow.",
                        input:  { newSettings: "object" },
                        output: "void"
                    }
                }
            }
        };

        constructor() {
            this._policyCache  = null;
            this.listeners     = [];
        }

        on(event, handler) {
            this.listeners.push({ event, handler });
        }

        off(event, handler) {
            this.listeners = this.listeners.filter(
                l => !(l.event === event && l.handler === handler)
            );
        }

        emit(event, data) {
            for (const l of this.listeners) {
                if (l.event === event) {
                    try { l.handler(data); } catch (e) {
                        console.error(`[LlmPolicyEngine.ui] Listener error (${event}):`, e);
                    }
                }
            }
        }

        get _connector() {
            if (!window.backendConnector) {
                throw new Error("[LlmPolicyEngine.ui] BackendConnector.ui not initialized.");
            }
            return window.backendConnector;
        }

        async getPolicy() {
            if (this._policyCache) return this._policyCache;

            try {
                const policy = await this._connector.runWorkflow("get_policy", {});
                this._policyCache = policy;
                return policy;
            } catch (err) {
                console.error("[LlmPolicyEngine.ui] getPolicy failed:", err);
                return {
                    state:  "unknown",
                    tiers:  {},
                    primary: { provider: "unknown", model: "unknown" }
                };
            }
        }

        async resolveRoute(requestedTier) {
            const policy = await this.getPolicy();

            let resolved;
            if (policy.state === "low_credits") {
                resolved = policy.tiers?.["local_fallback"] ?? null;
            } else {
                resolved = policy.tiers?.[requestedTier]
                        ?? policy.tiers?.["standard"]
                        ?? null;
            }

            this.emit("routeResolved", { requestedTier, resolved });
            return resolved;
        }

        async updatePolicy(newSettings) {
            try {
                await this._connector.runWorkflow("update_policy", newSettings);
                this._policyCache = null;
                this.emit("policyUpdated", { updated: newSettings });
                console.info("[LlmPolicyEngine.ui] Policy updated.");
            } catch (err) {
                console.error("[LlmPolicyEngine.ui] updatePolicy failed:", err);
                throw err;
            }
        }

        invalidateCache() {
            this._policyCache = null;
        }

    }

    domReady(() => {
        window.llmPolicyEngine = new LlmPolicyEngine();
    });

})();
