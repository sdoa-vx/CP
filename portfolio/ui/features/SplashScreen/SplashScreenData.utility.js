// ============================================================
// SplashScreenData.utility.js — SDOA v5 Utility | layer 2
// Updated: 2026-07-14
// Extracted from SplashScreen.feature.js (Phase 5 — oversized-file split).
// Carries the two large static config tables: DEFAULT_SETTINGS (the
// baseline settings object merged with whatever the caller passes into
// open()) and PRESETS (the four one-click workspace presets shown on
// the Presets tab). Pure data, no closure dependency on the feature's
// private state.
// ============================================================

(function () {
    "use strict";

    const MANIFEST = {
        id: "SplashScreenData.utility", type: "utility", layer: 2,
        runtime: "Browser", version: "1.0.0",
        requires: [],
        dependencies: [],
        docs: { description: "SplashScreen.feature.js's static config tables: DEFAULT_SETTINGS and PRESETS (offlineMode/developerMode/researchMode/fullCockpit). Pure data with no closure dependency. Extracted from SplashScreen.feature.js as part of the Phase 5 oversized-file split.", author: "ProtoAI Team" }
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

    // ── Exports ───────────────────────────────────────────────

    const component = { MANIFEST, DEFAULT_SETTINGS, PRESETS };
    window.SplashScreenData = component;
    if (window.ModuleLoader) window.ModuleLoader.register(MANIFEST, component);

})();
