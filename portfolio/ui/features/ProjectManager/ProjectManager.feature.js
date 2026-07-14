// ============================================================
// ProjectManager.feature.js — SDOA v5 Feature | v5.0.0 | layer 1
// Last modified: 2026-07-14
// Changes vs 4.2.1:
//   - Phase 5 (oversized-file split): extracted per-tab field
//     rendering into two sibling components:
//       ProjectManagerFieldRenderer.component.js  (standard field types
//         + dispatch for custom-* types)
//       ProjectManagerCustomFields.component.js   (the four custom-*
//         field renderers, RULE_SUGGESTIONS / BEHAVIOR_OPTIONS tables,
//         and the shared getModelOptions() helper)
//     File was 690 lines (flagged non-sdoa-compliant purely for size);
//     now well under the Layer 1 cap and fully manifest-compliant.
//     Both new components take an explicit `ctx` object
//     ({ getSettings, markDirty, selectedProject }) instead of closing
//     over this file's private _projectSettings/_dirty/_selectedProject
//     — a second IIFE has no way to reach into another IIFE's `let`
//     variables, so state access had to become explicit at the split
//     boundary. _buildCtx() below is the only new code this required.
// ============================================================

(function () {
    "use strict";

    const MANIFEST = {
        id: "ProjectManager.feature", type: "feature", layer: 1,
        runtime: "Browser", version: "5.0.0",
        capabilities: ["projectManager.open", "projectManager.save"],
        requires: [
            "Modal.prim", "TabGroup.prim", "Form.prim", "List.prim", "Button.prim", "Toast.prim",
            "ProjectManagerFieldRenderer.component", "ProjectManagerCustomFields.component"
        ],
        dependencies: [
            "Modal.prim", "TabGroup.prim", "Form.prim", "List.prim", "Button.prim", "Toast.prim",
            "ProjectManagerFieldRenderer.component", "ProjectManagerCustomFields.component"
        ],
        dataFiles: ["schemas/project_manager.schema.json"],
        lifecycle: ["init"],
        actions: { commands: { open: {} }, events: {}, accepts: {}, slots: {} },
        backendDeps: ["projects", "get_project_settings", "save_project_settings"],
        docs: { description: "Project Manager UI for editing project configurations: sidebar project list + tab-driven editor. Per-tab field rendering is delegated to ProjectManagerFieldRenderer.component (standard field types) and ProjectManagerCustomFields.component (preferred models, file list, rule suggestions, partner behavior).", author: "ProtoAI team", sdoa: "5.0.0" },
        last_modified: "2026-07-14T00:00:00Z"
    };

    let _schema = null;
    let _modal = null;
    let _projects = [];
    let _selectedProject = null;
    let _projectSettings = {};
    let _dirty = false;
    let _activeTabId = "general";

    // Passed to the split-out field renderers so they can read/write this
    // file's private state without closing over it directly (see header).
    function _buildCtx() {
        return {
            getSettings:     () => _projectSettings,
            markDirty:       () => { _dirty = true; },
            selectedProject: () => _selectedProject
        };
    }

    async function init() {
        try {
            const res = await fetch("/data/schemas/project_manager.schema.json");
            if (res.ok) _schema = await res.json();
            const btn = document.getElementById("manageProjectsBtn");
            if (btn) btn.addEventListener("click", open);
            window.openProjectManager = open;
            window.closeProjectManager = () => { if (_modal) window.ModalPrim.close(_modal); };
        } catch (err) {
            console.error("[ProjectManager.feature] Failed to load schema:", err);
        }
    }

    async function open() {
        if (!_schema) {
            window.ToastPrim.show("Project Manager schema not loaded.", "error");
            return;
        }

        try {
            const res = await window.backendConnector.runWorkflow("projects");
            _projects = res?.projects || res?.data?.projects || [];
        } catch (e) {
            console.warn("Failed to list projects for PM", e);
            _projects = ["default"];
        }

        _selectedProject = _projects[0] || null;
        _dirty = false;
        _projectSettings = {};

        if (_selectedProject) await _loadProjectSettings(_selectedProject);

        _modal = window.ModalPrim.create({
            title: "Project Manager",
            size: "xl",
            onClose: () => { _modal = null; }
        });

        const layout = document.createElement("div");
        layout.style.cssText = "display:flex; height:520px;";

        // ── Sidebar ───────────────────────────────────────────
        const sidebar = document.createElement("div");
        sidebar.style.cssText = "width:240px; border-right:1px solid var(--border-subtle); display:flex; flex-direction:column; flex-shrink:0;";

        const searchBox = document.createElement("div");
        searchBox.style.cssText = "padding:8px;";
        searchBox.innerHTML = `<input type="text" id="pmSearch" class="sdoa-input" placeholder="Search projects…" style="width:100%; font-size:12px; padding:6px 8px;" />`;
        sidebar.appendChild(searchBox);

        const sidebarTitle = document.createElement("div");
        sidebarTitle.style.cssText = "padding:4px 12px; font-size:10px; text-transform:uppercase; color:var(--text-dim); font-weight:600;";
        sidebarTitle.textContent = "Projects";
        sidebar.appendChild(sidebarTitle);

        const listContainer = document.createElement("div");
        listContainer.id = "pmProjectList";
        listContainer.style.cssText = "flex:1; overflow-y:auto;";
        sidebar.appendChild(listContainer);

        const sidebarFooter = document.createElement("div");
        sidebarFooter.style.cssText = "padding:8px; border-top:1px solid var(--border-subtle); display:flex; gap:4px; flex-wrap:wrap;";
        const importBtn = window.ButtonPrim.create({
            label: "Import", variant: "ghost", size: "sm",
            onClick: async () => {
                try {
                    let sourcePath = "";
                    if (window.__TAURI__?.dialog?.open) {
                        sourcePath = await window.__TAURI__.dialog.open({ directory: true, title: "Select Project Folder" });
                    } else {
                        sourcePath = prompt("Enter full path of the project folder to import:");
                    }
                    if (!sourcePath) return;
                    const projectName = prompt("Project name in ProtoAI:", sourcePath.split(/[\\/]/).pop());
                    if (!projectName) return;
                    window.ToastPrim.show(`Importing ${projectName}...`, "info");
                    await window.backendConnector.runWorkflow("import_project", { sourcePath, projectName });
                    window.ToastPrim.show("Project imported!", "success");
                    if (window.AppShellFeature) await window.AppShellFeature.loadProjects();
                    open();
                } catch (err) {
                    window.ToastPrim.show("Import failed: " + (err.message || err), "error");
                }
            }
        });
        const refreshBtn = window.ButtonPrim.create({ label: "Refresh", variant: "ghost", size: "sm", onClick: () => open() });
        sidebarFooter.appendChild(importBtn);
        sidebarFooter.appendChild(refreshBtn);
        sidebar.appendChild(sidebarFooter);

        // ── Editor ─────────────────────────────────────────────
        const editorContainer = document.createElement("div");
        editorContainer.id = "pmEditorContainer";
        editorContainer.style.cssText = "flex:1; display:flex; flex-direction:column; overflow:hidden; min-width:0;";

        layout.appendChild(sidebar);
        layout.appendChild(editorContainer);
        _modal._sdoaBody.appendChild(layout);
        _modal._sdoaBody.style.padding = "0";

        _renderProjectList(listContainer, editorContainer);
        _renderEditor(editorContainer);

        searchBox.querySelector("#pmSearch")?.addEventListener("input", (e) => {
            _renderProjectList(listContainer, editorContainer, e.target.value);
        });

        window.ModalPrim.open(_modal);
    }

    // ── Project List ──────────────────────────────────────────
    function _renderProjectList(container, editorContainer, filter = "") {
        container.innerHTML = "";
        const lowerFilter = filter.toLowerCase();
        const filtered = _projects.filter(p => p.toLowerCase().includes(lowerFilter));

        filtered.forEach(p => {
            const item = document.createElement("div");
            item.className = "pm-project-item" + (p === _selectedProject ? " selected" : "");
            item.style.cssText = `
                padding:8px 12px; cursor:pointer; font-size:13px;
                color:${p === _selectedProject ? "var(--text-bright)" : "var(--text)"};
                background:${p === _selectedProject ? "var(--bg-elevated-1)" : "transparent"};
                border-left: 3px solid ${p === _selectedProject ? "var(--accent)" : "transparent"};
                transition: all 0.1s;
            `;
            item.textContent = p;
            item.addEventListener("click", async () => {
                if (_dirty && !confirm("Discard unsaved changes?")) return;
                _selectedProject = p;
                _dirty = false;
                await _loadProjectSettings(p);
                _renderProjectList(container, editorContainer, filter);
                _renderEditor(editorContainer);
            });
            container.appendChild(item);
        });

        if (filtered.length === 0) {
            const empty = document.createElement("div");
            empty.style.cssText = "padding:12px; font-size:12px; color:var(--text-dim);";
            empty.textContent = "No projects found.";
            container.appendChild(empty);
        }
    }

    // ── Editor (tab-driven) ───────────────────────────────────
    function _renderEditor(container) {
        container.innerHTML = "";
        if (!_selectedProject) {
            container.innerHTML = `<div style="padding:24px; color:var(--text-dim); font-size:13px;">Select a project to configure.</div>`;
            return;
        }

        // Header
        const header = document.createElement("div");
        header.style.cssText = "padding:12px 16px; border-bottom:1px solid var(--border-subtle); display:flex; align-items:center; justify-content:space-between; flex-shrink:0;";
        header.innerHTML = `<span style="font-size:14px; font-weight:600; color:var(--text-bright);">${_selectedProject}</span>`;

        const saveBtn = window.ButtonPrim.create({
            label: "Save Changes", variant: "primary", size: "sm",
            onClick: () => _saveCurrentProject()
        });
        header.appendChild(saveBtn);
        container.appendChild(header);

        // Tabs
        const tabBar = document.createElement("div");
        tabBar.style.cssText = "display:flex; gap:0; border-bottom:1px solid var(--border-subtle); flex-shrink:0; overflow-x:auto;";

        const tabContent = document.createElement("div");
        tabContent.style.cssText = "flex:1; overflow:auto; padding:16px;";

        const ctx = _buildCtx();

        (_schema.tabs || []).forEach(tab => {
            const tabBtn = document.createElement("button");
            tabBtn.style.cssText = `
                padding:8px 14px; font-size:12px; font-weight:500; border:none; cursor:pointer;
                background:transparent; color:${tab.id === _activeTabId ? "var(--text-bright)" : "var(--text-dim)"};
                border-bottom:2px solid ${tab.id === _activeTabId ? "var(--accent)" : "transparent"};
                transition:all 0.15s; white-space:nowrap;
            `;
            tabBtn.textContent = tab.label;
            tabBtn.addEventListener("click", () => {
                _activeTabId = tab.id;
                container.querySelectorAll(".pm-tab-btn").forEach(b => {
                    b.style.color = "var(--text-dim)";
                    b.style.borderBottom = "2px solid transparent";
                });
                tabBtn.style.color = "var(--text-bright)";
                tabBtn.style.borderBottom = "2px solid var(--accent)";
                window.ProjectManagerFieldRenderer.renderTabContent(tabContent, tab, ctx);
            });
            tabBtn.className = "pm-tab-btn";
            tabBar.appendChild(tabBtn);
        });

        container.appendChild(tabBar);
        container.appendChild(tabContent);

        const activeTab = (_schema.tabs || []).find(t => t.id === _activeTabId) || _schema.tabs?.[0];
        if (activeTab) window.ProjectManagerFieldRenderer.renderTabContent(tabContent, activeTab, ctx);
    }

    // ── Persistence ───────────────────────────────────────────
    async function _loadProjectSettings(project) {
        try {
            const res = await window.backendConnector.runWorkflow("get_project_settings", { project });
            _projectSettings = (res?.ok && res?.settings) ? res.settings : {};
        } catch (e) {
            _projectSettings = {};
        }
    }

    async function _saveCurrentProject() {
        if (!_selectedProject) return;
        try {
            await window.backendConnector.runWorkflow("save_project_settings", {
                project: _selectedProject,
                settings: _projectSettings
            });
            _dirty = false;
            window.ToastPrim?.show("Project settings saved", "success");
        } catch (err) {
            window.ToastPrim?.show("Save failed: " + (err.message || err), "error");
        }
    }

    // ── Module Registration ───────────────────────────────────
    window.ModuleLoader?.register(MANIFEST, { init });
    window.ProjectManagerFeature = { open };

})();
