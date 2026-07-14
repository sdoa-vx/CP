// ============================================================
// SettingsLocalAiSetup.component.js — SDOA v5 Component | layer 1
// Updated: 2026-07-14
// Extracted from Settings.feature.js (Phase 5 — oversized-file split).
// Renders the "custom-local-ai-setup" field type: local AI provisioning
// status card, progress bar, CUDA toggle, setup/test actions.
// Settings.feature.js's _renderTab() dispatches to
// window.SettingsLocalAiSetup.render() for any field with
// type: "custom-local-ai-setup".
// ============================================================

(function () {
    "use strict";

    const MANIFEST = {
        id: "SettingsLocalAiSetup.component", type: "component", layer: 1,
        runtime: "Browser", version: "1.0.0",
        requires: ["Toast.prim"],
        docs: { description: "Renders the custom-local-ai-setup field for Settings.feature.js — status card, provisioning progress bar, CUDA toggle, Setup/Test actions against backendConnector workflows (local_ai_status, provision, local_ai_health). Extracted from Settings.feature.js as part of the Phase 5 oversized-file split.", author: "ProtoAI team" }
    };

    // ── Local AI Setup ────────────────────────────────────────

    function render(container) {
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

    // ── Exports ───────────────────────────────────────────────

    const component = { MANIFEST, render };
    window.SettingsLocalAiSetup = component;
    if (window.ModuleLoader) window.ModuleLoader.register(MANIFEST, component);

})();
