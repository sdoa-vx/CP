// ============================================================
// AppShellSplitView.component.js — SDOA v5 Component | layer 1
// Updated: 2026-07-14
// Extracted from AppShell.feature.js (Phase 5 — oversized-file split).
// Carries the split-view subsystem: toggling the right pane, the
// files/editor/terminal mode tabs, mounting FileExplorer/Monaco/Terminal
// into the right pane, and tearing it down.
//
// AppShell.feature.js's _splitActive/_splitMode/_monacoEditor are its
// own private `let` variables that are also read from two OTHER places
// in the core (the app:projectSelected EventBus listener and the
// quick-swap file-open listener), so the state itself stays in the
// core and this file takes an explicit ctx object ({ getSplitActive,
// setSplitActive, getSplitMode, setSplitMode, getMonacoEditor,
// setMonacoEditor }) — same pattern used for ProjectManager/Chat/
// SplashScreen earlier in this phase.
// ============================================================

(function () {
    "use strict";

    const MANIFEST = {
        id: "AppShellSplitView.component", type: "component", layer: 1,
        runtime: "Browser", version: "1.0.0",
        requires: [],
        dependencies: [],
        docs: { description: "AppShell.feature.js's split-view subsystem: toggleSplitView(ctx), renderRightModeTabs(ctx), mountRightPane(mode, ctx), clearRightPane(ctx). Takes an explicit ctx object for AppShell.feature.js's private _splitActive/_splitMode/_monacoEditor state (see file header). Extracted from AppShell.feature.js as part of the Phase 5 oversized-file split.", author: "ProtoAI Team" }
    };

    function toggleSplitView(ctx) {
        const active = !ctx.getSplitActive();
        ctx.setSplitActive(active);

        const workspace = document.getElementById("workspace");
        const paneRight = document.getElementById("pane-right");
        const btn       = document.getElementById("splitToggleBtn");

        if (workspace) workspace.classList.toggle("split-active", active);
        if (paneRight) paneRight.classList.toggle("split-visible", active);
        if (btn) {
            btn.title = active ? "Close split view (Ctrl+Shift+E)" : "Toggle split view (Ctrl+Shift+E)";
            btn.classList.toggle("active", active);
        }

        if (active) {
            renderRightModeTabs(ctx);
            mountRightPane(ctx.getSplitMode(), ctx);
        } else {
            clearRightPane(ctx);
            window.ToastPrim?.show("Split view closed", "info");
        }
    }

    function renderRightModeTabs(ctx) {
        const bar = document.getElementById("rightModeTabs");
        if (!bar) return;
        const tabs = [
            { id: "files",    label: "📁 Files"    },
            { id: "editor",   label: "📝 Editor"   },
            { id: "terminal", label: "📟 Terminal" }
        ];
        const splitMode = ctx.getSplitMode();
        bar.innerHTML = tabs.map(t => {
            const active = t.id === splitMode;
            return `<button class="sdoa-tabgroup__tab${active ? " sdoa-tabgroup__tab--active" : ""}"
                data-right-mode="${t.id}" style="font-size:12px; padding:4px 12px;">${t.label}</button>`;
        }).join("");
        bar.querySelectorAll("[data-right-mode]").forEach(btn => {
            btn.addEventListener("click", () => {
                ctx.setSplitMode(btn.dataset.rightMode);
                renderRightModeTabs(ctx);
                mountRightPane(ctx.getSplitMode(), ctx);
            });
        });
    }

    function mountRightPane(mode, ctx) {
        const content = document.getElementById("rightPaneContent");
        if (!content) return;

        // Dispose Monaco if active
        const existingEditor = ctx.getMonacoEditor();
        if (existingEditor) {
            window.CodeEditorPrim?.dispose(existingEditor);
            ctx.setMonacoEditor(null);
        }
        // Unmount terminal if active
        if (window.TerminalFeature?.unmount) {
            window.TerminalFeature.unmount();
        }

        if (mode === "files") {
            content.innerHTML = "";
            if (window.FileExplorerFeature?.mount) {
                window.FileExplorerFeature.mount(content);
                if (window.currentProject) window.FileExplorerFeature.setRootPath?.(window.currentProject);
                window.ToastPrim?.show("Split view — File Explorer", "info");
            } else {
                content.innerHTML = `<div style="padding:20px;color:var(--text-dim);text-align:center;margin-top:60px;font-size:13px;">File Explorer</div>`;
            }
        } else if (mode === "editor") {
            content.innerHTML = "";
            content.style.cssText = "position:relative; display:flex; flex-direction:column; height:100%;";

            // Toolbar: language selector + file name indicator
            const toolbar = document.createElement("div");
            toolbar.style.cssText = "display:flex; align-items:center; gap:8px; padding:6px 10px; background:var(--bg-deep); border-bottom:1px solid var(--border-subtle); flex-shrink:0;";
            toolbar.innerHTML = `
                <span id="monacoFileLabel" style="font-size:11px; color:var(--text-dim); flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">No file open</span>
                <select id="monacoLangSelect" class="sdoa-select" style="font-size:11px; padding:2px 6px; height:24px; width:120px;">
                    <option value="javascript">JavaScript</option>
                    <option value="typescript">TypeScript</option>
                    <option value="python">Python</option>
                    <option value="rust">Rust</option>
                    <option value="json">JSON</option>
                    <option value="html">HTML</option>
                    <option value="css">CSS</option>
                    <option value="markdown">Markdown</option>
                    <option value="plaintext">Plain Text</option>
                </select>
                <button id="monacoCopyBtn" class="sdoa-button sdoa-button--ghost sdoa-button--sm" style="font-size:11px; padding:2px 8px; height:24px;">Copy</button>
                <button id="monacoClearBtn" class="sdoa-button sdoa-button--ghost sdoa-button--sm" style="font-size:11px; padding:2px 8px; height:24px;">Clear</button>
            `;
            content.appendChild(toolbar);

            const editorDiv = document.createElement("div");
            editorDiv.id = "monacoEditorMount";
            editorDiv.style.cssText = "flex:1; min-height:0;";
            content.appendChild(editorDiv);

            // Create editor asynchronously
            (async () => {
                const editor = await window.CodeEditorPrim?.create(editorDiv, {
                    language: "javascript",
                    value: "// ProtoAI Code Editor\n// Open a file via the File Explorer or paste code here.\n",
                });
                ctx.setMonacoEditor(editor);
                window.ToastPrim?.show("Split view — Monaco Editor", "info");

                // Wire toolbar buttons
                const langSel = content.querySelector("#monacoLangSelect");
                langSel?.addEventListener("change", () => {
                    window.CodeEditorPrim?.setLanguage(ctx.getMonacoEditor(), langSel.value);
                });

                content.querySelector("#monacoCopyBtn")?.addEventListener("click", () => {
                    const val = window.CodeEditorPrim?.getValue(ctx.getMonacoEditor()) || "";
                    navigator.clipboard?.writeText(val);
                    window.ToastPrim?.show("Copied to clipboard", "info");
                });

                content.querySelector("#monacoClearBtn")?.addEventListener("click", () => {
                    window.CodeEditorPrim?.setValue(ctx.getMonacoEditor(), "");
                });
            })();
        } else if (mode === "terminal") {
            content.innerHTML = "";
            content.style.cssText = "position:relative; display:flex; flex-direction:column; height:100%;";
            if (window.TerminalFeature?.mount) {
                window.TerminalFeature.mount({ container: content, shell: "powershell" });
                window.ToastPrim?.show("Split view — Terminal", "info");
            } else {
                content.innerHTML = `<div style="padding:20px;color:var(--text-dim);text-align:center;margin-top:60px;font-size:13px;">Terminal module not loaded</div>`;
            }
        }
    }

    function clearRightPane(ctx) {
        const content = document.getElementById("rightPaneContent");
        const existingEditor = ctx.getMonacoEditor();
        if (existingEditor) {
            window.CodeEditorPrim?.dispose(existingEditor);
            ctx.setMonacoEditor(null);
        }
        if (window.TerminalFeature?.unmount) {
            window.TerminalFeature.unmount();
        }
        if (content) content.innerHTML = "";
        const bar = document.getElementById("rightModeTabs");
        if (bar) bar.innerHTML = "";
    }

    // ── Exports ───────────────────────────────────────────────

    const component = { MANIFEST, toggleSplitView, renderRightModeTabs, mountRightPane, clearRightPane };
    window.AppShellSplitView = component;
    if (window.ModuleLoader) window.ModuleLoader.register(MANIFEST, component);

})();
