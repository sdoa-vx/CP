// ============================================================
// Last modified: 2026-05-11
// ProjectManager.feature.js — SDOA v4 Feature | v4.2.0 | layer 1
// ============================================================

(function () {
    "use strict";

    const MANIFEST = {
        id: "ProjectManager.feature", type: "feature", layer: 1,
        runtime: "Browser", version: "4.2.1",
        "non-sdoa-compliant": true,
        requires: ["Modal.prim", "TabGroup.prim", "Form.prim", "List.prim", "Button.prim", "Toast.prim"],
        dataFiles: ["schemas/project_manager.schema.json"],
        lifecycle: ["init"],
        actions: { commands: { open: {} }, events: {}, accepts: {}, slots: {} },
        backendDeps: ["projects", "get_project_settings", "save_project_settings"],
        docs: { description: "Exceeds 500-line hard cap, pending refactor in Phase 5. Project Manager UI for editing project configurations.", author: "ProtoAI team", sdoa: "4.0.0" }
    };

    let _schema = null;
    let _modal = null;
    let _projects = [];
    let _selectedProject = null;
    let _projectSettings = {};
    let _dirty = false;
    let _activeTabId = "general";

    const RULE_SUGGESTIONS = [
        "Always use async/await over .then() chains.",
        "Prefer functional patterns over imperative loops.",
        "All functions must have JSDoc comments.",
        "Use TypeScript strict mode conventions.",
        "Follow SOLID principles in class design.",
        "Keep functions under 30 lines.",
        "Use descriptive variable names, no abbreviations.",
        "All API calls must have error handling.",
        "Write unit tests for all public methods.",
        "Use ES modules over CommonJS require().",
    ];

    const BEHAVIOR_OPTIONS = [
        { key: "route",    label: "Route",    desc: "Routes messages to the best model" },
        { key: "engineer", label: "Engineer",  desc: "Optimizes and refines prompts" },
        { key: "watch",    label: "Watch",     desc: "Monitors conversation for issues" },
        { key: "audit",    label: "Audit",     desc: "Reviews response quality" },
        { key: "advisor",  label: "Advisor",   desc: "Provides strategic guidance" },
        { key: "critic",   label: "Critic",    desc: "Offers constructive criticism" },
        { key: "friend",   label: "Friend",    desc: "Casual, supportive tone" },
        { key: "comic",    label: "Comic",     desc: "Humor and wit in commentary" },
    ];

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
                _renderTabContent(tabContent, tab);
            });
            tabBtn.className = "pm-tab-btn";
            tabBar.appendChild(tabBtn);
        });

        container.appendChild(tabBar);
        container.appendChild(tabContent);

        const activeTab = (_schema.tabs || []).find(t => t.id === _activeTabId) || _schema.tabs?.[0];
        if (activeTab) _renderTabContent(tabContent, activeTab);
    }

    function _renderTabContent(container, tab) {
        container.innerHTML = "";
        const fields = tab.fields || [];

        fields.forEach(field => {
            if (field.type === "heading") {
                const h = document.createElement("div");
                h.style.cssText = "margin-bottom:4px; margin-top:12px;";
                h.innerHTML = `<div style="font-size:13px; font-weight:600; color:var(--text-bright);">${field.label}</div>` +
                    (field.hint ? `<div style="font-size:11px; color:var(--text-dim); margin-top:2px;">${field.hint}</div>` : "");
                container.appendChild(h);
                return;
            }

            if (field.type === "separator") {
                const sep = document.createElement("hr");
                sep.style.cssText = "border:none; border-top:1px solid var(--border-subtle); margin:12px 0;";
                container.appendChild(sep);
                return;
            }

            const wrapper = document.createElement("div");
            wrapper.style.cssText = "margin-bottom:14px;";

            if (field.label && !["custom-preferred-models","custom-file-list","custom-rule-suggestions","custom-partner-behavior"].includes(field.type)) {
                const lbl = document.createElement("label");
                lbl.style.cssText = "display:block; font-size:11px; font-weight:600; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:5px;";
                lbl.textContent = field.label;
                wrapper.appendChild(lbl);
                if (field.hint) {
                    const hint = document.createElement("div");
                    hint.style.cssText = "font-size:11px; color:var(--text-dim); margin-bottom:5px;";
                    hint.textContent = field.hint;
                    wrapper.appendChild(hint);
                }
            }

            const val = _projectSettings[field.id] ?? (field.checked !== undefined ? field.checked : "");

            if (field.type === "text") {
                const inp = document.createElement("input");
                inp.type = "text";
                inp.className = "sdoa-input";
                inp.value = field.id === "projectPath"
                    ? ("[projects]/" + _selectedProject)
                    : (val || "");
                inp.readOnly = !!field.readonly;
                inp.placeholder = field.placeholder || "";
                inp.style.cssText = "width:100%; font-size:12px; padding:6px 8px;";
                if (!field.readonly) {
                    inp.addEventListener("input", () => { _projectSettings[field.id] = inp.value; _dirty = true; });
                }
                wrapper.appendChild(inp);

            } else if (field.type === "textarea") {
                const ta = document.createElement("textarea");
                ta.className = "sdoa-input";
                ta.value = val || "";
                ta.placeholder = field.placeholder || "";
                ta.rows = field.rows || 4;
                ta.style.cssText = "width:100%; font-size:12px; padding:6px 8px; resize:vertical;";
                ta.addEventListener("input", () => { _projectSettings[field.id] = ta.value; _dirty = true; });
                wrapper.appendChild(ta);

            } else if (field.type === "toggle") {
                const row = document.createElement("div");
                row.style.cssText = "display:flex; align-items:center; gap:10px;";
                const lbl2 = document.createElement("span");
                lbl2.style.cssText = "font-size:12px; color:var(--text);";
                lbl2.textContent = field.label || "";
                const tog = window.TogglePrim?.create({
                    checked: val === true || val === "true",
                    onChange: (v) => { _projectSettings[field.id] = v; _dirty = true; }
                }) || (() => {
                    const cb = document.createElement("input");
                    cb.type = "checkbox";
                    cb.checked = val === true;
                    cb.addEventListener("change", () => { _projectSettings[field.id] = cb.checked; _dirty = true; });
                    return cb;
                })();
                row.appendChild(tog);
                row.appendChild(lbl2);
                wrapper.appendChild(row);

            } else if (field.type === "select") {
                const sel = document.createElement("select");
                sel.className = "sdoa-input";
                sel.style.cssText = "width:100%; font-size:12px; padding:6px 8px;";

                const opts = field.dynamic === "models"
                    ? (_getModelOptions())
                    : (field.options || []);

                const blank = document.createElement("option");
                blank.value = "";
                blank.textContent = "— none —";
                sel.appendChild(blank);

                opts.forEach(opt => {
                    const o = document.createElement("option");
                    o.value = typeof opt === "string" ? opt : (opt.value || opt);
                    o.textContent = typeof opt === "string" ? opt : (opt.label || opt.value || opt);
                    if (o.value === (val || "")) o.selected = true;
                    sel.appendChild(o);
                });
                sel.addEventListener("change", () => { _projectSettings[field.id] = sel.value; _dirty = true; });
                wrapper.appendChild(sel);

            } else if (field.type === "folder-picker") {
                const lbl3 = document.createElement("label");
                lbl3.style.cssText = "display:block; font-size:11px; font-weight:600; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:5px;";
                lbl3.textContent = field.label || "Folder";
                wrapper.appendChild(lbl3);
                if (field.hint) {
                    const h2 = document.createElement("div");
                    h2.style.cssText = "font-size:11px; color:var(--text-dim); margin-bottom:5px;";
                    h2.textContent = field.hint;
                    wrapper.appendChild(h2);
                }
                const fpRow = document.createElement("div");
                fpRow.style.cssText = "display:flex; gap:6px; align-items:center;";
                const fpInp = document.createElement("input");
                fpInp.type = "text";
                fpInp.className = "sdoa-input";
                fpInp.value = val || "";
                fpInp.placeholder = "No folder selected";
                fpInp.style.cssText = "flex:1; font-size:12px; padding:6px 8px;";
                fpInp.addEventListener("input", () => { _projectSettings[field.id] = fpInp.value; _dirty = true; });
                const fpBtn = window.ButtonPrim.create({
                    label: "Browse…", variant: "secondary", size: "sm",
                    onClick: async () => {
                        if (window.__TAURI__?.dialog?.open) {
                            const chosen = await window.__TAURI__.dialog.open({ directory: true, title: "Select Context Folder" });
                            if (chosen) { fpInp.value = chosen; _projectSettings[field.id] = chosen; _dirty = true; }
                        } else {
                            const manual = prompt("Enter folder path:", fpInp.value);
                            if (manual !== null) { fpInp.value = manual; _projectSettings[field.id] = manual; _dirty = true; }
                        }
                    }
                });
                fpRow.appendChild(fpInp);
                fpRow.appendChild(fpBtn);
                wrapper.appendChild(fpRow);

            } else if (field.type === "custom-preferred-models") {
                wrapper.appendChild(_renderPreferredModels());

            } else if (field.type === "custom-file-list") {
                const lbl4 = document.createElement("label");
                lbl4.style.cssText = "display:block; font-size:11px; font-weight:600; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:5px;";
                lbl4.textContent = field.label || "Files";
                if (field.hint) lbl4.title = field.hint;
                wrapper.appendChild(lbl4);
                wrapper.appendChild(_renderFileList(field.id));

            } else if (field.type === "custom-rule-suggestions") {
                wrapper.appendChild(_renderRuleSuggestions());

            } else if (field.type === "custom-partner-behavior") {
                wrapper.appendChild(_renderPartnerBehavior());
            }

            container.appendChild(wrapper);
        });
    }

    // ── Custom Renderers ──────────────────────────────────────

    function _renderPreferredModels() {
        const container = document.createElement("div");
        container.style.cssText = "margin-bottom:8px;";

        const heading = document.createElement("div");
        heading.style.cssText = "font-size:11px; font-weight:600; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:8px;";
        heading.textContent = "Preferred Models";
        container.appendChild(heading);

        const list = document.createElement("div");
        list.id = "pmPreferredModelList";
        list.style.cssText = "display:flex; flex-direction:column; gap:4px; margin-bottom:8px;";

        const models = Array.isArray(_projectSettings.preferredModels) ? _projectSettings.preferredModels : [];

        const refresh = () => {
            list.innerHTML = "";
            const cur = Array.isArray(_projectSettings.preferredModels) ? _projectSettings.preferredModels : [];
            if (cur.length === 0) {
                const empty = document.createElement("div");
                empty.style.cssText = "font-size:12px; color:var(--text-dim); padding:6px 0;";
                empty.textContent = "No preferred models set. Add one below.";
                list.appendChild(empty);
            }
            cur.forEach((m, i) => {
                const chip = document.createElement("div");
                chip.style.cssText = "display:flex; align-items:center; gap:8px; padding:4px 8px; background:var(--bg-elevated-1); border-radius:6px; border:1px solid var(--border-subtle);";
                chip.innerHTML = `<span style="flex:1; font-size:12px; color:var(--text); font-family:var(--font-mono);">${m}</span>`;
                const rm = document.createElement("button");
                rm.textContent = "✕";
                rm.style.cssText = "background:none; border:none; color:var(--text-dim); cursor:pointer; font-size:11px; padding:0 2px;";
                rm.addEventListener("click", () => {
                    _projectSettings.preferredModels = cur.filter((_, j) => j !== i);
                    _dirty = true;
                    refresh();
                });
                chip.appendChild(rm);
                list.appendChild(chip);
            });
        };
        refresh();
        container.appendChild(list);

        // Add row
        const addRow = document.createElement("div");
        addRow.style.cssText = "display:flex; gap:6px; align-items:center;";
        const modelOptions = _getModelOptions();
        const sel = document.createElement("select");
        sel.className = "sdoa-input";
        sel.style.cssText = "flex:1; font-size:12px; padding:5px 8px;";
        const blank = document.createElement("option");
        blank.value = ""; blank.textContent = "Choose a model…";
        sel.appendChild(blank);
        modelOptions.forEach(m => {
            const o = document.createElement("option");
            o.value = m.value || m; o.textContent = m.label || m.value || m;
            sel.appendChild(o);
        });
        const addBtn = window.ButtonPrim.create({
            label: "+ Add", variant: "secondary", size: "sm",
            onClick: () => {
                if (!sel.value) return;
                if (!Array.isArray(_projectSettings.preferredModels)) _projectSettings.preferredModels = [];
                if (!_projectSettings.preferredModels.includes(sel.value)) {
                    _projectSettings.preferredModels.push(sel.value);
                    _dirty = true;
                    refresh();
                }
                sel.value = "";
            }
        });
        addRow.appendChild(sel);
        addRow.appendChild(addBtn);
        container.appendChild(addRow);
        return container;
    }

    function _renderFileList(fieldId) {
        const container = document.createElement("div");
        const files = Array.isArray(_projectSettings[fieldId]) ? _projectSettings[fieldId] : [];

        const list = document.createElement("div");
        list.style.cssText = "display:flex; flex-direction:column; gap:4px; margin-bottom:8px;";

        const refresh = () => {
            list.innerHTML = "";
            const cur = Array.isArray(_projectSettings[fieldId]) ? _projectSettings[fieldId] : [];
            cur.forEach((f, i) => {
                const row = document.createElement("div");
                row.style.cssText = "display:flex; align-items:center; gap:8px; padding:4px 8px; background:var(--bg-elevated-1); border-radius:6px;";
                row.innerHTML = `<span style="flex:1; font-size:11px; color:var(--text); font-family:var(--font-mono); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${f}</span>`;
                const rm = document.createElement("button");
                rm.textContent = "✕";
                rm.style.cssText = "background:none; border:none; color:var(--text-dim); cursor:pointer; font-size:11px;";
                rm.addEventListener("click", () => {
                    _projectSettings[fieldId] = cur.filter((_, j) => j !== i);
                    _dirty = true;
                    refresh();
                });
                row.appendChild(rm);
                list.appendChild(row);
            });
        };
        refresh();
        container.appendChild(list);

        const addRow = document.createElement("div");
        addRow.style.cssText = "display:flex; gap:6px;";
        const inp = document.createElement("input");
        inp.type = "text"; inp.className = "sdoa-input";
        inp.placeholder = "File path or glob…";
        inp.style.cssText = "flex:1; font-size:12px; padding:5px 8px;";
        const browseBtn = window.ButtonPrim.create({
            label: "Browse", variant: "ghost", size: "sm",
            onClick: async () => {
                if (window.__TAURI__?.dialog?.open) {
                    const chosen = await window.__TAURI__.dialog.open({ multiple: true, title: "Select Files" });
                    if (chosen) {
                        const arr = Array.isArray(chosen) ? chosen : [chosen];
                        if (!Array.isArray(_projectSettings[fieldId])) _projectSettings[fieldId] = [];
                        arr.forEach(f => { if (!_projectSettings[fieldId].includes(f)) _projectSettings[fieldId].push(f); });
                        _dirty = true;
                        refresh();
                    }
                } else if (inp.value) {
                    if (!Array.isArray(_projectSettings[fieldId])) _projectSettings[fieldId] = [];
                    if (!_projectSettings[fieldId].includes(inp.value)) { _projectSettings[fieldId].push(inp.value); _dirty = true; refresh(); }
                    inp.value = "";
                }
            }
        });
        const addBtn = window.ButtonPrim.create({
            label: "+ Add", variant: "secondary", size: "sm",
            onClick: () => {
                if (!inp.value.trim()) return;
                if (!Array.isArray(_projectSettings[fieldId])) _projectSettings[fieldId] = [];
                if (!_projectSettings[fieldId].includes(inp.value.trim())) {
                    _projectSettings[fieldId].push(inp.value.trim());
                    _dirty = true;
                    refresh();
                }
                inp.value = "";
            }
        });
        addRow.appendChild(inp);
        addRow.appendChild(browseBtn);
        addRow.appendChild(addBtn);
        container.appendChild(addRow);
        return container;
    }

    function _renderRuleSuggestions() {
        const container = document.createElement("div");

        const heading = document.createElement("div");
        heading.style.cssText = "font-size:11px; font-weight:600; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:8px;";
        heading.textContent = "Quick Add Rules";
        container.appendChild(heading);

        const chips = document.createElement("div");
        chips.style.cssText = "display:flex; flex-wrap:wrap; gap:6px;";

        RULE_SUGGESTIONS.forEach(rule => {
            const chip = document.createElement("button");
            chip.textContent = "+" + " " + rule.slice(0, 38) + (rule.length > 38 ? "…" : "");
            chip.title = rule;
            chip.style.cssText = "font-size:11px; padding:3px 8px; border-radius:12px; border:1px solid var(--border-subtle); background:var(--bg-elevated-1); color:var(--text-dim); cursor:pointer; text-align:left; transition:all 0.1s;";
            chip.addEventListener("mouseenter", () => { chip.style.borderColor = "var(--accent)"; chip.style.color = "var(--text)"; });
            chip.addEventListener("mouseleave", () => { chip.style.borderColor = "var(--border-subtle)"; chip.style.color = "var(--text-dim)"; });
            chip.addEventListener("click", () => {
                const cur = _projectSettings.customRules || "";
                _projectSettings.customRules = cur ? (cur + "\n" + rule) : rule;
                _dirty = true;
                // Update textarea if visible
                const ta = document.querySelector(`[data-field-id="customRules"]`);
                if (ta) ta.value = _projectSettings.customRules;
                window.ToastPrim?.show("Rule added", "success");
            });
            chips.appendChild(chip);
        });

        container.appendChild(chips);
        return container;
    }

    function _renderPartnerBehavior() {
        const container = document.createElement("div");
        const heading = document.createElement("div");
        heading.style.cssText = "font-size:11px; font-weight:600; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:8px;";
        heading.textContent = "Partner Behavior";
        container.appendChild(heading);

        const grid = document.createElement("div");
        grid.style.cssText = "display:grid; grid-template-columns:repeat(auto-fill, minmax(140px,1fr)); gap:8px; margin-bottom:12px;";

        const activeBehaviors = Array.isArray(_projectSettings.partnerBehavior) ? _projectSettings.partnerBehavior : [];

        BEHAVIOR_OPTIONS.forEach(opt => {
            const card = document.createElement("div");
            const isActive = activeBehaviors.includes(opt.key);
            card.style.cssText = `
                padding:8px 10px; border-radius:8px; cursor:pointer;
                border:1px solid ${isActive ? "var(--accent)" : "var(--border-subtle)"};
                background:${isActive ? "rgba(99,102,241,0.12)" : "var(--bg-elevated-1)"};
                transition:all 0.15s;
            `;
            card.innerHTML = `<div style="font-size:12px; font-weight:600; color:${isActive ? "var(--accent)" : "var(--text)"};">${opt.label}</div><div style="font-size:11px; color:var(--text-dim); margin-top:2px;">${opt.desc}</div>`;
            card.addEventListener("click", () => {
                if (!Array.isArray(_projectSettings.partnerBehavior)) _projectSettings.partnerBehavior = [];
                const idx = _projectSettings.partnerBehavior.indexOf(opt.key);
                if (idx === -1) _projectSettings.partnerBehavior.push(opt.key);
                else _projectSettings.partnerBehavior.splice(idx, 1);
                _dirty = true;
                // Re-render
                const parent = container.parentElement;
                if (parent) {
                    const newEl = _renderPartnerBehavior();
                    parent.replaceChild(newEl, container);
                }
            });
            grid.appendChild(card);
        });

        container.appendChild(grid);
        return container;
    }

    function _getModelOptions() {
        // Pull from global model inventory if available
        const inventory = window.modelManager?.getActiveModels?.() || [];
        if (inventory.length > 0) return inventory.map(m => ({ value: m, label: m }));
        // Fallback: try to read from ModelManagerFeature
        if (window.ModelManagerFeature?.getActiveModels) {
            return window.ModelManagerFeature.getActiveModels().map(m => ({ value: m, label: m }));
        }
        return [];
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
