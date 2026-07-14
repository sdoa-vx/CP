// ============================================================
// Settings.feature.js — SDOA v4 Feature | v4.1.0 | layer 1
// Last modified: 2026-05-11
// Changes vs 4.0.0:
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
        runtime: "Browser", version: "4.1.1",
        "non-sdoa-compliant": true,
        requires: ["Modal.prim", "TabGroup.prim", "Form.prim", "Toast.prim", "Button.prim"],
        dataFiles: ["schemas/settings.schema.json"],
        lifecycle: ["init"],
        docs: { description: "Exceeds 500-line hard cap, pending refactor in Phase 5. Global settings modal using declarative JSON schemas.", author: "ProtoAI team" }
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
                case "api-key":             _renderApiKeyField(wrap, field, currentSettings);   break;
                case "radial-dial":         _renderRadialDial(wrap, field, currentSettings);    break;
                case "custom-local-ai-setup":_renderLocalAiSetup(wrap);                        break;
                case "custom-assistant-setup":_renderAssistantSetup(wrap);                     break;
                case "custom-profile-manager":_renderProfileManager(wrap, currentSettings);    break;
                case "custom-optimize-models":_renderOptimizeModelsBtn(wrap, currentSettings); break;
                case "custom-about":        _renderAbout(wrap);                                break;
            }
        }
    }

    // ── API Key Field ─────────────────────────────────────────

    function _renderApiKeyField(container, field, settings) {
        const provider   = field.provider;
        const storedKey  = settings?.apiKeys?.[provider] || "";

        const wrap = document.createElement("div");
        wrap.style.cssText = "display:flex; flex-direction:column; gap:8px; margin-bottom:16px;";
        wrap.innerHTML = `
            <label style="font-size:12px; font-weight:600; color:var(--text-muted); text-transform:uppercase;">${field.label}</label>
            <div style="display:flex; gap:8px; align-items:center;">
                <input type="password" placeholder="${field.placeholder || ''}"
                    value="${storedKey ? '•'.repeat(Math.min(storedKey.length, 24)) : ''}"
                    data-real-value="${storedKey}"
                    style="flex:1; padding:8px 12px; border-radius:6px; border:1px solid var(--border-subtle);
                           background:var(--bg-elevated); color:var(--text-primary); font-size:13px;
                           font-family:monospace;" />
                <button class="sdoa-button sdoa-button--secondary sdoa-button--sm" data-action="save">Save</button>
                <button class="sdoa-button sdoa-button--ghost sdoa-button--sm" data-action="test">Test</button>
            </div>
            <div class="api-key-status" style="font-size:11px; display:none; gap:6px; align-items:center; padding:4px 0;"></div>
        `;

        const input   = wrap.querySelector("input");
        const saveBtn = wrap.querySelector("[data-action='save']");
        const testBtn = wrap.querySelector("[data-action='test']");
        const status  = wrap.querySelector(".api-key-status");

        // Show saved status if key exists
        if (storedKey) _showKeyStatus(status, "saved", "Key saved");

        // Track actual value separately (input type=password shows dots)
        let actualValue = storedKey;
        input.addEventListener("focus", () => {
            if (input.dataset.realValue) {
                input.type  = "text";
                input.value = input.dataset.realValue;
            }
        });
        input.addEventListener("blur", () => {
            actualValue = input.value.trim();
            input.dataset.realValue = actualValue;
            input.type = "password";
            input.value = actualValue ? "•".repeat(Math.min(actualValue.length, 24)) : "";
        });
        input.addEventListener("input", () => {
            actualValue = input.value;
            _showKeyStatus(status, "unsaved", "Unsaved changes");
        });

        saveBtn.addEventListener("click", async () => {
            const key = actualValue.trim();
            if (!key) { _showKeyStatus(status, "error", "Enter an API key first"); return; }
            if (!settings.apiKeys) settings.apiKeys = {};
            settings.apiKeys[provider] = key;
            try {
                await window.backendConnector?.runWorkflow("settings_set", {
                    action: "set", key: "apiKeys", value: settings.apiKeys
                });
                input.dataset.realValue = key;
                _showKeyStatus(status, "saved", "Saved ✓");
                window.ToastPrim?.show(`${field.label} API key saved`, "success");
            } catch (err) {
                _showKeyStatus(status, "error", "Save failed: " + err.message);
            }
        });

        testBtn.addEventListener("click", async () => {
            const key = actualValue.trim() || storedKey;
            if (!key) { _showKeyStatus(status, "error", "Enter an API key to test"); return; }
            testBtn.disabled = true;
            testBtn.textContent = "Testing…";
            _showKeyStatus(status, "testing", "Testing connection…");
            try {
                const res = await window.backendConnector?.runWorkflow("settings_test_key", {
                    action: "testKey", provider, key
                });
                const ok  = res?.ok !== false && (res?.valid || res?.data?.valid || res?.success || res?.data?.success);
                const msg = res?.message || res?.data?.message || (ok ? "Valid ✓" : "Invalid key");
                _showKeyStatus(status, ok ? "valid" : "error", msg);
            } catch (err) {
                _showKeyStatus(status, "error", "Test failed: " + err.message);
            } finally {
                testBtn.disabled = false;
                testBtn.textContent = "Test";
            }
        });

        container.appendChild(wrap);
    }

    function _showKeyStatus(el, state, text) {
        const colors = { saved: "#22c55e", valid: "#22c55e", error: "#ef4444", unsaved: "#f59e0b", testing: "var(--text-dim)" };
        el.style.display = "flex";
        el.style.color   = colors[state] || "var(--text-dim)";
        el.textContent   = text;
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

    // ── Profile Manager ───────────────────────────────────────

    function _renderProfileManager(container, settings) {
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

    // ── Local AI Setup ────────────────────────────────────────

    function _renderLocalAiSetup(container) {
        let _pollTimer = null;
        let _useCuda   = false;

        const panel = document.createElement("div");
        panel.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:16px;">
                <div id="lai-status-card" style="padding:16px; border-radius:8px; background:rgba(0,0,0,0.25); border:1px solid var(--border-subtle); display:flex; align-items:center; gap:12px;">
                    <div id="lai-badge" style="width:12px; height:12px; border-radius:50%; background:var(--text-dim); flex-shrink:0;"></div>
                    <div style="flex:1;">
                        <div id="lai-status-label" style="font-weight:600; font-size:13px;">Checking status…</div>
                        <div id="lai-status-sub"   style="font-size:12px; color:var(--text-dim); margin-top:2px;"></div>
                    </div>
                </div>
                <div id="lai-progress-section" style="display:none; flex-direction:column; gap:8px;">
                    <div style="display:flex; justify-content:space-between; font-size:12px; color:var(--text-dim);">
                        <span id="lai-progress-label">Preparing…</span>
                        <span id="lai-progress-step"></span>
                    </div>
                    <div style="height:6px; background:rgba(255,255,255,0.08); border-radius:3px; overflow:hidden;">
                        <div id="lai-progress-bar" style="height:100%; width:0%; border-radius:3px; background:var(--accent); transition:width 0.4s ease;"></div>
                    </div>
                    <div id="lai-progress-sub" style="font-size:11px; color:var(--text-dim); font-family:monospace; word-break:break-all; max-height:60px; overflow:hidden;"></div>
                </div>
                <div id="lai-controls" style="display:flex; flex-direction:column; gap:10px;">
                    <label style="display:flex; align-items:center; gap:8px; font-size:13px; cursor:pointer;">
                        <input type="checkbox" id="lai-cuda-toggle" style="cursor:pointer;" />
                        Use CUDA (requires NVIDIA GPU + CUDA 12.1)
                    </label>
                    <div style="display:flex; gap:8px;">
                        <button id="lai-setup-btn" class="sdoa-button sdoa-button--primary sdoa-button--sm" style="display:none;">⬇ Setup Local AI</button>
                        <button id="lai-test-btn" class="sdoa-button sdoa-button--secondary sdoa-button--sm" style="display:none;">✓ Test Connection</button>
                    </div>
                    <p style="font-size:11px; color:var(--text-dim); margin:0;">
                        First-time setup downloads ~4 GB of Python packages and ~15 GB of model weights.
                        Ensure adequate disk space and internet connection before proceeding.
                    </p>
                </div>
            </div>
        `;
        container.appendChild(panel);

        const badge       = panel.querySelector("#lai-badge");
        const statusLabel = panel.querySelector("#lai-status-label");
        const statusSub   = panel.querySelector("#lai-status-sub");
        const progressSec = panel.querySelector("#lai-progress-section");
        const pLabel      = panel.querySelector("#lai-progress-label");
        const pStep       = panel.querySelector("#lai-progress-step");
        const pBar        = panel.querySelector("#lai-progress-bar");
        const pSub        = panel.querySelector("#lai-progress-sub");
        const setupBtn    = panel.querySelector("#lai-setup-btn");
        const testBtn     = panel.querySelector("#lai-test-btn");
        const cudaToggle  = panel.querySelector("#lai-cuda-toggle");

        const COLORS = { idle:"var(--text-dim)", running:"#f59e0b", done:"#22c55e", error:"#ef4444" };

        function _applyStatus(s) {
            if (!s) return;
            badge.style.background = COLORS[s.state] || COLORS.idle;

            if (s.state === "idle") {
                statusLabel.textContent    = "Not installed";
                statusSub.textContent      = "Run Setup Local AI to install Qwen2.5-Coder.";
                setupBtn.style.display     = "inline-flex";
                testBtn.style.display      = "none";
                progressSec.style.display  = "none";
            } else if (s.state === "running") {
                statusLabel.textContent    = "Installing…";
                statusSub.textContent      = "";
                setupBtn.style.display     = "none";
                testBtn.style.display      = "none";
                progressSec.style.display  = "flex";
                if (s.label) pLabel.textContent = s.label;
                if (s.step)  pStep.textContent  = `Step ${s.step} of ${s.total || 5}`;
                if (s.pct)   pBar.style.width   = `${s.pct}%`;
                if (s.sub)   pSub.textContent   = s.sub;
            } else if (s.state === "done") {
                statusLabel.textContent    = "Local AI Ready";
                statusSub.textContent      = s.model ? `Model: ${s.model}` : "Model loaded";
                badge.style.background     = COLORS.done;
                setupBtn.style.display     = "none";
                testBtn.style.display      = "inline-flex";
                progressSec.style.display  = "none";
            } else if (s.state === "error") {
                statusLabel.textContent    = "Setup failed";
                statusSub.textContent      = s.error || "Unknown error";
                badge.style.background     = COLORS.error;
                setupBtn.style.display     = "inline-flex";
                testBtn.style.display      = "none";
                progressSec.style.display  = "none";
            }
        }

        async function _pollStatus() {
            try {
                const res = await window.backendConnector?.runWorkflow("local_ai_status");
                const s   = res?.data || res;
                _applyStatus(s);
                if (s?.state === "running") {
                    _pollTimer = setTimeout(_pollStatus, 2000);
                }
            } catch (_) {}
        }

        cudaToggle.addEventListener("change", () => { _useCuda = cudaToggle.checked; });

        setupBtn.addEventListener("click", async () => {
            setupBtn.disabled = true;
            setupBtn.textContent = "Starting…";
            try {
                await window.backendConnector?.runWorkflow("provision", { cuda: _useCuda });
                _pollStatus();
            } catch (err) {
                window.ToastPrim?.show("Setup start failed: " + err.message, "error");
                setupBtn.disabled = false;
                setupBtn.textContent = "⬇ Setup Local AI";
            }
        });

        testBtn.addEventListener("click", async () => {
            testBtn.disabled = true;
            testBtn.textContent = "Testing…";
            try {
                const res = await window.backendConnector?.runWorkflow("local_ai_health");
                const ok  = res?.ok || res?.data?.ok;
                window.ToastPrim?.show(ok ? "Local AI is responding ✓" : "Local AI not responding — is the server running?", ok ? "success" : "error");
            } catch (err) {
                window.ToastPrim?.show("Test failed: " + err.message, "error");
            } finally {
                testBtn.disabled = false;
                testBtn.textContent = "✓ Test Connection";
            }
        });

        // Initial status check
        _pollStatus();
    }

    // ── Assistant Setup ───────────────────────────────────────

    function _renderAssistantSetup(container) {
        const wrap = document.createElement("div");
        wrap.style.cssText = "display:flex; flex-direction:column; gap:20px;";

        let pulse = parseInt(localStorage.getItem("protoai:partner:pulse") || "10", 10);
        let toggles = {};
        try { toggles = JSON.parse(localStorage.getItem("protoai:partner:toggles")) || {}; } catch(e){}

        wrap.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:8px;">
                <label style="font-size:12px; font-weight:600; color:var(--text-muted); text-transform:uppercase;">Pulse Frequency</label>
                <select class="sdoa-input" id="asstPulseSelect" style="max-width:200px; padding:8px; font-size:13px; border-radius:6px; border:1px solid var(--border-subtle); background:var(--bg-elevated); color:var(--text-primary);">
                    <option value="1">1 minute</option>
                    <option value="5">5 minutes</option>
                    <option value="10">10 minutes</option>
                    <option value="15">15 minutes</option>
                    <option value="30">30 minutes</option>
                    <option value="60">1 hour</option>
                </select>
                <div style="font-size:11px; color:var(--text-dim);">How often the assistant randomly checks in on your project.</div>
            </div>

            <div style="display:flex; flex-direction:column; gap:8px; margin-top:8px;">
                <label style="font-size:12px; font-weight:600; color:var(--text-muted); text-transform:uppercase;">Active Personas</label>
                <div id="asstFacetContainer" style="display:flex; flex-wrap:wrap; gap:8px;"></div>
                <div style="font-size:11px; color:var(--text-dim);">Select which aspects of the AI's personality are active in the fan-out commentary.</div>
            </div>
        `;

        const sel = wrap.querySelector("#asstPulseSelect");
        sel.value = pulse;
        sel.addEventListener("change", () => {
            localStorage.setItem("protoai:partner:pulse", sel.value);
            window.ToastPrim?.show("Pulse frequency updated", "success");
        });

        const facetsWrap = wrap.querySelector("#asstFacetContainer");
        const FACETS = [
            { key: "advisor", label: "Advisor" },
            { key: "critic",  label: "Critic" },
            { key: "friend",  label: "Friend" },
            { key: "comedy",  label: "Comedy" },
            { key: "slutty",  label: "Slutty" },
            { key: "slutty_nsfw", label: "Slutty (NSFW)" },
            { key: "scary",   label: "Scary" },
            { key: "scared",  label: "Scared" },
            { key: "alien",   label: "Alien" }
        ];

        FACETS.forEach(f => {
            const key = 'facet_' + f.key;
            const active = f.key === "slutty_nsfw" ? toggles[key] === true : toggles[key] !== false;

            const btn = document.createElement("button");
            btn.className = "sdoa-button " + (active ? "sdoa-button--primary" : "sdoa-button--ghost");
            btn.style.cssText = "font-size: 12px; padding: 6px 12px; border-radius: 12px;";
            btn.innerHTML = (active ? "☑ " : "☐ ") + f.label;

            btn.addEventListener("click", () => {
                const isCurrentlyActive = f.key === "slutty_nsfw" ? toggles[key] === true : toggles[key] !== false;
                const newState = !isCurrentlyActive;

                if (f.key === "slutty_nsfw" && newState === true) {
                    const confirmed = confirm(
                        "DISCLAIMER:\nThe Slutty (NSFW) persona generates explicitly flirtatious, highly sexually suggestive, and uninhibited comments.\n\nAre you sure you want to enable this NSFW persona?"
                    );
                    if (!confirmed) {
                        return;
                    }
                }

                toggles[key] = newState;
                localStorage.setItem("protoai:partner:toggles", JSON.stringify(toggles));

                btn.className = "sdoa-button " + (newState ? "sdoa-button--primary" : "sdoa-button--ghost");
                btn.innerHTML = (newState ? "☑ " : "☐ ") + f.label;
            });
            facetsWrap.appendChild(btn);
        });

        container.appendChild(wrap);
    }

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
