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
            "non-sdoa-compliant": true,
            docs: {
                description: "Undeclared duplicate of the LlmPolicyEngine UI adapter — copies of this module exist across substrate/adapters, substrate/engines, and elsewhere in the repo. Flagged for consolidation in a later remediation phase; not fixed here."
            }
        };
        // ── end of SDOA v3.0 MANIFEST ────────────────────────

        constructor() {
            // ── state ────────────────────────────────────────
            this._policyCache  = null;
            this.listeners     = [];
            // ── end of state ─────────────────────────────────
        }

        // ── event emitter ────────────────────────────────────

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

        // ── end of event emitter ─────────────────────────────

        // ── _connector ───────────────────────────────────────
        // Lazy accessor for BackendConnector.ui instance.
        // Deferred so load order doesn't require strict
        // synchronous sequencing beyond domReady.
        // ── end of _connector ────────────────────────────────

        get _connector() {
            if (!window.backendConnector) {
                throw new Error("[LlmPolicyEngine.ui] BackendConnector.ui not initialized.");
            }
            return window.backendConnector;
        }

        // ── getPolicy ────────────────────────────────────────
        // Fetches the current LLM policy from the backend.
        // Caches the result in memory for the session.
        // Cache is invalidated on updatePolicy.
        // ── end of getPolicy ─────────────────────────────────

        async getPolicy() {
            if (this._policyCache) return this._policyCache;

            try {
                const policy = await this._connector.runWorkflow(
                    "get_policy", {}
                );
                this._policyCache = policy;
                return policy;
            } catch (err) {
                console.error("[LlmPolicyEngine.ui] getPolicy failed:", err);
                // Return a safe default so the UI doesn't crash
                return {
                    state:  "unknown",
                    tiers:  {},
                    primary: { provider: "unknown", model: "unknown" }
                };
            }
        }

        // ── resolveRoute ─────────────────────────────────────
        // Resolves the best model route for the requested tier.
        // Applies economic failover locally if policy.state
        // indicates low_credits, matching backend logic.
        // Emits routeResolved for any subscriber.
        // ── end of resolveRoute ──────────────────────────────

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

        // ── updatePolicy ─────────────────────────────────────
        // Merges new settings into the current policy and
        // persists via backend. Invalidates local cache and
        // emits policyUpdated on success.
        // ── end of updatePolicy ──────────────────────────────

        async updatePolicy(newSettings) {
            try {
                await this._connector.runWorkflow(
                    "update_policy", newSettings
                );

                // Invalidate cache so next getPolicy fetches fresh
                this._policyCache = null;

                this.emit("policyUpdated", { updated: newSettings });
                console.info("[LlmPolicyEngine.ui] Policy updated.");
            } catch (err) {
                console.error("[LlmPolicyEngine.ui] updatePolicy failed:", err);
                throw err;
            }
        }

        // ── invalidateCache ──────────────────────────────────
        // Allows external modules to force a fresh policy fetch
        // on next getPolicy/resolveRoute call.
        // ── end of invalidateCache ───────────────────────────

        invalidateCache() {
            this._policyCache = null;
        }

    }
    // ── end of class LlmPolicyEngine ─────────────────────────

    // ── auto-init ────────────────────────────────────────────
    domReady(() => {
        window.llmPolicyEngine = new LlmPolicyEngine();
    });
    // ── end of auto-init ─────────────────────────────────────

})();
