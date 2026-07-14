// ============================================================
// tauri-utils.js — Shared Tauri IPC Utility
// version: 5.0.0
// load order: FIRST — before any UI module that calls Tauri
// ============================================================

(function () {
    "use strict";

    const MANIFEST = {
        id:      "TauriUtils.utility",
        type:    "utility",
        layer:   3,
        runtime: "Browser",
        version: "5.0.0",
        requires: [],
        dependencies: [],
        capabilities: [
            "tauri:invoke",
            "tauri:isTauriCheck",
            "dom:ready"
        ],
        docs: {
            description: "Foundational, load-first Tauri IPC utility. Provides the single canonical tauriInvoke() wrapper, an isTauri() availability guard, and a domReady() helper used by every other browser-layer SDOA module to safely call the Tauri core bridge.",
            author: "ProtoAI Team"
        },
        last_modified: "2026-07-13T00:00:00Z"
    };

    // ── tauriInvoke ──────────────────────────────────────────
    // Single canonical wrapper for Tauri IPC calls.
    // Exposed on window so all UI modules share one copy.
    // Throws a descriptive error if Tauri core is unavailable
    // (dev browser, non-Tauri context, etc.)
    // ── end of tauriInvoke ──────────────────────────────────

    function tauriInvoke(cmd, payload) {
        const core = window.__TAURI__?.core;
        if (!core || typeof core.invoke !== "function") {
            throw new Error(
                "[tauri-utils] Tauri core.invoke is not available. " +
                "Are you running inside a Tauri window?"
            );
        }
        return core.invoke(cmd, payload);
    }

    // ── isTauri ──────────────────────────────────────────────
    // Safe guard — use before any Tauri-specific call
    // ── end of isTauri ──────────────────────────────────────

    function isTauri() {
        return !!(window.__TAURI__?.core?.invoke);
    }

    // ── domReady ─────────────────────────────────────────────
    // Fires callback immediately if DOM is already ready,
    // otherwise waits for DOMContentLoaded.
    // Fixes the late-load silent-miss bug present in all UI modules.
    // ── end of domReady ─────────────────────────────────────

    function domReady(fn) {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", fn);
        } else {
            fn();
        }
    }

    // ── exports ──────────────────────────────────────────────
    window.TauriUtils = { MANIFEST, tauriInvoke, isTauri, domReady };
    // ── end of exports ───────────────────────────────────────

})();
