// ============================================================
// SplashScreen.feature.js — SDOA v5 Startup gate & config feature
// version: 5.0.0
// Last modified: 2026-07-14
//
// Phase 5 oversized-file split: the two static config tables
// (DEFAULT_SETTINGS/PRESETS) moved to SplashScreenData.utility.js and
// the eight settings-tab renderers moved to SplashScreenTabs.component.js
// (both take an explicit ctx object — see _buildCtx() below). This core
// keeps lifecycle, the DOM shell, engine-status polling, event wiring,
// the tab dispatcher, mockup sync, validation, and save/launch/exit.
// ============================================================

(function () {
    "use strict";

    const MANIFEST = {
        id: "SplashScreen.feature",
        type: "feature",
        layer: 1,
        runtime: "Browser",
        version: "5.0.0",
        capabilities: ["startup-gate", "settings-configuration", "workspace-presets"],
        requires: ["StateStore", "SplashScreenData.utility", "SplashScreenTabs.component"],
        dependencies: ["StateStore", "SplashScreenData.utility", "SplashScreenTabs.component"],
        lifecycle: ["init"],
        docs: {
            description: "Premium settings splash screen overlay. Blocks launch until core settings are validated and confirmed. Static config tables and tab renderers extracted to siblings as part of the Phase 5 oversized-file split.",
            author: "ProtoAI Team"
        },
        last_modified: "2026-07-14"
    };

    let _settings = null;
    let _originalSettingsStr = "";
    let _activeTab = "presets";
    let _resolvePromise = null;
    let _overlayEl = null;

    function _buildCtx() {
        return {
            getSettings: () => _settings,
            setSettings: (s) => { _settings = s; },
            deepMerge:   _deepMerge,
            updateMockup: () => _updateMockup(),
            showTab:      (id) => _showTab(id)
        };
    }

    async function init() {
        console.log("[SplashScreen] Initialized.");
    }

    function open(initialSettings = {}) {
        return new Promise((resolve) => {
            _resolvePromise = resolve;

            // Merge default configurations to ensure no blank fields
            const DEFAULT_SETTINGS = window.SplashScreenData.DEFAULT_SETTINGS;
            _settings = _deepMerge(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), initialSettings);
            _originalSettingsStr = JSON.stringify(_settings);

            _renderDOM();
            _wireEvents();
            _updateMockup();
            _showTab(_activeTab);
        });
    }

    function _deepMerge(target, source) {
        const out = { ...target };
        for (const key of Object.keys(source)) {
            if (
                source[key] &&
                typeof source[key] === "object" &&
                !Array.isArray(source[key]) &&
                out[key] &&
                typeof out[key] === "object"
            ) {
                out[key] = _deepMerge(out[key], source[key]);
            } else {
                out[key] = source[key];
            }
        }
        return out;
    }

    function _renderDOM() {
        if (_overlayEl) _overlayEl.remove();

        _overlayEl = document.createElement("div");
        _overlayEl.id = "startup-splash";
        _overlayEl.className = "splash-overlay";

        _overlayEl.innerHTML = `
            <div class="splash-card">
                <div class="splash-header">
                    <div class="splash-logo">
                        <span>P</span>
                    </div>
                    <div class="splash-title-wrap">
                        <h2>ProtoAI <span style="font-size: 12px; color: #ff00ff; border: 1px solid #ff00ff; padding: 2px 6px; border-radius: 4px; vertical-align: middle; margin-left: 6px;">v1.5.0</span></h2>
                        <div class="splash-subtitle">Initialization & Launch Manager</div>
                    </div>
                    <div class="splash-status-indicator">
                        <span id="splash-engine-dot" class="status-dot offline"></span>
                        <span id="splash-engine-text">Scanning Environment...</span>
                    </div>
                </div>

                <div class="splash-body">
                    <!-- Left: Navigation Sidebar -->
                    <div class="splash-tabs-nav">
                        <button class="splash-tab-btn" data-tab="presets"><span>⚡</span> Presets</button>
                        <button class="splash-tab-btn" data-tab="ui"><span>🎨</span> UI Loader</button>
                        <button class="splash-tab-btn" data-tab="primaryAi"><span>🧠</span> Primary AI</button>
                        <button class="splash-tab-btn" data-tab="assistantAi"><span>🤖</span> Assistant AI</button>
                        <button class="splash-tab-btn" data-tab="profiles"><span>👤</span> Profiles</button>
                        <button class="splash-tab-btn" data-tab="files"><span>📁</span> Files</button>
                        <button class="splash-tab-btn" data-tab="backend"><span>⚙️</span> Backend</button>
                        <button class="splash-tab-btn" data-tab="frontend"><span>🖥️</span> Frontend</button>
                    </div>

                    <!-- Center: Settings Form Pane -->
                    <div class="splash-settings-content">
                        <!-- Tab contents will be injected dynamically -->
                    </div>

                    <!-- Right: Live Mockup View -->
                    <div class="splash-mockup-pane">
                        <div class="mockup-header">LIVE CONSOLE PREVIEW</div>
                        <div class="mockup-svg-wrap">
                            <svg viewBox="0 0 400 250" class="layout-mockup-svg">
                                <!-- Background grid -->
                                <defs>
                                    <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
                                        <path d="M 10 0 L 0 0 0 10" fill="none" stroke="rgba(224, 250, 255, 0.02)" stroke-width="0.5"/>
                                    </pattern>
                                </defs>
                                <rect width="100%" height="100%" fill="url(#grid)" rx="4"/>

                                <!-- Main Header (topNav / titleBar) -->
                                <rect id="mock-mainHeader" x="80" y="10" width="235" height="25" rx="3" class="mock-panel" data-toggle-key="mainHeader" />
                                <text x="197" y="26" font-size="8" font-family="JetBrains Mono" fill="rgba(224,250,255,0.4)" text-anchor="middle" pointer-events="none">HEADER PANEL</text>

                                <!-- Left Sidebar (Assistant Sidebar) -->
                                <rect id="mock-sidebarLeft" x="10" y="10" width="65" height="230" rx="3" class="mock-panel" data-toggle-key="sidebarLeft" />
                                <text x="42" y="125" font-size="8" font-family="JetBrains Mono" fill="rgba(224,250,255,0.4)" text-anchor="middle" pointer-events="none" transform="rotate(-90 42 125)">ASSISTANT</text>

                                <!-- Inner Ticker Mock inside Assistant Sidebar -->
                                <rect id="mock-partnerTicker" x="15" y="45" width="55" height="60" rx="2" class="mock-panel sub-panel" data-toggle-key="partnerTicker" />
                                <text x="42" y="78" font-size="6" font-family="JetBrains Mono" fill="rgba(224,250,255,0.3)" text-anchor="middle" pointer-events="none">TICKER</text>

                                <!-- Main Workspace Area -->
                                <!-- Left Workspace Pane (Chat panel) -->
                                <rect id="mock-chat" x="80" y="40" width="115" height="200" rx="3" class="mock-panel" data-toggle-key="chat" />
                                <text x="137" y="145" font-size="8" font-family="JetBrains Mono" fill="rgba(224,250,255,0.4)" text-anchor="middle" pointer-events="none">CHAT SHELL</text>

                                <!-- Right Workspace Pane (FileExplorer / Editor / Terminal) -->
                                <rect id="mock-fileManager" x="200" y="40" width="115" height="200" rx="3" class="mock-panel" data-toggle-key="fileManager" />
                                <text x="257" y="145" font-size="8" font-family="JetBrains Mono" fill="rgba(224,250,255,0.4)" text-anchor="middle" pointer-events="none">FILES/EDITOR</text>

                                <!-- Right Sidebar -->
                                <rect id="mock-sidebarRight" x="320" y="10" width="70" height="230" rx="3" class="mock-panel" data-toggle-key="sidebarRight" />
                                <text x="355" y="125" font-size="8" font-family="JetBrains Mono" fill="rgba(224,250,255,0.4)" text-anchor="middle" pointer-events="none" transform="rotate(90 355 125)">CONTROL</text>
                            </svg>
                        </div>
                        <div class="mockup-hint">Hover or click mockup elements to toggle. Red-dashed lines indicate disabled modules.</div>
                    </div>
                </div>

                <div class="splash-footer">
                    <div id="splash-validation-msg" class="validation-msg hidden"></div>
                    <div class="splash-action-btns">
                        <button id="splash-btn-exit" class="sdoa-button sdoa-button--ghost sdoa-button--md">Cancel (Esc)</button>
                        <button id="splash-btn-continue" class="sdoa-button sdoa-button--primary sdoa-button--md">Confirm & Launch (Enter)</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(_overlayEl);
        _updateEngineStatus();
    }

    async function _updateEngineStatus() {
        const dot = document.getElementById("splash-engine-dot");
        const txt = document.getElementById("splash-engine-text");
        if (!dot || !txt) return;

        try {
            const ready = await window.backendConnector?.getBackendStatus();
            if (ready === "ready" || ready === "tauri") {
                dot.className = "status-dot tauri";
                txt.textContent = "Engine Connected (Tauri VFS Active)";
            } else if (ready === "initializing") {
                dot.className = "status-dot initializing";
                txt.textContent = "Booting Sidecar...";
            } else {
                dot.className = "status-dot offline";
                txt.textContent = "Sidecar Offline (Offline Cache Enabled)";
            }
        } catch (e) {
            dot.className = "status-dot offline";
            txt.textContent = "Bridge Offline (Local Hydration)";
        }
    }

    function _wireEvents() {
        // Tab buttons click
        _overlayEl.querySelectorAll(".splash-tab-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                _showTab(btn.dataset.tab);
            });
        });

        // Continue and Exit buttons
        document.getElementById("splash-btn-continue").addEventListener("click", () => _continueLaunch());
        document.getElementById("splash-btn-exit").addEventListener("click", () => _exitApp());

        // Keyboard listeners
        window.addEventListener("keydown", _handleKeydown);

        // SVG Interactive Mockup listeners
        const panels = _overlayEl.querySelectorAll(".layout-mockup-svg .mock-panel");
        panels.forEach(p => {
            const key = p.getAttribute("data-toggle-key");

            // Hover highlight effect
            p.addEventListener("mouseenter", () => {
                p.classList.add("highlighted");
            });
            p.addEventListener("mouseleave", () => {
                p.classList.remove("highlighted");
            });

            // Click to toggle
            p.addEventListener("click", () => {
                let currentVal = false;
                if (key === "partnerTicker") {
                    currentVal = _settings.ui.components.partnerTicker;
                    _settings.ui.components.partnerTicker = !currentVal;
                } else if (key === "sidebarLeft") {
                    currentVal = _settings.ui.components.sidebarLeft !== false;
                    _settings.ui.components.sidebarLeft = !currentVal;
                    // If left sidebar is toggled, also align assistant.enabled
                    _settings.assistant.enabled = !currentVal;
                } else if (key === "chat") {
                    currentVal = _settings.ui.components.chat;
                    _settings.ui.components.chat = !currentVal;
                } else if (key === "fileManager") {
                    currentVal = _settings.ui.components.fileManager;
                    _settings.ui.components.fileManager = !currentVal;
                } else if (key === "sidebarRight") {
                    currentVal = _settings.ui.components.sidebarRight;
                    _settings.ui.components.sidebarRight = !currentVal;
                } else if (key === "mainHeader") {
                    currentVal = _settings.ui.components.mainHeader;
                    _settings.ui.components.mainHeader = !currentVal;
                }

                _updateMockup();
                // If the active tab is UI loader, re-render it to sync checkboxes
                if (_activeTab === "ui") {
                    _showTab("ui");
                }
            });
        });
    }

    function _handleKeydown(e) {
        if (!_overlayEl) return;

        // Space and Enter triggers Continue
        if (e.key === "Enter" || e.key === " ") {
            // Avoid conflict if the user is typing in a textarea or text input
            if (document.activeElement && (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA")) {
                return;
            }
            e.preventDefault();
            _continueLaunch();
        }

        // Esc key exits application
        if (e.key === "Escape") {
            e.preventDefault();
            _exitApp();
        }
    }

    function _showTab(tabId) {
        _activeTab = tabId;

        // Toggle active class on tab buttons
        _overlayEl.querySelectorAll(".splash-tab-btn").forEach(btn => {
            btn.classList.toggle("active", btn.dataset.tab === tabId);
        });

        const container = _overlayEl.querySelector(".splash-settings-content");
        container.innerHTML = ""; // Clear existing form fields

        const contentWrap = document.createElement("div");
        contentWrap.className = `tab-panel tab-panel-${tabId}`;

        const ctx = _buildCtx();
        const Tabs = window.SplashScreenTabs;
        switch (tabId) {
            case "presets":
                Tabs.renderPresets(contentWrap, ctx);
                break;
            case "ui":
                Tabs.renderUiLoader(contentWrap, ctx);
                break;
            case "primaryAi":
                Tabs.renderPrimaryAi(contentWrap, ctx);
                break;
            case "assistantAi":
                Tabs.renderAssistantAi(contentWrap, ctx);
                break;
            case "profiles":
                Tabs.renderProfiles(contentWrap, ctx);
                break;
            case "files":
                Tabs.renderFiles(contentWrap, ctx);
                break;
            case "backend":
                Tabs.renderBackend(contentWrap, ctx);
                break;
            case "frontend":
                Tabs.renderFrontend(contentWrap, ctx);
                break;
        }

        container.appendChild(contentWrap);
    }

    // ── Validation and Mockup Updates ────────────────────────

    function _updateMockup() {
        if (!_overlayEl) return;

        const comp = _settings.ui.components;
        const keys = {
            chat: comp.chat,
            fileManager: comp.fileManager,
            sidebarLeft: comp.sidebarLeft !== false,
            partnerTicker: comp.partnerTicker && comp.sidebarLeft !== false,
            sidebarRight: comp.sidebarRight,
            mainHeader: comp.mainHeader
        };

        for (const [key, enabled] of Object.entries(keys)) {
            const rect = _overlayEl.querySelector(`#mock-${key}`);
            if (rect) {
                if (enabled) {
                    rect.classList.remove("disabled");
                    rect.classList.add("active");
                } else {
                    rect.classList.remove("active");
                    rect.classList.add("disabled");
                }
            }
        }
    }

    function _validate() {
        const errors = [];

        // Rule 1: AI Model identifiers must be populated if AI is enabled
        if (_settings.ai.model.trim() === "") {
            errors.push("Primary AI Model Identifier cannot be empty.");
        }
        if (_settings.assistant.enabled && _settings.assistant.model.trim() === "") {
            errors.push("Assistant AI Model Identifier cannot be empty.");
        }

        // Rule 2: If Connectivity source is Cloud API, warn if API Keys are empty
        if (_settings.ai.source === "cloud") {
            const keys = window.StateStore?.get("settings")?.apiKeys || {};
            const hasKey = keys.openrouter || keys.anthropic || keys.openai;
            if (!hasKey) {
                errors.push("Cloud API selected, but no API Keys detected. Please set up API Keys.");
            }
        }

        // Rule 3: Workspace directory must be provided
        if (!_settings.files.workspaceRoot || _settings.files.workspaceRoot.trim() === "") {
            errors.push("Workspace root folder directory must be specified.");
        }

        const msgEl = document.getElementById("splash-validation-msg");
        if (errors.length > 0) {
            msgEl.textContent = "⚠ " + errors[0];
            msgEl.classList.remove("hidden");
            return false;
        } else {
            msgEl.textContent = "";
            msgEl.classList.add("hidden");
            return true;
        }
    }

    // ── Save and Launch Actions ────────────────────────────────

    async function _continueLaunch() {
        if (!_validate()) {
            window.ToastPrim?.show("Validation failed. Please review settings.", "error");
            return;
        }

        const isModified = JSON.stringify(_settings) !== _originalSettingsStr;

        // Clean up listeners
        window.removeEventListener("keydown", _handleKeydown);

        // Hide overlay DOM
        if (_overlayEl) {
            _overlayEl.classList.add("fade-out");
            setTimeout(() => {
                _overlayEl.remove();
                _overlayEl = null;
            }, 300);
        }

        // Write settings to StateStore
        window.StateStore?.set("settings", _settings);

        if (isModified) {
            console.log("[SplashScreen] Settings modified. Saving to disk...");
            // Save settings to backend sidecar
            try {
                if (window.backendConnector && window.backendConnector.runWorkflow) {
                    await window.backendConnector.runWorkflow("settings_set", {
                        key: "", value: _settings
                    });
                }
            } catch (err) {
                console.warn("[SplashScreen] Backend write failed, relying on offline local storage:", err.message);
            }

            // Since it's a restart-driven flow for modified settings:
            console.log("[SplashScreen] Modified launch. Requesting application reload...");
            window.ToastPrim?.show("Settings updated. Rebooting console...", "warning");
            setTimeout(() => {
                location.reload(); // Reload UI to apply newly saved settings
            }, 800);
        } else {
            console.log("[SplashScreen] Unmodified launch. Proceeding directly...");
        }

        // Resolve the promise to continue boot sequence
        if (_resolvePromise) {
            _resolvePromise(_settings);
            _resolvePromise = null;
        }
    }

    function _exitApp() {
        console.log("[SplashScreen] Esc pressed or Cancel clicked. Exiting application.");
        window.ToastPrim?.show("Exiting ProtoAI...", "info");
        setTimeout(() => {
            if (window.__TAURI__) {
                try {
                    window.__TAURI__.window.getCurrentWindow().close();
                } catch (e) {
                    try {
                        window.__TAURI__.window.getCurrent().close();
                    } catch (e2) {
                        window.close();
                    }
                }
            } else {
                window.close();
            }
        }, 300);
    }

    // ── Export ────────────────────────────────────────────────
    const feature = { MANIFEST, init, open };
    window.SplashScreenFeature = feature;

    if (window.ModuleLoader) {
        window.ModuleLoader.register(MANIFEST, feature);
    }

})();
