// ============================================================
// SplashScreen.feature.js — SDOA v4 Startup gate & config feature
// version: 1.0.0
// Last modified: 2026-06-01
// ============================================================

(function () {
    "use strict";

    const MANIFEST = {
        id: "SplashScreen.feature",
        type: "feature",
        layer: 1,
        runtime: "Browser",
        version: "1.0.1",
        "non-sdoa-compliant": true,
        requires: ["StateStore"],
        lifecycle: ["init"],
        docs: {
            description: "Exceeds 500-line hard cap, pending refactor in Phase 5. Premium settings splash screen overlay. Blocks launch until core settings are validated and confirmed.",
            author: "ProtoAI Team"
        }
    };

    const DEFAULT_SETTINGS = {
        ui: {
            components: {
                chat: true,
                fileManager: true,
                editor: true,
                partnerTicker: true,
                sidebarRight: true,
                mainHeader: true
            }
        },
        ai: {
            source: "local",
            model: "qwen2.5-coder",
            version: "latest",
            maxTokens: 4096,
            temperature: 0.2
        },
        assistant: {
            enabled: true,
            archetype: "default",
            model: "qwen2.5-coder"
        },
        routing: {
            routingMode: "multi"
        },
        users: {
            activeUser: "developer",
            profiles: ["developer", "researcher"]
        },
        files: {
            workspaceRoot: "c:/protoai",
            ignorePatterns: "node_modules, .git, dist, build"
        },
        backend: {
            serverPort: 3001,
            autoRestart: true,
            logLevel: "info"
        },
        frontend: {
            animations: true,
            compactMode: false,
            themeBgDeep: "#1C1D1F",
            themeBgSurface: "#242628",
            themeAccent: "#E0FAFF",
            themeText: "#E0FAFF"
        }
    };

    const PRESETS = {
        offlineMode: {
            name: "Offline Mode",
            desc: "Optimized for offline coding using local Qwen model. Minimal resource usage.",
            settings: {
                ui: {
                    components: {
                        chat: true,
                        fileManager: true,
                        editor: true,
                        partnerTicker: false,
                        sidebarRight: false,
                        mainHeader: true
                    }
                },
                ai: {
                    source: "local",
                    model: "qwen2.5-coder",
                    version: "latest",
                    maxTokens: 2048,
                    temperature: 0.2
                },
                assistant: {
                    enabled: false,
                    archetype: "default",
                    model: "qwen2.5-coder"
                },
                routing: {
                    routingMode: "single"
                }
            }
        },
        developerMode: {
            name: "Developer Mode",
            desc: "Full developer cockpit. Multi-model pipeline powered by local Qwen and sidecar.",
            settings: {
                ui: {
                    components: {
                        chat: true,
                        fileManager: true,
                        editor: true,
                        partnerTicker: true,
                        sidebarRight: true,
                        mainHeader: true
                    }
                },
                ai: {
                    source: "local",
                    model: "qwen2.5-coder",
                    version: "latest",
                    maxTokens: 4096,
                    temperature: 0.2
                },
                assistant: {
                    enabled: true,
                    archetype: "default",
                    model: "qwen2.5-coder"
                },
                routing: {
                    routingMode: "multi"
                }
            }
        },
        researchMode: {
            name: "Research Mode",
            desc: "Cloud-heavy setup utilizing OpenRouter/Anthropic APIs. High intelligence mode.",
            settings: {
                ui: {
                    components: {
                        chat: true,
                        fileManager: true,
                        editor: true,
                        partnerTicker: true,
                        sidebarRight: true,
                        mainHeader: true
                    }
                },
                ai: {
                    source: "cloud",
                    model: "claude-3-5-sonnet",
                    version: "latest",
                    maxTokens: 8192,
                    temperature: 0.3
                },
                assistant: {
                    enabled: true,
                    archetype: "critic",
                    model: "claude-3-5-sonnet"
                },
                routing: {
                    routingMode: "multi"
                }
            }
        },
        fullCockpit: {
            name: "Full Cockpit",
            desc: "Maximum capability mode. All sidebars, tickers, and model routing layers active.",
            settings: {
                ui: {
                    components: {
                        chat: true,
                        fileManager: true,
                        editor: true,
                        partnerTicker: true,
                        sidebarRight: true,
                        mainHeader: true
                    }
                },
                ai: {
                    source: "cloud",
                    model: "claude-3-5-sonnet",
                    version: "latest",
                    maxTokens: 8192,
                    temperature: 0.4
                },
                assistant: {
                    enabled: true,
                    archetype: "default",
                    model: "claude-3-5-sonnet"
                },
                routing: {
                    routingMode: "multi"
                }
            }
        }
    };

    let _settings = null;
    let _originalSettingsStr = "";
    let _activeTab = "presets";
    let _resolvePromise = null;
    let _overlayEl = null;

    async function init() {
        console.log("[SplashScreen] Initialized.");
    }

    function open(initialSettings = {}) {
        return new Promise((resolve) => {
            _resolvePromise = resolve;

            // Merge default configurations to ensure no blank fields
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

        switch (tabId) {
            case "presets":
                _renderPresets(contentWrap);
                break;
            case "ui":
                _renderUiLoader(contentWrap);
                break;
            case "primaryAi":
                _renderPrimaryAi(contentWrap);
                break;
            case "assistantAi":
                _renderAssistantAi(contentWrap);
                break;
            case "profiles":
                _renderProfiles(contentWrap);
                break;
            case "files":
                _renderFiles(contentWrap);
                break;
            case "backend":
                _renderBackend(contentWrap);
                break;
            case "frontend":
                _renderFrontend(contentWrap);
                break;
        }

        container.appendChild(contentWrap);
    }

    // ── Tab Renderers ─────────────────────────────────────────

    function _renderPresets(container) {
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
                _applyPreset(key);
                window.ToastPrim?.show(`Preset "${PRESETS[key].name}" applied!`, "success");
            });
        });
    }

    function _applyPreset(presetKey) {
        const preset = PRESETS[presetKey];
        if (!preset) return;

        // Merge preset settings into _settings
        _settings = _deepMerge(_settings, preset.settings);

        // Apply specific adjustments depending on preset properties
        if (presetKey === "offlineMode") {
            _settings.ui.components.partnerTicker = false;
            _settings.ui.components.sidebarRight = false;
            _settings.assistant.enabled = false;
        } else if (presetKey === "developerMode") {
            _settings.ui.components.partnerTicker = true;
            _settings.ui.components.sidebarRight = true;
            _settings.assistant.enabled = true;
        } else {
            _settings.ui.components.partnerTicker = true;
            _settings.ui.components.sidebarRight = true;
            _settings.assistant.enabled = true;
        }

        _updateMockup();
    }

    function _renderUiLoader(container) {
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
                    if (id === "sidebarLeft") {
                        _settings.ui.components.sidebarLeft = checked;
                        _settings.assistant.enabled = checked;
                        // Toggle sub-panel ticker status too
                        const ticker = container.querySelector("#ui-partnerTicker");
                        if (ticker) {
                            ticker.disabled = !checked;
                            if (!checked) {
                                ticker.checked = false;
                                _settings.ui.components.partnerTicker = false;
                            }
                        }
                    } else if (id === "partnerTicker") {
                        _settings.ui.components.partnerTicker = checked;
                    } else {
                        _settings.ui.components[id] = checked;
                    }

                    _updateMockup();
                });
            }
        });
    }

    function _renderPrimaryAi(container) {
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
            _settings.ai.source = e.target.value;
            // Auto update recommended models depending on source choice
            const modelInput = container.querySelector("#ai-model");
            if (modelInput) {
                if (e.target.value === "cloud") {
                    modelInput.value = "claude-3-5-sonnet";
                    _settings.ai.model = "claude-3-5-sonnet";
                } else {
                    modelInput.value = "qwen2.5-coder";
                    _settings.ai.model = "qwen2.5-coder";
                }
            }
        });
        container.querySelector("#routing-mode").addEventListener("change", (e) => {
            _settings.routing.routingMode = e.target.value;
        });
        container.querySelector("#ai-model").addEventListener("input", (e) => {
            _settings.ai.model = e.target.value;
        });
        container.querySelector("#ai-maxTokens").addEventListener("input", (e) => {
            _settings.ai.maxTokens = parseInt(e.target.value, 10);
        });
        container.querySelector("#ai-temp").addEventListener("input", (e) => {
            _settings.ai.temperature = parseFloat(e.target.value);
        });
    }

    function _renderAssistantAi(container) {
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
            _settings.assistant.enabled = enabled;
            _settings.ui.components.sidebarLeft = enabled;
            if (!enabled) {
                _settings.ui.components.partnerTicker = false;
            }

            arch.disabled = !enabled;
            model.disabled = !enabled;
            _updateMockup();
        });

        arch.addEventListener("change", (e) => {
            _settings.assistant.archetype = e.target.value;
        });

        model.addEventListener("input", (e) => {
            _settings.assistant.model = e.target.value;
        });
    }

    function _renderProfiles(container) {
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
            _settings.users.activeUser = e.target.value;
        });

        const newBtn = container.querySelector("#prof-add-btn");
        const newInp = container.querySelector("#prof-new");
        newBtn.addEventListener("click", () => {
            const name = newInp.value.trim().toLowerCase();
            if (name && !_settings.users.profiles.includes(name)) {
                _settings.users.profiles.push(name);
                _settings.users.activeUser = name;
                _showTab("profiles");
                window.ToastPrim?.show(`Added profile "${name}"`, "success");
            }
        });
    }

    function _renderFiles(container) {
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
            _settings.files.workspaceRoot = e.target.value;
        });
        container.querySelector("#file-ignores").addEventListener("input", (e) => {
            _settings.files.ignorePatterns = e.target.value;
        });
    }

    function _renderBackend(container) {
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
            _settings.backend.serverPort = parseInt(e.target.value, 10);
        });
        container.querySelector("#back-log").addEventListener("change", (e) => {
            _settings.backend.logLevel = e.target.value;
        });
        container.querySelector("#back-restart").addEventListener("change", (e) => {
            _settings.backend.autoRestart = e.target.checked;
        });
    }

    function _renderFrontend(container) {
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
            _settings.frontend.animations = e.target.checked;
        });
        container.querySelector("#front-compact").addEventListener("change", (e) => {
            _settings.frontend.compactMode = e.target.checked;
        });
        container.querySelector("#front-accent").addEventListener("change", (e) => {
            _settings.frontend.themeAccent = e.target.value;
        });
        container.querySelector("#front-bg").addEventListener("change", (e) => {
            _settings.frontend.themeBgDeep = e.target.value;
        });
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
