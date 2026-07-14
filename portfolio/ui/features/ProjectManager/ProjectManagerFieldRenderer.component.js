// ============================================================
// ProjectManagerFieldRenderer.component.js — SDOA v5 Component | layer 1
// Updated: 2026-07-14
// Extracted from ProjectManager.feature.js (Phase 5 — oversized-file
// split). Renders a tab's field list: headings/separators and the
// standard field types (text, textarea, toggle, select, folder-picker)
// inline, and delegates custom-* field types to
// window.ProjectManagerCustomFields.render().
//
// Like ProjectManagerCustomFields.component.js, this takes a `ctx`
// object instead of closing over ProjectManager.feature.js's private
// state — see that file's header comment for why.
// ============================================================

(function () {
    "use strict";

    const MANIFEST = {
        id: "ProjectManagerFieldRenderer.component", type: "component", layer: 1,
        runtime: "Browser", version: "1.0.0",
        requires: ["Button.prim", "ProjectManagerCustomFields.component"],
        dependencies: ["ProjectManagerCustomFields.component"],
        docs: { description: "Renders ProjectManager.feature.js's per-tab field list — heading/separator/text/textarea/toggle/select/folder-picker inline, custom-* types delegated to ProjectManagerCustomFields.render(). Extracted from ProjectManager.feature.js as part of the Phase 5 oversized-file split.", author: "ProtoAI team" }
    };

    const CUSTOM_TYPES = ["custom-preferred-models", "custom-file-list", "custom-rule-suggestions", "custom-partner-behavior"];

    // ── Tab Content Renderer ───────────────────────────────────

    function renderTabContent(container, tab, ctx) {
        container.innerHTML = "";
        const settings = ctx.getSettings();
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

            if (field.label && !CUSTOM_TYPES.includes(field.type)) {
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

            const val = settings[field.id] ?? (field.checked !== undefined ? field.checked : "");

            if (field.type === "text") {
                const inp = document.createElement("input");
                inp.type = "text";
                inp.className = "sdoa-input";
                inp.value = field.id === "projectPath"
                    ? ("[projects]/" + ctx.selectedProject())
                    : (val || "");
                inp.readOnly = !!field.readonly;
                inp.placeholder = field.placeholder || "";
                inp.style.cssText = "width:100%; font-size:12px; padding:6px 8px;";
                if (!field.readonly) {
                    inp.addEventListener("input", () => { settings[field.id] = inp.value; ctx.markDirty(); });
                }
                wrapper.appendChild(inp);

            } else if (field.type === "textarea") {
                const ta = document.createElement("textarea");
                ta.className = "sdoa-input";
                ta.value = val || "";
                ta.placeholder = field.placeholder || "";
                ta.rows = field.rows || 4;
                ta.style.cssText = "width:100%; font-size:12px; padding:6px 8px; resize:vertical;";
                ta.addEventListener("input", () => { settings[field.id] = ta.value; ctx.markDirty(); });
                wrapper.appendChild(ta);

            } else if (field.type === "toggle") {
                const row = document.createElement("div");
                row.style.cssText = "display:flex; align-items:center; gap:10px;";
                const lbl2 = document.createElement("span");
                lbl2.style.cssText = "font-size:12px; color:var(--text);";
                lbl2.textContent = field.label || "";
                const tog = window.TogglePrim?.create({
                    checked: val === true || val === "true",
                    onChange: (v) => { settings[field.id] = v; ctx.markDirty(); }
                }) || (() => {
                    const cb = document.createElement("input");
                    cb.type = "checkbox";
                    cb.checked = val === true;
                    cb.addEventListener("change", () => { settings[field.id] = cb.checked; ctx.markDirty(); });
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
                    ? (window.ProjectManagerCustomFields?.getModelOptions() || [])
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
                sel.addEventListener("change", () => { settings[field.id] = sel.value; ctx.markDirty(); });
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
                fpInp.addEventListener("input", () => { settings[field.id] = fpInp.value; ctx.markDirty(); });
                const fpBtn = window.ButtonPrim.create({
                    label: "Browse…", variant: "secondary", size: "sm",
                    onClick: async () => {
                        if (window.__TAURI__?.dialog?.open) {
                            const chosen = await window.__TAURI__.dialog.open({ directory: true, title: "Select Context Folder" });
                            if (chosen) { fpInp.value = chosen; settings[field.id] = chosen; ctx.markDirty(); }
                        } else {
                            const manual = prompt("Enter folder path:", fpInp.value);
                            if (manual !== null) { fpInp.value = manual; settings[field.id] = manual; ctx.markDirty(); }
                        }
                    }
                });
                fpRow.appendChild(fpInp);
                fpRow.appendChild(fpBtn);
                wrapper.appendChild(fpRow);

            } else if (field.type === "custom-file-list") {
                const lbl4 = document.createElement("label");
                lbl4.style.cssText = "display:block; font-size:11px; font-weight:600; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:5px;";
                lbl4.textContent = field.label || "Files";
                if (field.hint) lbl4.title = field.hint;
                wrapper.appendChild(lbl4);
                const el = window.ProjectManagerCustomFields?.render(field.type, field, ctx);
                if (el) wrapper.appendChild(el);

            } else if (CUSTOM_TYPES.includes(field.type)) {
                const el = window.ProjectManagerCustomFields?.render(field.type, field, ctx);
                if (el) wrapper.appendChild(el);
            }

            container.appendChild(wrapper);
        });
    }

    // ── Exports ───────────────────────────────────────────────

    const component = { MANIFEST, renderTabContent };
    window.ProjectManagerFieldRenderer = component;
    if (window.ModuleLoader) window.ModuleLoader.register(MANIFEST, component);

})();
