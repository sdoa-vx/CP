// ============================================================
// AppShellQuickSwap.utility.js — SDOA v5 Utility | layer 2
// Updated: 2026-07-14
// Extracted from AppShell.feature.js (Phase 5 — oversized-file split).
// Carries the Quick Swap engine selector: populating the dynamic model
// dropdown grouped by provider, wiring the search filter and Apply
// button, and the FileExplorer-opens-a-file listener that pipes text
// into the Monaco editor when split view is active in editor mode.
//
// updateQuickSwap() has no dependency on AppShell.feature.js's private
// state. wireQuickSwap(ctx) DOES need read access to the core's private
// _splitActive/_splitMode/_monacoEditor (to know whether to route an
// opened file into Monaco), so it takes the same ctx shape as
// AppShellSplitView.component.js ({ getSplitActive, getSplitMode,
// getMonacoEditor } — setters unused here).
// ============================================================

(function () {
    "use strict";

    const MANIFEST = {
        id: "AppShellQuickSwap.utility", type: "utility", layer: 2,
        runtime: "Browser", version: "1.0.0",
        requires: [],
        dependencies: [],
        docs: { description: "AppShell.feature.js's Quick Swap engine selector: updateQuickSwap() (populates the dynamic model dropdown) and wireQuickSwap(ctx) (search filter, Apply button, and the filemanager:fileOpened -> Monaco listener). Takes an explicit ctx object for read access to AppShell.feature.js's private split-view state (see file header). Extracted from AppShell.feature.js as part of the Phase 5 oversized-file split.", author: "ProtoAI Team" }
    };

    async function updateQuickSwap() {
        const select = document.getElementById("otfmsEngineSelect");
        if (!select) return;

        try {
            const res = await window.backendConnector?.runWorkflow("get_model_inventory");
            const inventory = res?.models || res?.data?.models || [];

            let html = `<option value="">— Profile Default —</option>`;

            // Group by provider
            const providers = {};
            inventory.forEach(m => {
                const p = m.provider || "Local";
                if (!providers[p]) providers[p] = [];
                providers[p].push(m);
            });

            for (const [p, models] of Object.entries(providers)) {
                html += `<optgroup label="${p}">`;
                models.forEach(m => {
                    html += `<option value="${m.id}">${m.name || m.id}</option>`;
                });
                html += `</optgroup>`;
            }

            select.innerHTML = html;

            // Restore saved
            const saved = localStorage.getItem("protoai:quickswap:engine") || "";
            if (select.querySelector(`option[value="${CSS.escape(saved)}"]`)) {
                select.value = saved;
            }
        } catch (err) {
            console.warn("[AppShell] Failed to load dynamic models for quick swap:", err);
        }
    }

    async function wireQuickSwap(ctx) {
        const select   = document.getElementById("otfmsEngineSelect");
        const applyBtn = document.getElementById("applyEngineBtn");
        if (!select || !applyBtn) return;

        // Add search filter for models
        const searchInput = document.createElement("input");
        searchInput.type = "text";
        searchInput.className = "sdoa-input";
        searchInput.placeholder = "Filter engines…";
        searchInput.style.cssText = "font-size:11px; padding:4px 8px; margin-bottom:4px;";
        select.parentElement.insertBefore(searchInput, select);

        searchInput.addEventListener("input", (e) => {
            const filter = e.target.value.toLowerCase();
            select.querySelectorAll("option").forEach(opt => {
                if (!opt.value) return;
                opt.style.display = opt.textContent.toLowerCase().includes(filter) ? "" : "none";
            });
            select.querySelectorAll("optgroup").forEach(group => {
                const hasVisible = Array.from(group.querySelectorAll("option")).some(o => o.style.display !== "none");
                group.style.display = hasVisible ? "" : "none";
            });
        });

        await updateQuickSwap();

        applyBtn.addEventListener("click", () => {
            const model = select.value;
            window.quickSwapEngine = model || undefined;
            localStorage.setItem("protoai:quickswap:engine", model);

            const opt = select.querySelector(`option[value="${CSS.escape(model)}"]`);
            const label = opt ? opt.textContent : model;

            if (model) {
                window.ToastPrim?.show(`Quick Swap active: ${label}`, "info");
            } else {
                window.ToastPrim?.show("Quick Swap cleared — using profile default.", "info");
            }

            applyBtn.textContent = model ? "✓ Applied" : "Apply to Chat";
            setTimeout(() => { applyBtn.textContent = "Apply to Chat"; }, 2000);
        });

        window.EventBus?.on("models:updated", () => updateQuickSwap());

        // When FileExplorer opens a file, load it into Monaco if editor pane is active
        window.EventBus?.on("filemanager:fileOpened", async ({ path }) => {
            if (!ctx.getSplitActive() || ctx.getSplitMode() !== "editor" || !path) return;
            try {
                const res = await window.backendConnector?.runWorkflow("fs_read_file", { path });
                const text = res?.content || res?.data?.content || "";
                const monacoEditor = ctx.getMonacoEditor();
                if (monacoEditor) {
                    window.CodeEditorPrim?.setValue(monacoEditor, text);
                    const ext = path.split(".").pop().toLowerCase();
                    const langMap = { js:"javascript", ts:"typescript", py:"python", rs:"rust",
                                      json:"json", html:"html", css:"css", md:"markdown" };
                    const lang = langMap[ext] || "plaintext";
                    window.CodeEditorPrim?.setLanguage(monacoEditor, lang);
                    const label = document.getElementById("monacoFileLabel");
                    if (label) label.textContent = path.split(/[\/]/).pop();
                    const sel = document.getElementById("monacoLangSelect");
                    if (sel) sel.value = lang;
                }
            } catch (err) {
                window.ToastPrim?.show("Could not load file: " + (err.message || err), "error");
            }
        });
    }

    // ── Exports ───────────────────────────────────────────────

    const component = { MANIFEST, updateQuickSwap, wireQuickSwap };
    window.AppShellQuickSwap = component;
    if (window.ModuleLoader) window.ModuleLoader.register(MANIFEST, component);

})();
