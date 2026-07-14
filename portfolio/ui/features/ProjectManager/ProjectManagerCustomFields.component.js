// ============================================================
// ProjectManagerCustomFields.component.js — SDOA v5 Component | layer 1
// Updated: 2026-07-14
// Extracted from ProjectManager.feature.js (Phase 5 — oversized-file
// split). Renders the four custom-* field types (preferred models,
// file list, rule suggestions, partner behavior) plus the shared
// _getModelOptions() helper and the RULE_SUGGESTIONS / BEHAVIOR_OPTIONS
// constant tables.
//
// ProjectManager.feature.js closes over its own module-private state
// (_projectSettings, _dirty, _selectedProject) via `let` variables that
// only its own IIFE can see — a second file's IIFE cannot reach into
// those directly. So each render function here takes a `ctx` object
// instead of relying on closure:
//   ctx.getSettings()      → current _projectSettings object (by ref)
//   ctx.markDirty()        → sets ProjectManager's _dirty = true
// This is the same explicit-parameter pattern Settings.feature.js's
// split already used for its `settings` object — just made fully
// explicit here since these renderers also need to signal "dirty".
// ============================================================

(function () {
    "use strict";

    const MANIFEST = {
        id: "ProjectManagerCustomFields.component", type: "component", layer: 1,
        runtime: "Browser", version: "1.0.0",
        requires: ["Button.prim", "Toast.prim"],
        docs: { description: "Renders ProjectManager.feature.js's four custom-* field types (custom-preferred-models, custom-file-list, custom-rule-suggestions, custom-partner-behavior) via a single render(type, field, ctx) dispatcher, plus the shared getModelOptions() helper. Extracted from ProjectManager.feature.js as part of the Phase 5 oversized-file split.", author: "ProtoAI team" }
    };

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

    // ── Dispatcher ──────────────────────────────────────────────

    function render(type, field, ctx) {
        switch (type) {
            case "custom-preferred-models":   return renderPreferredModels(ctx);
            case "custom-file-list":          return renderFileList(field.id, ctx);
            case "custom-rule-suggestions":   return renderRuleSuggestions(ctx);
            case "custom-partner-behavior":   return renderPartnerBehavior(ctx);
            default:                          return null;
        }
    }

    // ── Preferred Models ──────────────────────────────────────

    function renderPreferredModels(ctx) {
        const settings = ctx.getSettings();
        const container = document.createElement("div");
        container.style.cssText = "margin-bottom:8px;";

        const heading = document.createElement("div");
        heading.style.cssText = "font-size:11px; font-weight:600; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:8px;";
        heading.textContent = "Preferred Models";
        container.appendChild(heading);

        const list = document.createElement("div");
        list.id = "pmPreferredModelList";
        list.style.cssText = "display:flex; flex-direction:column; gap:4px; margin-bottom:8px;";

        const refresh = () => {
            list.innerHTML = "";
            const cur = Array.isArray(settings.preferredModels) ? settings.preferredModels : [];
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
                    settings.preferredModels = cur.filter((_, j) => j !== i);
                    ctx.markDirty();
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
        const modelOptions = getModelOptions();
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
                if (!Array.isArray(settings.preferredModels)) settings.preferredModels = [];
                if (!settings.preferredModels.includes(sel.value)) {
                    settings.preferredModels.push(sel.value);
                    ctx.markDirty();
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

    // ── File List ─────────────────────────────────────────────

    function renderFileList(fieldId, ctx) {
        const settings = ctx.getSettings();
        const container = document.createElement("div");

        const list = document.createElement("div");
        list.style.cssText = "display:flex; flex-direction:column; gap:4px; margin-bottom:8px;";

        const refresh = () => {
            list.innerHTML = "";
            const cur = Array.isArray(settings[fieldId]) ? settings[fieldId] : [];
            cur.forEach((f, i) => {
                const row = document.createElement("div");
                row.style.cssText = "display:flex; align-items:center; gap:8px; padding:4px 8px; background:var(--bg-elevated-1); border-radius:6px;";
                row.innerHTML = `<span style="flex:1; font-size:11px; color:var(--text); font-family:var(--font-mono); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${f}</span>`;
                const rm = document.createElement("button");
                rm.textContent = "✕";
                rm.style.cssText = "background:none; border:none; color:var(--text-dim); cursor:pointer; font-size:11px;";
                rm.addEventListener("click", () => {
                    settings[fieldId] = cur.filter((_, j) => j !== i);
                    ctx.markDirty();
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
                        if (!Array.isArray(settings[fieldId])) settings[fieldId] = [];
                        arr.forEach(f => { if (!settings[fieldId].includes(f)) settings[fieldId].push(f); });
                        ctx.markDirty();
                        refresh();
                    }
                } else if (inp.value) {
                    if (!Array.isArray(settings[fieldId])) settings[fieldId] = [];
                    if (!settings[fieldId].includes(inp.value)) { settings[fieldId].push(inp.value); ctx.markDirty(); refresh(); }
                    inp.value = "";
                }
            }
        });
        const addBtn = window.ButtonPrim.create({
            label: "+ Add", variant: "secondary", size: "sm",
            onClick: () => {
                if (!inp.value.trim()) return;
                if (!Array.isArray(settings[fieldId])) settings[fieldId] = [];
                if (!settings[fieldId].includes(inp.value.trim())) {
                    settings[fieldId].push(inp.value.trim());
                    ctx.markDirty();
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

    // ── Rule Suggestions ──────────────────────────────────────

    function renderRuleSuggestions(ctx) {
        const settings = ctx.getSettings();
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
                const cur = settings.customRules || "";
                settings.customRules = cur ? (cur + "\n" + rule) : rule;
                ctx.markDirty();
                // Update textarea if visible
                const ta = document.querySelector(`[data-field-id="customRules"]`);
                if (ta) ta.value = settings.customRules;
                window.ToastPrim?.show("Rule added", "success");
            });
            chips.appendChild(chip);
        });

        container.appendChild(chips);
        return container;
    }

    // ── Partner Behavior ──────────────────────────────────────

    function renderPartnerBehavior(ctx) {
        const settings = ctx.getSettings();
        const container = document.createElement("div");
        const heading = document.createElement("div");
        heading.style.cssText = "font-size:11px; font-weight:600; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:8px;";
        heading.textContent = "Partner Behavior";
        container.appendChild(heading);

        const grid = document.createElement("div");
        grid.style.cssText = "display:grid; grid-template-columns:repeat(auto-fill, minmax(140px,1fr)); gap:8px; margin-bottom:12px;";

        const activeBehaviors = Array.isArray(settings.partnerBehavior) ? settings.partnerBehavior : [];

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
                if (!Array.isArray(settings.partnerBehavior)) settings.partnerBehavior = [];
                const idx = settings.partnerBehavior.indexOf(opt.key);
                if (idx === -1) settings.partnerBehavior.push(opt.key);
                else settings.partnerBehavior.splice(idx, 1);
                ctx.markDirty();
                // Re-render
                const parent = container.parentElement;
                if (parent) {
                    const newEl = renderPartnerBehavior(ctx);
                    parent.replaceChild(newEl, container);
                }
            });
            grid.appendChild(card);
        });

        container.appendChild(grid);
        return container;
    }

    // ── Model Options (shared helper) ─────────────────────────

    function getModelOptions() {
        // Pull from global model inventory if available
        const inventory = window.modelManager?.getActiveModels?.() || [];
        if (inventory.length > 0) return inventory.map(m => ({ value: m, label: m }));
        // Fallback: try to read from ModelManagerFeature
        if (window.ModelManagerFeature?.getActiveModels) {
            return window.ModelManagerFeature.getActiveModels().map(m => ({ value: m, label: m }));
        }
        return [];
    }

    // ── Exports ───────────────────────────────────────────────

    const component = { MANIFEST, render, getModelOptions };
    window.ProjectManagerCustomFields = component;
    if (window.ModuleLoader) window.ModuleLoader.register(MANIFEST, component);

})();
