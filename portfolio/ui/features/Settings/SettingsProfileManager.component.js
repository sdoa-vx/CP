// ============================================================
// SettingsProfileManager.component.js — SDOA v5 Component | layer 1
// Updated: 2026-07-14
// Extracted from Settings.feature.js (Phase 5 — oversized-file split).
// Renders the "custom-profile-manager" field type: list of custom
// profiles with create/edit/delete. Settings.feature.js's _renderTab()
// dispatches to window.SettingsProfileManager.render() for any field
// with type: "custom-profile-manager".
// ============================================================

(function () {
    "use strict";

    const MANIFEST = {
        id: "SettingsProfileManager.component", type: "component", layer: 1,
        runtime: "Browser", version: "1.0.0",
        requires: ["Toast.prim"],
        docs: { description: "Renders the custom-profile-manager field for Settings.feature.js — list/create/edit/delete custom model profiles via backendConnector workflows (profiles, save_profile, delete_profile). Extracted from Settings.feature.js as part of the Phase 5 oversized-file split.", author: "ProtoAI team" }
    };

    // ── Profile Manager ───────────────────────────────────────

    function render(container, settings) {
        const wrap = document.createElement("div");
        wrap.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <span style="font-size:13px; font-weight:600;">Custom Profiles</span>
                <button id="pm-create-btn" class="sdoa-button sdoa-button--primary sdoa-button--sm">+ Create New</button>
            </div>
            <div id="pm-list" style="display:flex; flex-direction:column; gap:6px;"></div>
            <div id="pm-editor" style="display:none; margin-top:16px; padding:16px; border-radius:8px; background:var(--bg-elevated); border:1px solid var(--border-subtle);">
                <div style="font-size:12px; font-weight:600; margin-bottom:12px; color:var(--text-muted); text-transform:uppercase;" id="pm-editor-title">New Profile</div>
                <div style="display:flex; flex-direction:column; gap:10px;">
                    <div>
                        <label style="font-size:12px; color:var(--text-dim); display:block; margin-bottom:4px;">Profile Name</label>
                        <input id="pm-name" type="text" class="sdoa-input" placeholder="e.g. Senior Dev" />
                    </div>
                    <div>
                        <label style="font-size:12px; color:var(--text-dim); display:block; margin-bottom:4px;">Model</label>
                        <input id="pm-model" type="text" class="sdoa-input" placeholder="e.g. claude-opus-4-6" />
                    </div>
                    <div>
                        <label style="font-size:12px; color:var(--text-dim); display:block; margin-bottom:4px;">System Prompt</label>
                        <textarea id="pm-system" class="sdoa-input" rows="4" placeholder="You are a helpful senior developer..."></textarea>
                    </div>
                    <div style="display:flex; gap:8px; justify-content:flex-end;">
                        <button id="pm-cancel-btn" class="sdoa-button sdoa-button--ghost sdoa-button--sm">Cancel</button>
                        <button id="pm-save-btn" class="sdoa-button sdoa-button--primary sdoa-button--sm">Save Profile</button>
                    </div>
                </div>
            </div>
        `;
        container.appendChild(wrap);

        let _editingId = null;

        const list      = wrap.querySelector("#pm-list");
        const editor    = wrap.querySelector("#pm-editor");
        const nameInput = wrap.querySelector("#pm-name");
        const modelInput= wrap.querySelector("#pm-model");
        const sysInput  = wrap.querySelector("#pm-system");
        const edTitle   = wrap.querySelector("#pm-editor-title");

        async function refreshList() {
            try {
                const res = await window.backendConnector?.runWorkflow("profiles");
                const profiles = res?.profiles || res?.data?.profiles || {};
                const arr = Array.isArray(profiles)
                    ? profiles
                    : Object.entries(profiles).map(([id, v]) => ({ id, ...v }));

                list.innerHTML = "";
                if (arr.length === 0) {
                    list.innerHTML = `<div style="font-size:12px; color:var(--text-dim); padding:8px;">No profiles yet. Create one above.</div>`;
                    return;
                }
                arr.forEach(p => {
                    const id   = p.id || p.name;
                    const name = p.name || id;
                    const row  = document.createElement("div");
                    row.style.cssText = "display:flex; align-items:center; gap:8px; padding:8px 12px; border-radius:6px; background:var(--bg-elevated); border:1px solid var(--border-subtle);";
                    row.innerHTML = `
                        <div style="flex:1;">
                            <div style="font-size:13px; font-weight:500;">${name}</div>
                            <div style="font-size:11px; color:var(--text-dim);">${p.model || "default model"}</div>
                        </div>
                        <span class="sdoa-badge" style="font-size:10px; background:rgba(79,140,255,0.15); color:var(--accent);">${p.type || "user"}</span>
                        <button class="sdoa-button sdoa-button--ghost sdoa-button--sm" data-edit="${id}">Edit</button>
                        ${p.type !== "archetype" && id !== "default" ? `<button class="sdoa-button sdoa-button--ghost sdoa-button--sm" style="color:#ef4444;" data-delete="${id}">Del</button>` : ""}
                    `;
                    row.querySelector(`[data-edit]`)?.addEventListener("click", () => {
                        _editingId = id;
                        edTitle.textContent = `Editing: ${name}`;
                        nameInput.value  = name;
                        modelInput.value = p.model || "";
                        sysInput.value   = p.system || "";
                        editor.style.display = "block";
                    });
                    row.querySelector(`[data-delete]`)?.addEventListener("click", async () => {
                        if (!confirm(`Delete profile "${name}"?`)) return;
                        try {
                            await window.backendConnector?.runWorkflow("delete_profile", { id });
                            window.ToastPrim?.show(`Profile "${name}" deleted`, "success");
                            await refreshList();
                        } catch (err) {
                            window.ToastPrim?.show("Delete failed: " + err.message, "error");
                        }
                    });
                    list.appendChild(row);
                });
            } catch (err) {
                list.innerHTML = `<div style="font-size:12px; color:#ef4444;">Failed to load profiles: ${err.message}</div>`;
            }
        }

        wrap.querySelector("#pm-create-btn").addEventListener("click", () => {
            _editingId = null;
            edTitle.textContent = "New Profile";
            nameInput.value = "";
            modelInput.value = "";
            sysInput.value = "";
            editor.style.display = "block";
            nameInput.focus();
        });

        wrap.querySelector("#pm-cancel-btn").addEventListener("click", () => {
            editor.style.display = "none";
            _editingId = null;
        });

        wrap.querySelector("#pm-save-btn").addEventListener("click", async () => {
            const name   = nameInput.value.trim();
            const model  = modelInput.value.trim();
            const system = sysInput.value.trim();
            if (!name) { window.ToastPrim?.show("Enter a profile name", "error"); return; }
            const id = _editingId || name.toLowerCase().replace(/\s+/g, "_");
            try {
                await window.backendConnector?.runWorkflow("save_profile", { id, name, model, system });
                window.ToastPrim?.show(`Profile "${name}" saved`, "success");
                editor.style.display = "none";
                _editingId = null;
                await refreshList();
                // Update the active profile badge in AppShell
                window.AppShellFeature?.updateProfileUI?.();
            } catch (err) {
                window.ToastPrim?.show("Save failed: " + err.message, "error");
            }
        });

        refreshList();
    }

    // ── Exports ───────────────────────────────────────────────

    const component = { MANIFEST, render };
    window.SettingsProfileManager = component;
    if (window.ModuleLoader) window.ModuleLoader.register(MANIFEST, component);

})();
