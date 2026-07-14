// ============================================================
// Settings.feature.js — SDOA v5 Feature | v5.0.0 | layer 1
// Last modified: 2026-07-14
// Changes vs 4.1.1:
//   - Phase 5 (oversized-file split): extracted the four custom field
//     renderers into sibling components, dispatched from _renderTab():
//       SettingsApiKeyField.component.js       ("api-key")
//       SettingsProfileManager.component.js    ("custom-profile-manager")
//       SettingsLocalAiSetup.component.js      ("custom-local-ai-setup")
//       SettingsAssistantSetup.component.js    ("custom-assistant-setup")
//     File was 715 lines (flagged non-sdoa-compliant purely for size);
//     now well under the Layer 1 cap and fully manifest-compliant.
//     _renderRadialDial, _renderOptimizeModelsBtn, _renderAbout, and
//     _saveSettings stayed here — each is small and tightly coupled to
//     the tab dispatcher / save flow.
// Changes vs 4.0.0 (historical):
//   - _renderApiKeyField: save-status badge + working Test button
//     with live result display ("Valid ✓" / "Invalid ✗ reason")
//   - _renderProfileManager: Create New actually saves; Edit/Delete wired
//   - Dynamic model population: select fields with "dynamic":"models"
//     now fetch inventory from backend on open
//   - _renderLocalAiSetup: complete (was truncated at speedMatch)
//   - _renderRadialDial, _renderOptimizeModelsBtn: complete
//   - _saveSettings: persists via backendConnector
// ============================================================

(function () {
    "use strict";

    const MANIFEST = {
        id: "Settings.feature", type: "feature", layer: 1,
        runtime: "Browser", version: "5.0.0",
        capabilities: ["settings.open", "settings.save"],
        requires: [
            "Modal.prim", "TabGroup.prim", "Form.prim", "Toast.prim", "Button.prim",
            "SettingsApiKeyField.component", "SettingsProfileManager.component",
            "SettingsLocalAiSetup.component", "SettingsAssistantSetup.component"
        ],
        dependencies: [
            "Modal.prim", "TabGroup.prim", "Form.prim", "Toast.prim", "Button.prim",
            "SettingsApiKeyField.component", "SettingsProfileManager.component",
            "SettingsLocalAiSetup.component", "SettingsAssistantSetup.component"
        ],
        dataFiles: ["schemas/settings.schema.json"],
        lifecycle: ["init"],
        docs: { description: "Global settings modal using declarative JSON schemas. Standard fields render via Form.prim; the four custom field types (api-key, custom-profile-manager, custom-local-ai-setup, custom-assistant-setup) render via dedicated sibling components. Radial-dial, optimize-models, and about panels remain inline as small single-purpose renderers.", author: "ProtoAI team" },
        last_modified: "2026-07-14T00:00:00Z"
    };

    let _schema  = null;
    let _modal   = null;
    let _models  = [];   // cached model inventory for dynamic selects

    // ── Init ──────────────────────────────────────────────────

    async function init() {
        try {
            const res = await fetch("/data/schemas/settings.schema.json");
            if (res.ok) _schema = await res.json();

            // Wire the main settings button in index.html
            const btn = document.getElementById("openSettingsButton");
            if (btn) btn.addEventListener("click", open);

            // Also expose as global so AppShell shortcut can call it
            window.openSettingsPanel = open;

        } catch (err) {
            console.error("[Settings.feature] Failed to load schema:", err);
        }
    }

    // ── Open ──────────────────────────────────────────────────

    async function open() {
        if (!_schema) {
            window.ToastPrim?.show("Settings schema not loaded.", "error");
            return;
        }

        // Load current settings and model inventory in parallel
        const [settingsRes, inventoryRes] = await Promise.allSettled([
            window.backendConnector?.runWorkflow("settings_get"),
            window.backendConnector?.runWorkflow("get_model_inventory"),
        ]);

        const currentSettings = settingsRes.value?.settings
            || settingsRes.value?.data?.settings
            || window.StateStore?.get("settings") || {};

        _models = inventoryRes.value?.models
            || inventoryRes.value?.data?.models
            || [];

        // Create Modal
        _modal = window.ModalPrim?.create({
            title: "Settings",
            size: "lg",
            onClose: () => { _modal = null; }
        });
        if (!_modal) { console.error("[Settings] ModalPrim not available"); return; }

        // Create TabGroup
        const tabs = window.TabGroupPrim?.create({
            variant: "vertical",
            tabs: _schema.tabs.map(t => ({ id: t.id, label: t.label, icon: t.icon })),
            renderTab: (tabId, container) => _renderTab(tabId, container, currentSettings),
        });

        if (tabs) {
            _modal._sdoaBody.appendChild(tabs);
            _modal._sdoaBody.style.padding = "0";
        }

        // Footer
        _modal._sdoaShowFooter?.();
        const cancelBtn = window.ButtonPrim?.create({ label: "Cancel", variant: "ghost",     onClick: () => window.ModalPrim?.close(_modal) });
        const saveBtn   = window.ButtonPrim?.create({
            label: "Save Changes", variant: "primary",
            onClick: async () => {
                saveBtn._sdoaUpdate?.({ loading: true });
                await _saveSettings(currentSettings);
                saveBtn._sdoaUpdate?.({ loading: false });
                window.ModalPrim?.close(_modal);
            }
        });
        if (cancelBtn) _modal._sdoaFooter?.appendChild(cancelBtn);
        if (saveBtn)   _modal._sdoaFooter?.appendChild(saveBtn);

        window.ModalPrim?.open(_modal);
    }

    // ── Tab Renderer ──────────────────────────────────────────

    function _renderTab(tabId, container, currentSettings) {
        const tabData = _schema.tabs.find(t => t.id === tabId);
        if (!tabData) return;

        const CUSTOM_TYPES = ["custom-local-ai-setup","custom-profile-manager","custom-optimize-models","custom-about","api-key","radial-dial", "custom-assistant-setup"];
        const standardFields = tabData.fields.filter(f => !CUSTOM_TYPES.includes(f.type));
        const customFields   = tabData.fields.filter(f =>  CUSTOM_TYPES.includes(f.type));

        // Populate dynamic model options before rendering
        standardFields.forEach(f => {
            if (f.dynamic === "models") {
                f.options = _models.map(m => ({ value: m.id, label: m.name || m.id }));
            }
        });

        if (standardFields.length > 0) {
            const form = window.FormPrim?.create({
                fields: standardFields,
                values: currentSettings,
                submitLabel: false,
                onChange: (fieldId, val) => { currentSettings[fieldId] = val; }
            });
            if (form) container.appendChild(form);
        }

        for (const field of customFields) {
            const wrap = document.createElement("div");
            wrap.style.cssText = "padding:16px;";
            container.appendChild(wrap);
            switch (field.type) {
                case "api-key":                window.SettingsApiKeyField?.render(wrap, field, currentSettings);   break;
                case "radial-dial":            _renderRadialDial(wrap, field, currentSettings);                    break;
                case "custom-local-ai-setup":  window.SettingsLocalAiSetup?.render(wrap);                          break;
                case "custom-assistant-setup": window.SettingsAssistantSetup?.render(wrap);                        break;
                case "custom-profile-manager": window.SettingsProfileManager?.render(wrap, currentSettings);       break;
                case "custom-optimize-models": _renderOptimizeModelsBtn(wrap, currentSettings);                    break;
                case "custom-about":           _renderAbout(wrap);                                                 break;
            }
        }
    }

    // ── Radial Dial (rendered as a labeled slider) ────────────

    function _renderRadialDial(container, field, settings) {
        const current = settings[field.id] ?? field.min ?? 0;
        const wrap = document.createElement("div");
        wrap.style.cssText = "margin-bottom:16px;";
        wrap.innerHTML = `
            <label style="font-size:12px; font-weight:600; color:var(--text-muted); text-transform:uppercase; display:block; margin-bottom:8px;">
                ${field.label}
            </label>
            <div style="display:flex; align-items:center; gap:12px;">
                <input type="range" min="${field.min}" max="${field.max}" step="${field.step || 1}"
                       value="${current}" style="flex:1; accent-color:var(--accent);" />
                <span style="font-size:13px; font-weight:600; min-width:60px; text-align:right; color:var(--text-primary);">
                    ${current}${field.unit || ""}
                </span>
            </div>
            ${field.hint ? `<div style="font-size:11px; color:var(--text-dim); margin-top:4px;">${field.hint}</div>` : ""}
        `;
        const slider  = wrap.querySelector("input");
        const display = wrap.querySelector("span");
        slider.addEventListener("input", () => {
            const v = Number(slider.value);
            display.textContent = v + (field.unit || "");
            settings[field.id] = v;
        });
        container.appendChild(wrap);
    }

    // ── Optimize Models Button ────────────────────────────────

    function _renderOptimizeModelsBtn(container, settings) {
        const wrap = document.createElement("div");
        wrap.style.cssText = "margin-bottom:16px;";
        wrap.innerHTML = `
            <button id="opt-models-btn" class="sdoa-button sdoa-button--secondary sdoa-button--sm">
                🪄 Auto-Optimize Models
            </button>
            <div id="opt-models-status" style="font-size:11px; color:var(--text-dim); margin-top:6px; display:none;"></div>
        `;
        const btn    = wrap.querySelector("#opt-models-btn");
        const status = wrap.querySelector("#opt-models-status");
        btn.addEventListener("click", async () => {
            btn.disabled = true;
            btn.textContent = "Optimizing…";
            status.style.display = "block";
            status.textContent = "Fetching available free models from OpenRouter…";
            try {
                await window.backendConnector?.runWorkflow("auto_optimize", {});
                status.textContent = "✓ Done — models updated";
                window.ToastPrim?.show("Model list optimized!", "success");
            } catch (err) {
                status.textContent = "Failed: " + err.message;
                window.ToastPrim?.show("Optimization failed", "error");
            } finally {
                btn.disabled = false;
                btn.textContent = "🪄 Auto-Optimize Models";
            }
        });
        container.appendChild(wrap);
    }

    // ── About Panel ───────────────────────────────────────────

    function _renderAbout(container) {
        container.innerHTML = `
            <div style="font-size:13px; line-height:1.7; color:var(--text-dim);">
                <p><strong style="color:var(--text-primary);">ProtoAI</strong> — SDOA v4 Developer Hub</p>
                <p>Version: <code>${window.APP_VERSION || "0.4.0"}</code></p>
                <p>Architecture: Tauri v2 + Node.js sidecar + Vanilla JS</p>
                <p style="margin-top:12px; font-size:11px;">
                    UI shell uses the SDOA v4 module system (features, primitives, adapters).
                    The backend sidecar handles LLM routing, VFS, and project management.
                </p>
            </div>
        `;
    }

    // ── Save ────────────────────────────────────────────────────

    async function _saveSettings(settings) {
        try {
            if (window.backendConnector && window.backendConnector.runWorkflow) {
                await window.backendConnector.runWorkflow("settings_set", {
                    action: "set", value: settings
                });
            } else {
                throw new Error("Backend connector unavailable");
            }
            window.StateStore?.set("settings", settings);
            window.EventBus?.emit("settings:changed", settings);
            window.ToastPrim?.show("Settings saved", "success");
        } catch (err) {
            console.warn("[Settings] Save to backend failed, saving locally:", err.message);
            window.StateStore?.set("settings", settings);
            window.EventBus?.emit("settings:changed", settings);
            window.ToastPrim?.show("Saved locally (offline mode)", "warning");
        }
    }

    // ── Exports ───────────────────────────────────────────────

    const feature = { MANIFEST, init, open };
    window.SettingsFeature = feature;
    window.openSettingsPanel = open;
    if (window.ModuleLoader) window.ModuleLoader.register(MANIFEST, feature);

})();
