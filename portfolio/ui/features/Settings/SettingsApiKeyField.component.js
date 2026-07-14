// ============================================================
// SettingsApiKeyField.component.js — SDOA v5 Component | layer 1
// Updated: 2026-07-14
// Extracted from Settings.feature.js (Phase 5 — oversized-file split).
// Renders the "api-key" custom field type: a password input with
// save/test actions and a live status badge. Settings.feature.js's
// _renderTab() dispatches to window.SettingsApiKeyField.render() for
// any field with type: "api-key".
// ============================================================

(function () {
    "use strict";

    const MANIFEST = {
        id: "SettingsApiKeyField.component", type: "component", layer: 1,
        runtime: "Browser", version: "1.0.0",
        requires: ["Toast.prim"],
        docs: { description: "Renders the api-key custom field for Settings.feature.js — password input, Save/Test actions, live status badge (saved/unsaved/testing/valid/error). Extracted from Settings.feature.js as part of the Phase 5 oversized-file split.", author: "ProtoAI team" }
    };

    // ── API Key Field ─────────────────────────────────────────

    function render(container, field, settings) {
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

    // ── Exports ───────────────────────────────────────────────

    const component = { MANIFEST, render };
    window.SettingsApiKeyField = component;
    if (window.ModuleLoader) window.ModuleLoader.register(MANIFEST, component);

})();
