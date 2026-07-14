// ============================================================
// PlaygroundResultHistory.utility.js — SDOA v5 Utility | layer 1
// Updated: 2026-07-14
// Extracted from Playground.feature.js (Phase 5 — oversized-file
// split). Carries result-panel rendering and the execution history
// list: _renderResult(), _clearResult(), _renderHistory(),
// _clearHistory().
//
// Prototype mixin (applied via Object.assign(PlaygroundFeature.prototype,
// ...) in Playground.feature.js) — see PlaygroundFormExecution.utility.js
// for why this split uses prototype mixins.
// ============================================================

(function () {
    "use strict";

    const MANIFEST = {
        id: "PlaygroundResultHistory.utility", type: "utility", layer: 1,
        runtime: "Browser", version: "1.0.0",
        docs: { description: "Prototype mixin (applied via Object.assign, not instantiated) contributing Playground.feature.js's result and history panel rendering: _renderResult(), _clearResult(), _renderHistory(), _clearHistory(). Extracted from Playground.feature.js as part of the Phase 5 oversized-file split.", author: "ProtoAI Core Architecture Group" }
    };

    const PlaygroundResultHistoryMixin = {

        // -- Result Rendering ---------------------------------

        _renderResult(result, durationMs, loading, error) {
            this._resultPanel.replaceChildren();

            if (loading) {
                const spinner = document.createElement("div");
                spinner.className   = "sdoa-playground__spinner";
                spinner.textContent = "Dispatching...";
                this._resultPanel.appendChild(spinner);
                return;
            }

            const header = document.createElement("div");
            header.className = "sdoa-playground__result-header";

            const label = document.createElement("span");
            label.className   = "sdoa-playground__result-label";
            label.textContent = error ? "[x] Error" : "[ok] Result";
            label.style.color = error ? "var(--color-error)" : "var(--color-success)";

            const timing = document.createElement("span");
            timing.className   = "sdoa-playground__result-timing";
            timing.textContent = durationMs != null ? `${durationMs}ms` : "";

            header.appendChild(label);
            header.appendChild(timing);

            const pre = document.createElement("pre");
            pre.className   = "sdoa-playground__result-body" + (error ? " sdoa-playground__result-body--error" : "");
            pre.textContent = error
                ? error
                : JSON.stringify(result ?? null, null, 2);

            this._resultPanel.appendChild(header);
            this._resultPanel.appendChild(pre);
        },

        _clearResult() {
            this._resultPanel.replaceChildren();
            const hint = document.createElement("p");
            hint.className   = "sdoa-playground__hint";
            hint.textContent = "Result will appear here after execution.";
            this._resultPanel.appendChild(hint);
        },

        // -- History Rendering --------------------------------

        _renderHistory() {
            this._historyPanel.replaceChildren();

            if (this._history.length === 0) {
                const hint = document.createElement("p");
                hint.className   = "sdoa-playground__hint";
                hint.textContent = "No executions yet.";
                this._historyPanel.appendChild(hint);
                return;
            }

            for (const run of this._history.slice(0, 20)) {
                const row = document.createElement("div");
                row.className = "sdoa-playground__history-row" +
                    (run.error ? " sdoa-playground__history-row--error" : "");

                const main = document.createElement("span");
                main.className   = "sdoa-playground__history-main";
                main.textContent = `${run.moduleId} > ${run.commandId}`;

                const meta = document.createElement("span");
                meta.className   = "sdoa-playground__history-meta";
                meta.textContent = `${run.durationMs}ms · ${run.ts.slice(11, 19)}`;

                row.appendChild(main);
                row.appendChild(meta);

                // Click to restore that run's result
                row.addEventListener("click", () => {
                    this._renderResult(run.result, run.durationMs, false, run.error);
                    this._selectModuleById(run.moduleId);
                    this._selectCommandById(run.commandId);
                });

                this._historyPanel.appendChild(row);
            }
        },

        _clearHistory() {
            this._history = [];
            this._renderHistory();
        }

    };

    // ── Exports ───────────────────────────────────────────────

    const component = { MANIFEST, mixin: PlaygroundResultHistoryMixin };
    window.PlaygroundResultHistory = component;
    if (window.ModuleLoader) window.ModuleLoader.register(MANIFEST, component);

})();
