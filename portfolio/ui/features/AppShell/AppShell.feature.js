/* ============================================================
   AppShell.feature.js — SDOA v5 Feature Core
   version: 5.0.0
   Last modified: 2026-07-14

   Phase 5 oversized-file split: quick-action handlers moved to
   AppShellQuickActions.component.js, the split-view subsystem moved
   to AppShellSplitView.component.js, the Quick Swap engine selector
   moved to AppShellQuickSwap.utility.js, and the project list/history
   panel moved to AppShellProjectPanel.component.js. This core keeps
   boot sequencing, DOM verification, resizers/shortcuts, appearance
   settings, the global [data-action] click delegate, send-mode toggle,
   model status dots, and the run_workflow admin caller.

   The split-view state (_splitActive/_splitMode/_monacoEditor) stays
   here rather than moving with its subsystem because it's also read
   from the app:projectSelected EventBus listener (below) and from the
   Quick Swap file-open listener — both siblings receive it via an
   explicit ctx object built by _buildSplitCtx().
   ============================================================ */

(function () {
    "use strict";

    const { domReady } = window.TauriUtils;

    const MANIFEST = {
        id:      "AppShell.feature",
        type:    "feature",
        layer:   1,
        runtime: "Browser",
        version: "5.0.0",
        capabilities: ["shell-orchestration", "project-switching", "split-view", "quick-swap"],
        requires: ["AppShellQuickActions.component", "AppShellSplitView.component", "AppShellQuickSwap.utility", "AppShellProjectPanel.component"],
        dependencies: ["AppShellQuickActions.component", "AppShellSplitView.component", "AppShellQuickSwap.utility", "AppShellProjectPanel.component"],
        docs: {
            description: "Core UI orchestrator for resizing, global shortcuts, project switching, and system status. Quick actions, split view, quick swap, and the project/history panel extracted to siblings as part of the Phase 5 oversized-file split.",
            author: "ProtoAI Team"
        },
        last_modified: "2026-07-14"
    };

    let _sidebarCollapsed = false;
    let _splitActive = false;
    let _splitMode = "files"; // "files" | "editor"
    let _monacoEditor = null;

    function _buildSplitCtx() {
        return {
            getSplitActive:  () => _splitActive,
            setSplitActive:  (v) => { _splitActive = v; },
            getSplitMode:    () => _splitMode,
            setSplitMode:    (v) => { _splitMode = v; },
            getMonacoEditor: () => _monacoEditor,
            setMonacoEditor: (v) => { _monacoEditor = v; }
        };
    }

    // ── Module Interface ──────────────────────────────────────

    async function init() {
        console.log("[AppShell.feature] Initializing v5.0.0...");
        try {
            _verifyDOM();
            _wireResizers();
            _wireShortcuts();
            _wireUI();
            _wireSendModeToggle();
            window.AppShellQuickSwap.wireQuickSwap(_buildSplitCtx());
            _wireRunWorkflow();
            window.AppShellProjectPanel.initHistoryPanel();
            _refreshModelStatus();

            await loadProjects();

            // Auto-restore project if available (useful for OOM reload recovery)
            const savedProject = localStorage.getItem("protoai:currentProject");
            if (savedProject) {
                selectProject(savedProject);
            }

            updateProfileUI();

            // Listen for project selection from elsewhere
            window.EventBus?.on("app:projectSelected", (payload) => {
                window.currentProject = payload.project;
                window.AppShellProjectPanel.updateActiveProjectUI();
                // Update file explorer root if split view is open
                if (_splitActive && window.FileExplorerFeature?.setRootPath) {
                    window.FileExplorerFeature.setRootPath(payload.project);
                }
            });

            // ── Appearance System ──────────────────────────────────
            window.EventBus?.on("settings:changed", (settings) => {
                _applyAppearanceSettings(settings);
            });
            // Initial apply from StateStore or backend
            const initSettings = window.StateStore?.get("settings") || {};
            _applyAppearanceSettings(initSettings);

            console.log("[AppShell.feature] Boot sequence finalized.");
        } catch (err) {
            console.error("[AppShell.feature] Boot failed:", err);
            window.EventBus?.emit("module:error", { id: MANIFEST.id, phase: "init", error: err.message });
        }
    }

    function _verifyDOM() {
        const required = [
            "sidebar-left", "resizer-left", "main", "projectList",
            "currentProjectName", "currentProfileName"
        ];
        const missing = required.filter(id => !document.getElementById(id));
        if (missing.length > 0) {
            throw new Error(`Critical DOM elements missing: ${missing.join(", ")}`);
        }
    }

    // ── Interaction Wiring ────────────────────────────────────

    function _wireResizers() {
        const resizer = document.getElementById("resizer-left");
        const sidebar = document.getElementById("sidebar-left");
        if (!resizer || !sidebar) {
            console.warn("[AppShell] Skipping resizers — elements not found.");
            return;
        }

        let isResizing = false;
        resizer.addEventListener("mousedown", () => {
            isResizing = true;
            document.body.style.cursor = "col-resize";
            document.body.classList.add("is-resizing");
        });

        document.addEventListener("mousemove", (e) => {
            if (!isResizing) return;
            const width = Math.max(200, Math.min(600, e.clientX));
            sidebar.style.width = `${width}px`;
        });

        document.addEventListener("mouseup", () => {
            if (!isResizing) return;
            isResizing = false;
            document.body.style.cursor = "default";
            document.body.classList.remove("is-resizing");
        });
    }

    function _wireShortcuts() {
        window.addEventListener("keydown", (e) => {
            const ctrl = e.metaKey || e.ctrlKey;

            // Ctrl+B — toggle sidebar
            if (ctrl && !e.shiftKey && e.key === "b") {
                e.preventDefault();
                _toggleSidebar();
            }

            // Ctrl+, — settings
            if (ctrl && !e.shiftKey && e.key === ",") {
                e.preventDefault();
                window.openSettingsPanel?.();
            }

            // Ctrl+Shift+S — settings (advertised on button tooltip)
            if (ctrl && e.shiftKey && e.key.toLowerCase() === "s") {
                e.preventDefault();
                window.openSettingsPanel?.();
            }

            // Ctrl+Shift+E — toggle split view
            if (ctrl && e.shiftKey && e.key.toLowerCase() === "e") {
                e.preventDefault();
                _toggleSplitView();
            }
        });
    }

    function _toggleSidebar() {
        const sidebar = document.getElementById("sidebar-left");
        _sidebarCollapsed = !_sidebarCollapsed;
        sidebar?.classList.toggle("collapsed", _sidebarCollapsed);
    }

    // ── Appearance Management ─────────────────────────────────

    function _applyAppearanceSettings(settings) {
        if (!settings) return;
        const root = document.documentElement;

        // Typography
        if (settings.fontSans) root.style.setProperty("--font-sans", settings.fontSans);
        if (settings.fontMono) root.style.setProperty("--font-mono", settings.fontMono);
        if (settings.fontSizeBase) root.style.setProperty("--text-base", `${settings.fontSizeBase}px`);

        // Zone-specific Typography
        if (settings.fontSizeChat) root.style.setProperty("--chat-font-size", `${settings.fontSizeChat}px`);
        if (settings.fontSizeSidebar) root.style.setProperty("--sidebar-font-size", `${settings.fontSizeSidebar}px`);

        // Theme Palette
        if (settings.themeBgDeep) root.style.setProperty("--bg-deep", settings.themeBgDeep);
        if (settings.themeBgSurface) root.style.setProperty("--bg-surface", settings.themeBgSurface);
        if (settings.themeAccent) root.style.setProperty("--accent", settings.themeAccent);
        if (settings.themeText) {
            root.style.setProperty("--text", settings.themeText);
            root.style.setProperty("--text-primary", settings.themeText);
        }

        // Advanced Details
        if (settings.themeRadius) root.style.setProperty("--radius", settings.themeRadius);
        if (settings.themeBorderSubtle) root.style.setProperty("--border-subtle", settings.themeBorderSubtle);
    }

    function _wireUI() {
        // Essential Buttons
        document.getElementById("refreshProjectsBtn")?.addEventListener("click", () => loadProjects());
        document.getElementById("openSettingsButton")?.addEventListener("click", () => window.openSettingsPanel?.());
        document.getElementById("newProjectBtn")?.addEventListener("click", () => window.AppShellProjectPanel.openNewProjectModal());

        document.getElementById("npCloseBtn")?.addEventListener("click", () => window.AppShellProjectPanel.closeNewProjectModal());
        document.getElementById("npCancelBtn")?.addEventListener("click", () => window.AppShellProjectPanel.closeNewProjectModal());

        document.getElementById("autoOptimizeBtn")?.addEventListener("click", async () => {
            const btn = document.getElementById("autoOptimizeBtn");
            if (btn) btn.disabled = true;
            window.ToastPrim?.show("Optimizing models for free tier...", "info");
            try {
                await window.backendConnector?.runWorkflow("auto_optimize", {});
                window.ToastPrim?.show("Model optimization complete!", "success");
            } catch (err) {
                window.ToastPrim?.show("Optimization failed: " + err.message, "error");
            } finally {
                if (btn) btn.disabled = false;
            }
        });

        // ── + New Project ─────────────────────────────────────
        document.getElementById("npCreateBtn")?.addEventListener("click", async () => {
            const nameInput = document.getElementById("npName");
            const name = nameInput?.value.trim();
            if (!name) {
                window.ToastPrim?.show("Enter a project name.", "error");
                return;
            }
            try {
                const btn = document.getElementById("npCreateBtn");
                if (btn) { btn.disabled = true; btn.textContent = "Creating…"; }
                await window.backendConnector?.runWorkflow("create_project", { name });
                window.ToastPrim?.show(`Project "${name}" created!`, "success");
                window.AppShellProjectPanel.closeNewProjectModal();
                if (nameInput) nameInput.value = "";
                await loadProjects();
                selectProject(name);
            } catch (err) {
                window.ToastPrim?.show("Failed to create project: " + (err.message || err), "error");
            } finally {
                const btn = document.getElementById("npCreateBtn");
                if (btn) { btn.disabled = false; btn.textContent = "Create Project"; }
            }
        });

        // ── Split screen toggle ───────────────────────────────
        document.getElementById("splitToggleBtn")?.addEventListener("click", () => _toggleSplitView());

        // ── Canvas collapse/expand ────────────────────────────
        document.getElementById("toggleCanvasBtn")?.addEventListener("click", () => {
            const right = document.getElementById("sidebar-right");
            if (right) right.classList.toggle("collapsed");
        });

        document.getElementById("sidebarReloadUI")?.addEventListener("click", () => {
            window.ToastPrim?.show("Refreshing Interface...", "info");
            setTimeout(() => location.reload(), 500);
        });

        document.getElementById("assistantSettingsBtn")?.addEventListener("click", () => window.openSettingsPanel?.());

        document.getElementById("sidebarRestartBackend")?.addEventListener("click", async () => {
            console.log("[AppShell] Triggering Sidecar Reboot...");
            window.ToastPrim?.show("Restarting sidecar engine...", "warning");
            try {
                await window.backendConnector?.runWorkflow("restart_engine");
                setTimeout(() => location.reload(), 2000);
            } catch (err) {
                window.ToastPrim?.show("Sidecar reboot failed: " + err.message, "error");
            }
        });

        // ── Global [data-action] chip delegate ────────────────
        console.log("[AppShell] Wiring click delegate for global [data-action] chips...");
        window.addEventListener("click", async (e) => {
            const btn = e.target.closest("[data-action]");
            if (!btn) return;

            const action  = btn.dataset.action;
            const project = window.currentProject || "default";

            console.log(`[AppShell] Quick Action: ${action} [Project: ${project}]`);

            const QuickActions = window.AppShellQuickActions;
            switch (action) {
                case "image":
                    QuickActions.handlePromptCreator();
                    break;
                case "image_gen":
                    QuickActions.handleImageGen();
                    break;
                case "deepsearch":
                    QuickActions.handleDeepSearch();
                    break;
                case "new_chat":
                    QuickActions.handleNewChat();
                    break;
                case "split_screen":
                    _toggleSplitView();
                    break;
                case "summarize":
                    QuickActions.handleSummarize();
                    break;
                case "translate":
                    QuickActions.handleTranslate();
                    break;
                case "code_assist":
                    QuickActions.handleCodeAssist();
                    break;
                case "explain_code":
                    QuickActions.handleExplainCode();
                    break;
                case "gdrive":
                    if (window.googleDriveConnector) {
                        window.googleDriveConnector.open(project);
                    } else {
                        window.ToastPrim?.show("Google Drive connector not loaded.", "error");
                    }
                    break;
                case "connectors":
                    window.ToastPrim?.show("Connectors panel coming soon! Use Google Drive for now.", "info");
                    break;
                default:
                    console.log(`[AppShell] No handler for action: ${action}`);
            }
        });
    }

    function _wireSendModeToggle() {
        const modeSingle = document.getElementById("sidebarModeSingle");
        const modeMulti  = document.getElementById("sidebarModeMulti");

        console.log("[AppShell] Initializing send-mode toggle state...");

        const updateModeUI = () => {
            const enabled = localStorage.getItem("protoai:orchestrator:enabled") !== "false";
            console.log(`[AppShell] Orchestrator Status: ${enabled ? "MULTI" : "SINGLE"}`);

            if (modeSingle) {
                modeSingle.classList.toggle("active", !enabled);
                modeSingle.style.background = !enabled ? "var(--bg-active)" : "transparent";
            }
            if (modeMulti) {
                modeMulti.classList.toggle("active", enabled);
                modeMulti.style.background  = enabled ? "var(--bg-active)" : "transparent";
            }
        };

        modeSingle?.addEventListener("click", () => {
            localStorage.setItem("protoai:orchestrator:enabled", "false");
            updateModeUI();
            window.EventBus?.emit("orchestrator:modeChanged", { enabled: false });
            window.EventBus?.emit("app:force_reset");
        });

        modeMulti?.addEventListener("click", () => {
            localStorage.setItem("protoai:orchestrator:enabled", "true");
            updateModeUI();
            window.EventBus?.emit("orchestrator:modeChanged", { enabled: true });
            window.EventBus?.emit("app:force_reset");
        });

        updateModeUI();
    }

    // ── Split View (thin wrapper — state lives here, logic in sibling) ──

    function _toggleSplitView() {
        window.AppShellSplitView.toggleSplitView(_buildSplitCtx());
    }

    // ── Project Management (thin wrappers — logic lives in sibling) ────

    function loadProjects() {
        return window.AppShellProjectPanel.loadProjects();
    }

    function selectProject(project) {
        return window.AppShellProjectPanel.selectProject(project);
    }

    function updateProfileUI() {
        return window.AppShellProjectPanel.updateProfileUI();
    }

    // ── Model Status ──────────────────────────────────────────

    async function _refreshModelStatus() {
        const setDot = (id, ok, title) => {
            const btn = document.getElementById(id);
            const dot = btn?.querySelector("span");
            if (dot) dot.style.color = ok ? "var(--success)" : "var(--error)";
            if (btn) btn.title = title;
        };

        try {
            const res = await window.backendConnector?.runWorkflow("settings_get", {});
            const s   = res?.data || res || {};

            const localOk = !!(s.localModelEnabled || s.localModel?.enabled);
            setDot("statusModel1", localOk, `Local Model (${localOk ? "Ready" : "Not provisioned"})`);

            const anthropicOk = !!(s.anthropicApiKey || s.apiKey || s["anthropic.apiKey"]);
            setDot("statusModel2", anthropicOk, `Housekeeper — Anthropic (${anthropicOk ? "Key set" : "No key"})`);

            const orOk = !!(s.openrouterApiKey || s.openRouterApiKey || s["openrouter.apiKey"]);
            setDot("statusModel3", orOk, `OpenRouter APIs (${orOk ? "Key set" : "No key"})`);
        } catch (_) {
            ["statusModel1", "statusModel2", "statusModel3"].forEach(id => {
                const dot = document.querySelector(`#${id} span`);
                if (dot) { dot.style.color = "var(--text-dim)"; }
            });
        }
    }

    // ── run_workflow Admin Caller ─────────────────────────────

    function _wireRunWorkflow() {
        // Right-click on 🧠 Models button to invoke a raw workflow (admin/debug)
        document.getElementById("openModelsButton")?.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            window.ContextMenuPrim?.show({
                items: [
                    { label: "⚙ Run Raw Workflow…", onClick: async () => {
                        const wf = prompt("Workflow name:");
                        if (!wf?.trim()) return;
                        try {
                            const res = await window.backendConnector?.runWorkflow("run_workflow", { workflow: wf.trim() });
                            window.ToastPrim?.show("run_workflow: " + JSON.stringify(res).slice(0, 80), "info");
                        } catch (err) {
                            window.ToastPrim?.show("run_workflow error: " + err.message, "error");
                        }
                    }},
                ],
                position: { x: e.clientX, y: e.clientY }
            });
        });
    }

    // ── Exports ───────────────────────────────────────────────

    const feature = { MANIFEST, init, loadProjects, selectProject, updateProfileUI };
    window.AppShellFeature = feature;
    if (window.ModuleLoader) window.ModuleLoader.register(MANIFEST, feature);

})();
