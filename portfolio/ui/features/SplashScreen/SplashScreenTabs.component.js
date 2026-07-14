// ============================================================
// SplashScreenTabs.component.js — SDOA v5 Component | layer 1
// Updated: 2026-07-14
// Extracted from SplashScreen.feature.js (Phase 5 — oversized-file split).
// Carries all eight settings-tab renderers (Presets, UI Loader,
// Primary AI, Assistant AI, Profiles, Files, Backend, Frontend) plus
// the private preset-application logic.
//
// SplashScreen.feature.js's _settings is its own private `let`
// variable that gets reassigned (not just mutated) by preset
// application, so this file takes an explicit `ctx` object
// ({ getSettings, setSettings, deepMerge, updateMockup, showTab })
// rather than closing over the core's state directly — same pattern
// used for ProjectManager/Chat earlier in this phase. Reads PRESETS
// from window.SplashScreenData.
// ============================================================

(function () {
    "use strict";

    const MANIFEST = {
        id: "SplashScreenTabs.component", type: "component", layer: 1,
        runtime: "Browser", version: "1.0.0",
        requires: ["SplashScreenData.utility"],
        dependencies: ["SplashScreenData.utility"],
        docs: { description: "SplashScreen.feature.js's eight settings-tab renderers: renderPresets/renderUiLoader/renderPrimaryAi/renderAssistantAi/renderProfiles/renderFiles/renderBackend/renderFrontend, plus the private applyPreset() helper. Takes an explicit ctx object for SplashScreen.feature.js's private _settings state (see file header). Extracted from SplashScreen.feature.js as part of the Phase 5 oversized-file split.", author: "ProtoAI Team" }
    };

    // ── Presets ──────────────────────────────────────────────

    function renderPresets(container, ctx) {
        const PRESETS = window.SplashScreenData.PRESETS;
        container.innerHTML = `
            <h3>Workspace Presets</h3>
            <p class="tab-desc">Instantly configure ProtoAI layout density, AI partners, and direct model routing for your current task.</p>
            <div class="presets-grid">
                ${Object.entries(PRESETS).map(([key, p]) => `
                    <div class="preset-card" data-preset-key="${key}">
                        <div class="preset-header">
                            <h4>${p.name}</h4>
                            <span class="preset-badge">${key === "developerMode" ? "RECOMMENDED" : ""}</span>
                        </div>
                        <p>${p.desc}</p>
                    </div>
                `).join("")}
            </div>
        `;

        container.querySelectorAll(".preset-card").forEach(card => {
            card.addEventListener("click", () => {
                const key = card.getAttribute("data-preset-key");
                _applyPreset(key, ctx);
                window.ToastPrim?.show(`Preset "${PRESETS[key].name}" applied!`, "success");
            });
        });
    }

    function _applyPreset(presetKey, ctx) {
        const PRESETS = window.SplashScreenData.PRESETS;
        const preset = PRESETS[presetKey];
        if (!preset) return;

        // Merge preset settings into _settings
        let settings = ctx.deepMerge(ctx.getSettings(), preset.settings);

        // Apply specific adjustments depending on preset properties
        if (presetKey === "offlineMode") {
            settings.ui.components.partnerTicker = false;
            settings.ui.components.sidebarRight = false;
            settings.assistant.enabled = false;
        } else if (presetKey === "developerMode") {
            settings.ui.components.partnerTicker = true;
            settings.ui.components.sidebarRight = true;
            settings.assistant.enabled = true;
        } else {
            settings.ui.components.partnerTicker = true;
            settings.ui.components.sidebarRight = true;
            settings.assistant.enabled = true;
        }

        ctx.setSettings(settings);
        ctx.updateMockup();
    }

    // ── UI Loader ────────────────────────────────────────────

    function renderUiLoader(container, ctx) {
        const _settings = ctx.getSettings();
        const comp = _settings.ui.components;
        container.innerHTML = `
            <h3>UI Component Loader</h3>
            <p class="tab-desc">Enable or disable structural panels. Disabled elements will skip loading to save CPU/memory.</p>
            <div class="settings-form">
                <label class="form-checkbox-row">
                    <input type="checkbox" id="ui-chat" ${comp.chat ? "checked" : ""}>
                    <div class="checkbox-label-wrap">
                        <strong>Chat Shell Panel (Center-Left)</strong>
                        <span>Mounts the primary chat dialogue panel.</span>
                    </div>
                </label>
                <label class="form-checkbox-row">
                    <input type="checkbox" id="ui-fileManager" ${comp.fileManager ? "checked" : ""}>
                    <div class="checkbox-label-wrap">
                        <strong>File Explorer & Workspace Editor (Center-Right)</strong>
                        <span>Mounts the monaco editor tab and project file explorer.</span>
                    </div>
                </label>
                <label class="form-checkbox-row">
                    <input type="checkbox" id="ui-sidebarLeft" ${comp.sidebarLeft !== false ? "checked" : ""}>
                    <div class="checkbox-label-wrap">
                        <strong>AI Assistant Sidebar (Far-Left)</strong>
                        <span>Mounts the partner commentary ticker and private whisper panel.</span>
                    </div>
                </label>
                <label class="form-checkbox-row">
                    <input type="checkbox" id="ui-partnerTicker" ${comp.partnerTicker ? "checked" : ""} ${comp.sidebarLeft === false ? "disabled" : ""}>
                    <div class="checkbox-label-wrap">
                        <strong>Partner Ticker Feed</strong>
                        <span>Displays real-time commentary logs inside the assistant sidebar.</span>
                    </div>
                </label>
                <label class="form-checkbox-row">
                    <input type="checkbox" id="ui-sidebarRight" ${comp.sidebarRight ? "checked" : ""}>
                    <div class="checkbox-label-wrap">
                        <strong>System Control Panel (Far-Right)</strong>
                        <span>Mounts the project list, status polling, and optimize buttons.</span>
                    </div>
                </label>
                <label class="form-checkbox-row">
                    <input type="checkbox" id="ui-mainHeader" ${comp.mainHeader ? "checked" : ""}>
                    <div class="checkbox-label-wrap">
                        <strong>Top Header Control Row</strong>
                        <span>Displays active project badge and global layout switches.</span>
                    </div>
                </label>
            </div>
        `;

        // Bind form checks
        const ids = ["chat", "fileManager", "sidebarLeft", "partnerTicker", "sidebarRight", "mainHeader"];
        ids.forEach(id => {
            const check = container.querySelector(`#ui-${id}`);
            if (check) {
                check.addEventListener("change", (e) => {
                    const checked = e.target.checked;
                    const settings = ctx.getSettings();
                    if (id === "sidebarLeft") {
                        settings.ui.components.sidebarLeft = checked;
                        settings.assistant.enabled = checked;
                        // Toggle sub-panel ticker status too
                        const ticker = container.querySelector("#ui-partnerTicker");
                        if (ticker) {
                            ticker.disabled = !checked;
                            if (!checked) {
                                ticker.checked = false;
                                settings.ui.components.partnerTicker = false;
                            }
                        }
                    } else if (id === "partnerTicker") {
                        settings.ui.components.partnerTicker = checked;
                    } else {
                        settings.ui.components[id] = checked;
                    }

                    ctx.updateMockup();
                });
            }
        });
    }

    // ── Primary AI ───────────────────────────────────────────

    function renderPrimaryAi(container, ctx) {
        const _settings = ctx.getSettings();
        container.innerHTML = `
            <h3>Primary AI Engine</h3>
            <p class="tab-desc">Configure your core inference routing mode and language model parameters.</p>
            <div class="settings-form">
                <div class="form-group">
                    <label>Connectivity & Inference Source</label>
                    <select id="ai-source" class="sdoa-select">
                        <option value="local" ${_settings.ai.source === "local" ? "selected" : ""}>Local Offline (Llama.cpp / GGUF)</option>
                        <option value="cloud" ${_settings.ai.source === "cloud" ? "selected" : ""}>Cloud API (OpenRouter / Anthropic)</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Routing Logic</label>
                    <select id="routing-mode" class="sdoa-select">
                        <option value="single" ${_settings.routing.routingMode === "single" ? "selected" : ""}>Single — Direct chat to model</option>
                        <option value="multi" ${_settings.routing.routingMode === "multi" ? "selected" : ""}>Multi — Orchestrated Pipeline</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Primary Model Identifier</label>
                    <input type="text" id="ai-model" class="sdoa-input" value="${_settings.ai.model || ""}">
                </div>
                <div class="form-group-row">
                    <div class="form-group">
                        <label>Max Tokens</label>
                        <input type="number" id="ai-maxTokens" class="sdoa-input" value="${_settings.ai.maxTokens || 4096}">
                    </div>
                    <div class="form-group">
                        <label>Temperature</label>
                        <input type="number" id="ai-temp" class="sdoa-input" step="0.1" value="${_settings.ai.temperature || 0.2}">
                    </div>
                </div>
            </div>
        `;

        container.querySelector("#ai-source").addEventListener("change", (e) => {
            const settings = ctx.getSettings();
            settings.ai.source = e.target.value;
            // Auto update recommended models depending on source choice
            const modelInput = container.querySelector("#ai-model");
            if (modelInput) {
                if (e.target.value === "cloud") {
                    modelInput.value = "claude-3-5-sonnet";
                    settings.ai.model = "claude-3-5-sonnet";
                } else {
                    modelInput.value = "qwen2.5-coder";
                    settings.ai.model = "qwen2.5-coder";
                }
            }
        });
        container.querySelector("#routing-mode").addEventListener("change", (e) => {
            ctx.getSettings().routing.routingMode = e.target.value;
        });
        container.querySelector("#ai-model").addEventListener("input", (e) => {
            ctx.getSettings().ai.model = e.target.value;
        });
        container.querySelector("#ai-maxTokens").addEventListener("input", (e) => {
            ctx.getSettings().ai.maxTokens = parseInt(e.target.value, 10);
        });
        container.querySelector("#ai-temp").addEventListener("input", (e) => {
            ctx.getSettings().ai.temperature = parseFloat(e.target.value);
        });
    }

    // ── Assistant AI ─────────────────────────────────────────

    function renderAssistantAi(container, ctx) {
        const _settings = ctx.getSettings();
        container.innerHTML = `
            <h3>Assistant AI (Silent Partner)</h3>
            <p class="tab-desc">Configure the autonomous background observer that reviews your terminal edits and generates commentary.</p>
            <div class="settings-form">
                <label class="form-checkbox-row">
                    <input type="checkbox" id="as-enabled" ${_settings.assistant.enabled ? "checked" : ""}>
                    <div class="checkbox-label-wrap">
                        <strong>Enable Silent Partner</strong>
                        <span>If disabled, the commentary worker will be suspended.</span>
                    </div>
                </label>
                <div class="form-group">
                    <label>Partner Personality Archetype</label>
                    <select id="as-archetype" class="sdoa-select" ${_settings.assistant.enabled ? "" : "disabled"}>
                        <option value="default" ${_settings.assistant.archetype === "default" ? "selected" : ""}>Default Observer</option>
                        <option value="critic" ${_settings.assistant.archetype === "critic" ? "selected" : ""}>Code Critic</option>
                        <option value="support" ${_settings.assistant.archetype === "support" ? "selected" : ""}>Quiet Supporter</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Assistant Model Identifier</label>
                    <input type="text" id="as-model" class="sdoa-input" value="${_settings.assistant.model || ""}" ${_settings.assistant.enabled ? "" : "disabled"}>
                </div>
            </div>
        `;

        const check = container.querySelector("#as-enabled");
        const arch = container.querySelector("#as-archetype");
        const model = container.querySelector("#as-model");

        check.addEventListener("change", (e) => {
            const enabled = e.target.checked;
            const settings = ctx.getSettings();
            settings.assistant.enabled = enabled;
            settings.ui.components.sidebarLeft = enabled;
            if (!enabled) {
                settings.ui.components.partnerTicker = false;
            }

            arch.disabled = !enabled;
            model.disabled = !enabled;
            ctx.updateMockup();
        });

        arch.addEventListener("change", (e) => {
            ctx.getSettings().assistant.archetype = e.target.value;
        });

        model.addEventListener("input", (e) => {
            ctx.getSettings().assistant.model = e.target.value;
        });
    }

    // ── Profiles ─────────────────────────────────────────────

    function renderProfiles(container, ctx) {
        const _settings = ctx.getSettings();
        container.innerHTML = `
            <h3>User Profile Governance</h3>
            <p class="tab-desc">Switch between active human profiles. Isolation levels protect different workspaces.</p>
            <div class="settings-form">
                <div class="form-group">
                    <label>Active Operator Profile</label>
                    <select id="prof-active" class="sdoa-select">
                        ${_settings.users.profiles.map(p => `
                            <option value="${p}" ${_settings.users.activeUser === p ? "selected" : ""}>${p.toUpperCase()}</option>
                        `).join("")}
                    </select>
                </div>
                <div class="form-group">
                    <label>Create New Profile</label>
                    <div style="display:flex; gap:8px;">
                        <input type="text" id="prof-new" class="sdoa-input" placeholder="e.g. auditor" style="flex:1;">
                        <button id="prof-add-btn" class="sdoa-button sdoa-button--secondary sdoa-button--md">Add</button>
                    </div>
                </div>
            </div>
        `;

        container.querySelector("#prof-active").addEventListener("change", (e) => {
            ctx.getSettings().users.activeUser = e.target.value;
        });

        const newBtn = container.querySelector("#prof-add-btn");
        const newInp = container.querySelector("#prof-new");
        newBtn.addEventListener("click", () => {
            const name = newInp.value.trim().toLowerCase();
            const settings = ctx.getSettings();
            if (name && !settings.users.profiles.includes(name)) {
                settings.users.profiles.push(name);
                settings.users.activeUser = name;
                ctx.showTab("profiles");
                window.ToastPrim?.show(`Added profile "${name}"`, "success");
            }
        });
    }

    // ── Files ────────────────────────────────────────────────

    function renderFiles(container, ctx) {
        const _settings = ctx.getSettings();
        container.innerHTML = `
            <h3>Virtual File System (VFS)</h3>
            <p class="tab-desc">Define the absolute path of the local workspace root folder and files ignored by watchers.</p>
            <div class="settings-form">
                <div class="form-group">
                    <label>Workspace Root Directory</label>
                    <input type="text" id="file-root" class="sdoa-input" value="${_settings.files.workspaceRoot || ""}">
                </div>
                <div class="form-group">
                    <label>Watch Ignored Patterns (Comma-separated)</label>
                    <textarea id="file-ignores" class="sdoa-input" rows="4">${_settings.files.ignorePatterns || ""}</textarea>
                </div>
            </div>
        `;

        container.querySelector("#file-root").addEventListener("input", (e) => {
            ctx.getSettings().files.workspaceRoot = e.target.value;
        });
        container.querySelector("#file-ignores").addEventListener("input", (e) => {
            ctx.getSettings().files.ignorePatterns = e.target.value;
        });
    }

    // ── Backend ──────────────────────────────────────────────

    function renderBackend(container, ctx) {
        const _settings = ctx.getSettings();
        container.innerHTML = `
            <h3>Sidecar Conductor Configuration</h3>
            <p class="tab-desc">Configure the Node.js backend runner. Restricting parameters protects local processes.</p>
            <div class="settings-form">
                <div class="form-group">
                    <label>Internal Server API Port</label>
                    <input type="number" id="back-port" class="sdoa-input" value="${_settings.backend.serverPort || 3001}">
                </div>
                <div class="form-group">
                    <label>Runner Log Output Level</label>
                    <select id="back-log" class="sdoa-select">
                        <option value="error" ${_settings.backend.logLevel === "error" ? "selected" : ""}>Error (Minimal)</option>
                        <option value="warn" ${_settings.backend.logLevel === "warn" ? "selected" : ""}>Warn</option>
                        <option value="info" ${_settings.backend.logLevel === "info" ? "selected" : ""}>Info</option>
                        <option value="debug" ${_settings.backend.logLevel === "debug" ? "selected" : ""}>Debug (Verbose)</option>
                    </select>
                </div>
                <label class="form-checkbox-row">
                    <input type="checkbox" id="back-restart" ${_settings.backend.autoRestart ? "checked" : ""}>
                    <div class="checkbox-label-wrap">
                        <strong>Auto-restart sidecar process on crash</strong>
                        <span>Rust supervisor monitors Node and respawns it automatically.</span>
                    </div>
                </label>
            </div>
        `;

        container.querySelector("#back-port").addEventListener("input", (e) => {
            ctx.getSettings().backend.serverPort = parseInt(e.target.value, 10);
        });
        container.querySelector("#back-log").addEventListener("change", (e) => {
            ctx.getSettings().backend.logLevel = e.target.value;
        });
        container.querySelector("#back-restart").addEventListener("change", (e) => {
            ctx.getSettings().backend.autoRestart = e.target.checked;
        });
    }

    // ── Frontend ─────────────────────────────────────────────

    function renderFrontend(container, ctx) {
        const _settings = ctx.getSettings();
        container.innerHTML = `
            <h3>Frontend Engine Tokens</h3>
            <p class="tab-desc">Configure UI rendering presets, density metrics, and layout animations.</p>
            <div class="settings-form">
                <label class="form-checkbox-row">
                    <input type="checkbox" id="front-anim" ${_settings.frontend.animations ? "checked" : ""}>
                    <div class="checkbox-label-wrap">
                        <strong>Enable UI Animations</strong>
                        <span>Toggles rendering transitions for split panels. Disable to save CPU.</span>
                    </div>
                </label>
                <label class="form-checkbox-row">
                    <input type="checkbox" id="front-compact" ${_settings.frontend.compactMode ? "checked" : ""}>
                    <div class="checkbox-label-wrap">
                        <strong>Compact Density Mode</strong>
                        <span>Hides tags and shrinks font lines for data-heavy coding.</span>
                    </div>
                </label>
                <div class="form-group-row">
                    <div class="form-group">
                        <label>Accent Tone Color</label>
                        <input type="color" id="front-accent" class="sdoa-input" style="height:38px; padding:2px;" value="${_settings.frontend.themeAccent || "#E0FAFF"}">
                    </div>
                    <div class="form-group">
                        <label>App Base Background</label>
                        <input type="color" id="front-bg" class="sdoa-input" style="height:38px; padding:2px;" value="${_settings.frontend.themeBgDeep || "#1C1D1F"}">
                    </div>
                </div>
            </div>
        `;

        container.querySelector("#front-anim").addEventListener("change", (e) => {
            ctx.getSettings().frontend.animations = e.target.checked;
        });
        container.querySelector("#front-compact").addEventListener("change", (e) => {
            ctx.getSettings().frontend.compactMode = e.target.checked;
        });
        container.querySelector("#front-accent").addEventListener("change", (e) => {
            ctx.getSettings().frontend.themeAccent = e.target.value;
        });
        container.querySelector("#front-bg").addEventListener("change", (e) => {
            ctx.getSettings().frontend.themeBgDeep = e.target.value;
        });
    }

    // ── Exports ───────────────────────────────────────────────

    const component = {
        MANIFEST,
        renderPresets, renderUiLoader, renderPrimaryAi, renderAssistantAi,
        renderProfiles, renderFiles, renderBackend, renderFrontend
    };
    window.SplashScreenTabs = component;
    if (window.ModuleLoader) window.ModuleLoader.register(MANIFEST, component);

})();
