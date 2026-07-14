// ──────────────────────────────────────────────────────────────────
// File:    QmdAdapter.ui.js
// Version: 3.0.0
// Updated: 2026-06-17T00:00:00Z
// Changes: Relocated to canonical sdoavx/ structure
// ──────────────────────────────────────────────────────────────────
// ============================================================
// QmdAdapter.ui.js — UI Adapter (Browser-Safe)
// version: 3.0.0
// Last modified: 2026-05-04 03:11 UTC
// depends: tauri-utils.js, BackendConnector.ui.js
// ============================================================

(function () {
    "use strict";

    const { domReady } = window.TauriUtils;

    // ── QmdAdapter.ui ────────────────────────────────────────
    // Browser-safe UI adapter for QMD semantic search and
    // indexing. Mirrors QmdAdapter.js (backend) public surface
    // but delegates all execution to BackendConnector.ui via
    // window.backendConnector.runWorkflow().
    // Never uses require(). Never calls Tauri directly.
    // ── end of QmdAdapter.ui ─────────────────────────────────

    class QmdAdapter {

        // ── SDOA v3.0 MANIFEST ───────────────────────────────
        static MANIFEST = {
            id:      "QmdAdapter.ui",
            type:    "adapter",
            "non-sdoa-compliant": true,
            docs: {
                description: "Undeclared duplicate of the QmdAdapter UI adapter — copies of this module exist across substrate/adapters and elsewhere in the repo. Flagged for consolidation in a later remediation phase; not fixed here."
            }
        };
        // ── end of SDOA v3.0 MANIFEST ────────────────────────

        constructor() {
            this.listeners = [];
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
                        console.error(`[QmdAdapter.ui] Listener error (${event}):`, e);
                    }
                }
            }
        }

        // ── end of event emitter ─────────────────────────────

        // ── _connector ───────────────────────────────────────
        // Lazy accessor for BackendConnector.ui instance.
        // ── end of _connector ────────────────────────────────

        get _connector() {
            if (!window.backendConnector) {
                throw new Error("[QmdAdapter.ui] BackendConnector.ui not initialized.");
            }
            return window.backendConnector;
        }

        // ── search ───────────────────────────────────────────
        // Executes a semantic search via QMD backend workflow.
        // Emits searchExecuted with query and result count.
        // Returns empty array on failure so callers don't crash.
        // ── end of search ────────────────────────────────────

        async search(query) {
            if (!query || !query.trim()) {
                console.warn("[QmdAdapter.ui] search() called with empty query.");
                return [];
            }

            try {
                const results = await this._connector.runWorkflow(
                    "qmd_search", { query }
                );

                const resultArray = Array.isArray(results) ? results : [];
                this.emit("searchExecuted", { query, resultCount: resultArray.length });
                return resultArray;

            } catch (err) {
                console.error("[QmdAdapter.ui] search failed:", err);
                this.emit("searchExecuted", { query, resultCount: 0 });
                return [];
            }
        }

        // ── index ────────────────────────────────────────────
        // Triggers QMD indexing for the given folder path.
        // Emits indexingStarted before and indexingCompleted
        // or indexingFailed after.
        // ── end of index ─────────────────────────────────────

        async index(path) {
            if (!path) {
                console.warn("[QmdAdapter.ui] index() called with no path.");
                return;
            }

            this.emit("indexingStarted", { path });

            try {
                const result = await this._connector.runWorkflow(
                    "qmd_index", { path }
                );

                this.emit("indexingCompleted", { path });
                return result;

            } catch (err) {
                console.error("[QmdAdapter.ui] index failed:", err);
                this.emit("indexingFailed", { path, error: err.message });
                throw err;
            }
        }

    }
    // ── end of class QmdAdapter ──────────────────────────────

    // ── auto-init ────────────────────────────────────────────
    domReady(() => {
        window.qmdAdapter = new QmdAdapter();
    });
    // ── end of auto-init ─────────────────────────────────────

})();
