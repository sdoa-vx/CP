// ============================================================
// PlaygroundDomBuilder.utility.js — SDOA v5 Utility | layer 1
// Updated: 2026-07-14
// Extracted from Playground.feature.js (Phase 5 — oversized-file
// split). Carries _buildDOM() — builds the top bar (title, status
// badge, Refresh/Clear History buttons), the module/command selector
// row, and the three-column body (Input Parameters / Result / History)
// — assigning all the DOM refs Playground.feature.js's other methods
// read (this._formPanel, this._resultPanel, this._historyPanel,
// this._moduleSelect, this._cmdSelect, this._runBtn, this._statusBadge,
// this._root).
//
// Prototype mixin (applied via Object.assign(PlaygroundFeature.prototype,
// ...) in Playground.feature.js) — see PlaygroundFormExecution.utility.js
// for why this split uses prototype mixins.
// ============================================================

(function () {
    "use strict";

    const MANIFEST = {
        id: "PlaygroundDomBuilder.utility", type: "utility", layer: 1,
        runtime: "Browser", version: "1.0.0",
        docs: { description: "Prototype mixin (applied via Object.assign, not instantiated) contributing Playground.feature.js's _buildDOM() — top bar, module/command selector row, and the Input Parameters / Result / History three-column body. Extracted from Playground.feature.js as part of the Phase 5 oversized-file split.", author: "ProtoAI Core Architecture Group" }
    };

    const PlaygroundDomBuilderMixin = {

        // -- DOM Construction ---------------------------------

        _buildDOM() {
            this._root = document.createElement("div");
            this._root.className = "sdoa-playground";

            // -- Top Bar -------------------------------------------
            const topBar = document.createElement("div");
            topBar.className = "sdoa-playground__topbar";

            const title = document.createElement("span");
            title.className   = "sdoa-playground__title";
            title.textContent = "Playground -- Live Command Executor";

            this._statusBadge = document.createElement("span");
            this._statusBadge.className = "sdoa-playground__status sdoa-playground__status--loading";
            this._statusBadge.textContent = "Initializing...";

            const refreshBtn = document.createElement("button");
            refreshBtn.className   = "sdoa-playground__toolbar-btn";
            refreshBtn.textContent = "Refresh";
            refreshBtn.addEventListener("click", () => this.refresh());

            const clearHistBtn = document.createElement("button");
            clearHistBtn.className   = "sdoa-playground__toolbar-btn";
            clearHistBtn.textContent = "Clear History";
            clearHistBtn.addEventListener("click", () => this._clearHistory());

            topBar.appendChild(title);
            topBar.appendChild(this._statusBadge);
            topBar.appendChild(refreshBtn);
            topBar.appendChild(clearHistBtn);

            // -- Selector Row --------------------------------------
            const selectorRow = document.createElement("div");
            selectorRow.className = "sdoa-playground__selector-row";

            this._moduleSelect = document.createElement("select");
            this._moduleSelect.className = "sdoa-playground__select";
            this._moduleSelect.setAttribute("aria-label", "Select module");
            this._moduleSelect.addEventListener("change", e => {
                const id = e.target.value;
                if (id) this._selectModuleById(id);
            });

            const arrow = document.createElement("span");
            arrow.className   = "sdoa-playground__arrow";
            arrow.textContent = ">";

            this._cmdSelect = document.createElement("select");
            this._cmdSelect.className = "sdoa-playground__select";
            this._cmdSelect.disabled  = true;
            this._cmdSelect.setAttribute("aria-label", "Select command");
            this._cmdSelect.addEventListener("change", e => {
                const name = e.target.value;
                if (name) this._selectCommandById(name);
            });

            this._runBtn = document.createElement("button");
            this._runBtn.className   = "sdoa-playground__run-btn";
            this._runBtn.textContent = "Run";
            this._runBtn.disabled    = true;
            this._runBtn.addEventListener("click", () => this._execute());

            selectorRow.appendChild(this._moduleSelect);
            selectorRow.appendChild(arrow);
            selectorRow.appendChild(this._cmdSelect);
            selectorRow.appendChild(this._runBtn);

            // -- Main Body -----------------------------------------
            const body = document.createElement("div");
            body.className = "sdoa-playground__body";

            // Left: form
            const formCol = document.createElement("div");
            formCol.className = "sdoa-playground__col sdoa-playground__col--form";
            const formTitle = document.createElement("div");
            formTitle.className   = "sdoa-playground__col-title";
            formTitle.textContent = "Input Parameters";
            this._formPanel = document.createElement("div");
            this._formPanel.className = "sdoa-playground__form-panel";
            const hint = document.createElement("p");
            hint.className   = "sdoa-playground__hint";
            hint.textContent = "Select a module and command to generate the input form.";
            this._formPanel.appendChild(hint);
            formCol.appendChild(formTitle);
            formCol.appendChild(this._formPanel);

            // Middle: result
            const resultCol = document.createElement("div");
            resultCol.className = "sdoa-playground__col sdoa-playground__col--result";
            const resultTitle = document.createElement("div");
            resultTitle.className   = "sdoa-playground__col-title";
            resultTitle.textContent = "Result";
            this._resultPanel = document.createElement("div");
            this._resultPanel.className = "sdoa-playground__result-panel";
            this._clearResult();
            resultCol.appendChild(resultTitle);
            resultCol.appendChild(this._resultPanel);

            // Right: history
            const historyCol = document.createElement("div");
            historyCol.className = "sdoa-playground__col sdoa-playground__col--history";
            const historyTitle = document.createElement("div");
            historyTitle.className   = "sdoa-playground__col-title";
            historyTitle.textContent = "History";
            this._historyPanel = document.createElement("div");
            this._historyPanel.className = "sdoa-playground__history-panel";
            this._renderHistory();
            historyCol.appendChild(historyTitle);
            historyCol.appendChild(this._historyPanel);

            body.appendChild(formCol);
            body.appendChild(resultCol);
            body.appendChild(historyCol);

            this._root.appendChild(topBar);
            this._root.appendChild(selectorRow);
            this._root.appendChild(body);
            this._container.appendChild(this._root);
        }

    };

    // ── Exports ───────────────────────────────────────────────

    const component = { MANIFEST, mixin: PlaygroundDomBuilderMixin };
    window.PlaygroundDomBuilder = component;
    if (window.ModuleLoader) window.ModuleLoader.register(MANIFEST, component);

})();
