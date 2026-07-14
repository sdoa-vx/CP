/* ============================================================
   AppShell.feature.js — SDOA v4 Feature Core
   version: 4.3.0
   Last modified: 2026-05-11
   Changes vs 4.2.0:
     - Split view now mounts FileExplorer in right pane instead
       of showing a blank panel. Deactivating unmounts cleanly.
     - Quick Actions: wired New Chat, Summarize, Translate,
       Code Assistant, Explain Code handlers.
     - Project list right-click: Rename, Duplicate, Delete.
     - Router.service.js restored _handleChatIPC / _handleMultiModelSendIPC
       (were truncated from source); history now saves both turns.
   ============================================================ */

(function () {
    "use strict";

    const { domReady } = window.TauriUtils;

    const MANIFEST = {
        id:      "AppShell.feature",
        type:    "feature",
        layer:   1,
        runtime: "Browser",
        version: "4.3.1",
        "non-sdoa-compliant": true,
        requires: [],
        docs: {
            description: "Exceeds 500-line hard cap, pending refactor in Phase 5. Core UI orchestrator for resizing, global shortcuts, project switching, and system status.",
            author: "ProtoAI Team"
        }
    };

    let _sidebarCollapsed = false;

    // ── Module Interface ──────────────────────────────────────

    async function init() {
        console.log("[AppShell.feature] Initializing v4.3.0...");
        try {
            _verifyDOM();
            _wireResizers();
            _wireShortcuts();
            _wireUI();
            _wireSendModeToggle();
            _wireQuickSwap();
            _wireRunWorkflow();
            _initHistoryPanel();
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
                _updateActiveProjectUI();
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

    async function updateQuickSwap() {
        const select = document.getElementById("otfmsEngineSelect");
        if (!select) return;

        try {
            const res = await window.backendConnector?.runWorkflow("get_model_inventory");
            const inventory = res?.models || res?.data?.models || [];

            let html = `<option value="">— Profile Default —</option>`;

            // Group by provider
            const providers = {};
            inventory.forEach(m => {
                const p = m.provider || "Local";
                if (!providers[p]) providers[p] = [];
                providers[p].push(m);
            });

            for (const [p, models] of Object.entries(providers)) {
                html += `<optgroup label="${p}">`;
                models.forEach(m => {
                    html += `<option value="${m.id}">${m.name || m.id}</option>`;
                });
                html += `</optgroup>`;
            }

            select.innerHTML = html;

            // Restore saved
            const saved = localStorage.getItem("protoai:quickswap:engine") || "";
            if (select.querySelector(`option[value="${CSS.escape(saved)}"]`)) {
                select.value = saved;
            }
        } catch (err) {
            console.warn("[AppShell] Failed to load dynamic models for quick swap:", err);
        }
    }

    function _wireUI() {
        // Essential Buttons
        document.getElementById("refreshProjectsBtn")?.addEventListener("click", () => loadProjects());
        document.getElementById("openSettingsButton")?.addEventListener("click", () => window.openSettingsPanel?.());
        document.getElementById("newProjectBtn")?.addEventListener("click", () => _openNewProjectModal());

        document.getElementById("npCloseBtn")?.addEventListener("click", () => _closeNewProjectModal());
        document.getElementById("npCancelBtn")?.addEventListener("click", () => _closeNewProjectModal());

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
                _closeNewProjectModal();
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

            switch (action) {
                case "image":
                    _handlePromptCreator();
                    break;
                case "image_gen":
                    _handleImageGen();
                    break;
                case "deepsearch":
                    _handleDeepSearch();
                    break;
                case "new_chat":
                    _handleNewChat();
                    break;
                case "split_screen":
                    _toggleSplitView();
                    break;
                case "summarize":
                    _handleSummarize();
                    break;
                case "translate":
                    _handleTranslate();
                    break;
                case "code_assist":
                    _handleCodeAssist();
                    break;
                case "explain_code":
                    _handleExplainCode();
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

    // ── Quick Swap ────────────────────────────────────────────

    async function _wireQuickSwap() {
        const select   = document.getElementById("otfmsEngineSelect");
        const applyBtn = document.getElementById("applyEngineBtn");
        if (!select || !applyBtn) return;

        // Add search filter for models
        const searchInput = document.createElement("input");
        searchInput.type = "text";
        searchInput.className = "sdoa-input";
        searchInput.placeholder = "Filter engines…";
        searchInput.style.cssText = "font-size:11px; padding:4px 8px; margin-bottom:4px;";
        select.parentElement.insertBefore(searchInput, select);

        searchInput.addEventListener("input", (e) => {
            const filter = e.target.value.toLowerCase();
            select.querySelectorAll("option").forEach(opt => {
                if (!opt.value) return;
                opt.style.display = opt.textContent.toLowerCase().includes(filter) ? "" : "none";
            });
            select.querySelectorAll("optgroup").forEach(group => {
                const hasVisible = Array.from(group.querySelectorAll("option")).some(o => o.style.display !== "none");
                group.style.display = hasVisible ? "" : "none";
            });
        });

        await updateQuickSwap();

        applyBtn.addEventListener("click", () => {
            const model = select.value;
            window.quickSwapEngine = model || undefined;
            localStorage.setItem("protoai:quickswap:engine", model);

            const opt = select.querySelector(`option[value="${CSS.escape(model)}"]`);
            const label = opt ? opt.textContent : model;

            if (model) {
                window.ToastPrim?.show(`Quick Swap active: ${label}`, "info");
            } else {
                window.ToastPrim?.show("Quick Swap cleared — using profile default.", "info");
            }

            applyBtn.textContent = model ? "✓ Applied" : "Apply to Chat";
            setTimeout(() => { applyBtn.textContent = "Apply to Chat"; }, 2000);
        });

        window.EventBus?.on("models:updated", () => updateQuickSwap());

        // When FileExplorer opens a file, load it into Monaco if editor pane is active
        window.EventBus?.on("filemanager:fileOpened", async ({ path }) => {
            if (!_splitActive || _splitMode !== "editor" || !path) return;
            try {
                const res = await window.backendConnector?.runWorkflow("fs_read_file", { path });
                const text = res?.content || res?.data?.content || "";
                if (_monacoEditor) {
                    window.CodeEditorPrim?.setValue(_monacoEditor, text);
                    const ext = path.split(".").pop().toLowerCase();
                    const langMap = { js:"javascript", ts:"typescript", py:"python", rs:"rust",
                                      json:"json", html:"html", css:"css", md:"markdown" };
                    const lang = langMap[ext] || "plaintext";
                    window.CodeEditorPrim?.setLanguage(_monacoEditor, lang);
                    const label = document.getElementById("monacoFileLabel");
                    if (label) label.textContent = path.split(/[\/]/).pop();
                    const sel = document.getElementById("monacoLangSelect");
                    if (sel) sel.value = lang;
                }
            } catch (err) {
                window.ToastPrim?.show("Could not load file: " + (err.message || err), "error");
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

    // ── Handlers ──────────────────────────────────────────────

    function _handlePromptCreator() {
        const input = document.getElementById("chatInput");
        if (!input || !input.value.trim()) {
            window.ToastPrim?.show("Type a basic prompt first!", "info");
            return;
        }
        window.EventBus?.emit("chat:promptOptimize", { text: input.value });
    }

    async function _handleImageGen() {
        const input      = document.getElementById("chatInput");
        const promptText = input?.value || "A futuristic AI laboratory";
        window.ToastPrim?.show("Generating image...", "info");
        try {
            const res = await window.backendConnector?.runWorkflow("image_gen", { text: promptText, project: window.currentProject || "default" });
            const url = res?.data?.url || res?.url || res?.data?.path || res?.path;
            if (url) {
                window.EventBus?.emit("chat:appendSystemMessage", { text: `Generated: ![Image](${url})` });
            }
        } catch (err) {
            window.ToastPrim?.show("Image generation failed: " + err.message, "error");
        }
    }

    function _handleDeepSearch() {
        const input = document.getElementById("chatInput");
        if (!input || !input.value.trim()) {
            window.ToastPrim?.show("Enter a research topic first.", "info");
            return;
        }
        window.EventBus?.emit("chat:deepSearch", { query: input.value });
    }

    function _handleNewChat() {
        const msgList = document.getElementById("chatMessages");
        if (msgList) {
            msgList.innerHTML = `
                <div class="chat-empty-state" style="text-align:center; padding-top:100px; color:var(--text-dim);">
                    <h2>ProtoAI Assistant</h2>
                    <p>New chat started. Type a message to begin.</p>
                </div>
            `;
        }
        document.getElementById("chatInput")?.focus();
        window.ToastPrim?.show("New chat started", "info");
        window.EventBus?.emit("chat:cleared", {});
    }

    function _handleSummarize() {
        const messages = document.querySelectorAll(".chat-message--assistant .content");
        const lastMsg  = messages[messages.length - 1];
        const text     = lastMsg?.textContent?.trim();
        if (!text) {
            window.ToastPrim?.show("No assistant message to summarize yet.", "info");
            return;
        }
        const input = document.getElementById("chatInput");
        if (input) {
            input.value = `Please summarize the following in 3 bullet points:\n\n${text.slice(0, 1000)}`;
            input.style.height = "auto";
            input.style.height = input.scrollHeight + "px";
        }
        window.ToastPrim?.show("Summarize prompt loaded — press Enter to send", "info");
    }

    function _handleTranslate() {
        const LANGUAGES = [
            "Spanish", "French", "German", "Italian", "Portuguese",
            "Japanese", "Chinese (Simplified)", "Chinese (Traditional)",
            "Korean", "Russian", "Arabic", "Hindi", "Dutch",
            "Swedish", "Polish", "Turkish", "Vietnamese", "Thai"
        ];

        const existing = document.getElementById("translatePickerOverlay");
        if (existing) { existing.remove(); return; }

        const overlay = document.createElement("div");
        overlay.id = "translatePickerOverlay";
        overlay.style.cssText = [
            "position:fixed;z-index:9999;top:50%;left:50%;",
            "transform:translate(-50%,-50%);",
            "background:var(--bg-surface);border:1px solid var(--border-subtle);",
            "border-radius:12px;padding:16px;min-width:230px;",
            "box-shadow:0 8px 32px rgba(0,0,0,0.6);"
        ].join("");
        overlay.innerHTML = `
            <div style="font-size:12px;font-weight:700;margin-bottom:10px;color:var(--text);">🌐 Translate To</div>
            <select id="translateLangSelect" class="sdoa-select" style="width:100%;margin-bottom:12px;">
                ${LANGUAGES.map(l => `<option value="${l}">${l}</option>`).join("")}
            </select>
            <div style="display:flex;gap:6px;justify-content:flex-end;">
                <button id="translateCancelBtn" class="sdoa-button sdoa-button--ghost sdoa-button--sm">Cancel</button>
                <button id="translateGoBtn" class="sdoa-button sdoa-button--primary sdoa-button--sm">Translate ➤</button>
            </div>`;
        document.body.appendChild(overlay);

        const lastLang = localStorage.getItem("protoai:translate:lang") || "Spanish";
        const sel = overlay.querySelector("#translateLangSelect");
        if (sel) sel.value = lastLang;

        overlay.querySelector("#translateCancelBtn").addEventListener("click", () => overlay.remove());
        overlay.querySelector("#translateGoBtn").addEventListener("click", () => {
            const lang = overlay.querySelector("#translateLangSelect").value;
            localStorage.setItem("protoai:translate:lang", lang);
            overlay.remove();
            const input = document.getElementById("chatInput");
            const currentText = input?.value?.trim();
            if (currentText) {
                input.value = `Translate the following to ${lang}:\n\n${currentText}`;
            } else {
                const messages = document.querySelectorAll(".chat-message .content");
                const lastMsg  = messages[messages.length - 1];
                const text     = lastMsg?.textContent?.trim();
                if (!text) { window.ToastPrim?.show("Type text to translate, or send a message first.", "info"); return; }
                if (input) input.value = `Translate the following to ${lang}:\n\n${text.slice(0, 1000)}`;
            }
            window.ToastPrim?.show(`Translate to ${lang} — press Enter to send`, "info");
        });
        setTimeout(() => {
            document.addEventListener("click", function _closeTranslate(e) {
                if (!overlay.contains(e.target)) { overlay.remove(); document.removeEventListener("click", _closeTranslate); }
            });
        }, 100);
    }

    function _handleCodeAssist() {
        const input       = document.getElementById("chatInput");
        const currentText = input?.value?.trim();
        if (currentText) {
            input.value = `As a code assistant, help me with:\n\n${currentText}`;
        } else {
            if (input) input.value = "I need help writing code for: ";
        }
        input?.focus();
        window.ToastPrim?.show("Code Assistant — describe what you need", "info");
    }

    function _handleExplainCode() {
        const input       = document.getElementById("chatInput");
        const currentText = input?.value?.trim();
        if (currentText) {
            input.value = `Please explain this code step by step:\n\`\`\`\n${currentText}\n\`\`\``;
        } else {
            if (input) input.value = "Explain this code:\n```\n\n```";
        }
        input?.focus();
        window.ToastPrim?.show("Explain Code — paste your code and press Enter", "info");
    }

    // ── Split View ────────────────────────────────────────────

    let _splitActive = false;
    let _splitMode = "files"; // "files" | "editor"
    let _monacoEditor = null;

    function _toggleSplitView() {
        _splitActive = !_splitActive;
        const workspace = document.getElementById("workspace");
        const paneRight = document.getElementById("pane-right");
        const btn       = document.getElementById("splitToggleBtn");

        if (workspace) workspace.classList.toggle("split-active", _splitActive);
        if (paneRight) paneRight.classList.toggle("split-visible", _splitActive);
        if (btn) {
            btn.title = _splitActive ? "Close split view (Ctrl+Shift+E)" : "Toggle split view (Ctrl+Shift+E)";
            btn.classList.toggle("active", _splitActive);
        }

        if (_splitActive) {
            _renderRightModeTabs();
            _mountRightPane(_splitMode);
        } else {
            _clearRightPane();
            window.ToastPrim?.show("Split view closed", "info");
        }
    }

    function _renderRightModeTabs() {
        const bar = document.getElementById("rightModeTabs");
        if (!bar) return;
        const tabs = [
            { id: "files",    label: "📁 Files"    },
            { id: "editor",   label: "📝 Editor"   },
            { id: "terminal", label: "📟 Terminal" }
        ];
        bar.innerHTML = tabs.map(t => {
            const active = t.id === _splitMode;
            return `<button class="sdoa-tabgroup__tab${active ? " sdoa-tabgroup__tab--active" : ""}"
                data-right-mode="${t.id}" style="font-size:12px; padding:4px 12px;">${t.label}</button>`;
        }).join("");
        bar.querySelectorAll("[data-right-mode]").forEach(btn => {
            btn.addEventListener("click", () => {
                _splitMode = btn.dataset.rightMode;
                _renderRightModeTabs();
                _mountRightPane(_splitMode);
            });
        });
    }

    function _mountRightPane(mode) {
        const content = document.getElementById("rightPaneContent");
        if (!content) return;

        // Dispose Monaco if active
        if (_monacoEditor) {
            window.CodeEditorPrim?.dispose(_monacoEditor);
            _monacoEditor = null;
        }
        // Unmount terminal if active
        if (window.TerminalFeature?.unmount) {
            window.TerminalFeature.unmount();
        }

        if (mode === "files") {
            content.innerHTML = "";
            if (window.FileExplorerFeature?.mount) {
                window.FileExplorerFeature.mount(content);
                if (window.currentProject) window.FileExplorerFeature.setRootPath?.(window.currentProject);
                window.ToastPrim?.show("Split view — File Explorer", "info");
            } else {
                content.innerHTML = `<div style="padding:20px;color:var(--text-dim);text-align:center;margin-top:60px;font-size:13px;">File Explorer</div>`;
            }
        } else if (mode === "editor") {
            content.innerHTML = "";
            content.style.cssText = "position:relative; display:flex; flex-direction:column; height:100%;";

            // Toolbar: language selector + file name indicator
            const toolbar = document.createElement("div");
            toolbar.style.cssText = "display:flex; align-items:center; gap:8px; padding:6px 10px; background:var(--bg-deep); border-bottom:1px solid var(--border-subtle); flex-shrink:0;";
            toolbar.innerHTML = `
                <span id="monacoFileLabel" style="font-size:11px; color:var(--text-dim); flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">No file open</span>
                <select id="monacoLangSelect" class="sdoa-select" style="font-size:11px; padding:2px 6px; height:24px; width:120px;">
                    <option value="javascript">JavaScript</option>
                    <option value="typescript">TypeScript</option>
                    <option value="python">Python</option>
                    <option value="rust">Rust</option>
                    <option value="json">JSON</option>
                    <option value="html">HTML</option>
                    <option value="css">CSS</option>
                    <option value="markdown">Markdown</option>
                    <option value="plaintext">Plain Text</option>
                </select>
                <button id="monacoCopyBtn" class="sdoa-button sdoa-button--ghost sdoa-button--sm" style="font-size:11px; padding:2px 8px; height:24px;">Copy</button>
                <button id="monacoClearBtn" class="sdoa-button sdoa-button--ghost sdoa-button--sm" style="font-size:11px; padding:2px 8px; height:24px;">Clear</button>
            `;
            content.appendChild(toolbar);

            const editorDiv = document.createElement("div");
            editorDiv.id = "monacoEditorMount";
            editorDiv.style.cssText = "flex:1; min-height:0;";
            content.appendChild(editorDiv);

            // Create editor asynchronously
            (async () => {
                _monacoEditor = await window.CodeEditorPrim?.create(editorDiv, {
                    language: "javascript",
                    value: "// ProtoAI Code Editor\n// Open a file via the File Explorer or paste code here.\n",
                });
                window.ToastPrim?.show("Split view — Monaco Editor", "info");

                // Wire toolbar buttons
                const langSel = content.querySelector("#monacoLangSelect");
                langSel?.addEventListener("change", () => {
                    window.CodeEditorPrim?.setLanguage(_monacoEditor, langSel.value);
                });

                content.querySelector("#monacoCopyBtn")?.addEventListener("click", () => {
                    const val = window.CodeEditorPrim?.getValue(_monacoEditor) || "";
                    navigator.clipboard?.writeText(val);
                    window.ToastPrim?.show("Copied to clipboard", "info");
                });

                content.querySelector("#monacoClearBtn")?.addEventListener("click", () => {
                    window.CodeEditorPrim?.setValue(_monacoEditor, "");
                });
            })();
        } else if (mode === "terminal") {
            content.innerHTML = "";
            content.style.cssText = "position:relative; display:flex; flex-direction:column; height:100%;";
            if (window.TerminalFeature?.mount) {
                window.TerminalFeature.mount({ container: content, shell: "powershell" });
                window.ToastPrim?.show("Split view — Terminal", "info");
            } else {
                content.innerHTML = `<div style="padding:20px;color:var(--text-dim);text-align:center;margin-top:60px;font-size:13px;">Terminal module not loaded</div>`;
            }
        }
    }

    function _clearRightPane() {
        const content = document.getElementById("rightPaneContent");
        if (_monacoEditor) {
            window.CodeEditorPrim?.dispose(_monacoEditor);
            _monacoEditor = null;
        }
        if (window.TerminalFeature?.unmount) {
            window.TerminalFeature.unmount();
        }
        if (content) content.innerHTML = "";
        const bar = document.getElementById("rightModeTabs");
        if (bar) bar.innerHTML = "";
    }

    // ── Project Management ────────────────────────────────────

    function _openNewProjectModal() {
        const overlay = document.getElementById("newProjectOverlay");
        if (overlay) {
            overlay.classList.remove("hidden");
            overlay.classList.add("sdoa-modal-overlay--visible");
            const input = document.getElementById("npName");
            if (input) { input.value = ""; input.focus(); }
        }
    }

    function _closeNewProjectModal() {
        const overlay = document.getElementById("newProjectOverlay");
        if (overlay) {
            overlay.classList.add("hidden");
            overlay.classList.remove("sdoa-modal-overlay--visible");
        }
    }

    async function _promptRenameProject(name) {
        const newName = prompt(`Rename project "${name}" to:`, name);
        if (!newName || newName.trim() === name) return;
        try {
            await window.backendConnector?.runWorkflow("rename_project", { project: name, newName: newName.trim() });
            window.ToastPrim?.show(`Renamed to "${newName.trim()}"`, "success");
            if (window.currentProject === name) window.currentProject = newName.trim();
            await loadProjects();
        } catch (err) {
            window.ToastPrim?.show("Rename failed: " + (err.message || err), "error");
        }
    }

    async function _duplicateProject(name) {
        const newName = prompt(`Duplicate "${name}" as:`, name + " Copy");
        if (!newName || !newName.trim()) return;
        try {
            await window.backendConnector?.runWorkflow("duplicate_project", { project: name, newName: newName.trim() });
            window.ToastPrim?.show(`Duplicated as "${newName.trim()}"`, "success");
            await loadProjects();
        } catch (err) {
            window.ToastPrim?.show("Duplicate failed: " + (err.message || err), "error");
        }
    }

    async function _confirmDeleteProject(name) {
        if (!confirm(`Delete project "${name}"? This cannot be undone.`)) return;
        try {
            await window.backendConnector?.runWorkflow("delete_project", { project: name });
            window.ToastPrim?.show(`Project "${name}" deleted`, "success");
            if (window.currentProject === name) window.currentProject = null;
            await loadProjects();
        } catch (err) {
            window.ToastPrim?.show("Delete failed: " + (err.message || err), "error");
        }
    }

    async function loadProjects() {
        const list = document.getElementById("projectList");
        if (!list) return;

        try {
            console.log("[AppShell] Syncing projects with backend...");
            const res      = await window.backendConnector?.runWorkflow("projects");
            const projects = res?.projects || res?.data?.projects || [];

            list.innerHTML = projects.map(p => {
                const name   = typeof p === "string" ? p : (p.name || "Unknown");
                const isSelf = name.toLowerCase() === "protoai";
                return `
                    <li class="project-item ${window.currentProject === name ? "active" : ""}" data-project="${name}"
                        style="display:flex; align-items:center; gap:8px; padding:6px 8px; border-radius:6px; cursor:pointer; list-style:none; margin-bottom:2px; font-size:12px;">
                        <span class="icon">${isSelf ? "🤖" : "📁"}</span>
                        <span class="name" style="flex:1; font-weight: 500;">${name}</span>
                        ${isSelf ? '<span class="sdoa-badge" style="font-size:9px; background:var(--accent); color:white;">SELF</span>' : ""}
                    </li>
                `;
            }).join("");

            list.querySelectorAll(".project-item").forEach(item => {
                item.addEventListener("click", () => selectProject(item.dataset.project));

                // Right-click context menu for project management
                item.addEventListener("contextmenu", (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const p = item.dataset.project;
                    window.ContextMenuPrim?.show({
                        items: [
                            { label: "Open Project",      icon: "📂", onClick: () => selectProject(p) },
                            { separator: true },
                            { label: "Rename Project",    icon: "✏️",  onClick: () => _promptRenameProject(p) },
                            { label: "Duplicate Project", icon: "📋", onClick: () => _duplicateProject(p) },
                            { separator: true },
                            { label: "Delete Project",    icon: "🗑", danger: true, onClick: () => _confirmDeleteProject(p) },
                        ],
                        position: { x: e.clientX, y: e.clientY }
                    });
                });
            });

            const countEl = document.getElementById("projectCount");
            if (countEl) countEl.textContent = projects.length;

            _updateActiveProjectUI();
        } catch (err) {
            console.error("[AppShell] Failed to load projects:", err);
            window.ToastPrim?.show("Project list unavailable", "error");
        }
    }

    function selectProject(project) {
        console.log(`[AppShell] Context Switch: ${project}`);
        window.currentProject = project;
        if (window.StateStore) window.StateStore.set("currentProject", project);
        localStorage.setItem("protoai:currentProject", project);
        window.EventBus?.emit("app:projectSelected", { project });
        _updateActiveProjectUI();
    }

    function _updateActiveProjectUI() {
        document.querySelectorAll(".project-item").forEach(item => {
            item.classList.toggle("active", item.dataset.project === window.currentProject);
        });
        const status = document.getElementById("currentProjectName");
        if (status) status.textContent = window.currentProject || "No project selected";
    }

    function updateProfileUI() {
        const currentProfile = localStorage.getItem("protoai:profile:active") || "default";
        const badge = document.getElementById("profileBadge");
        if (badge) badge.textContent = currentProfile.charAt(0).toUpperCase();
        const text = document.getElementById("currentProfileName");
        if (text) text.textContent = currentProfile;
    }

    // ── History Panel ─────────────────────────────────────────

    function _initHistoryPanel() {
        const toggle     = document.getElementById("historyToggle");
        const content    = document.getElementById("historyContent");
        const chevron    = document.getElementById("historyChevron");
        const refreshBtn = document.getElementById("refreshHistoryBtn");
        if (!toggle || !content) return;

        const collapsed = localStorage.getItem("protoai:history:collapsed") !== "false";
        content.style.display = collapsed ? "none" : "block";
        if (chevron) chevron.textContent = collapsed ? "▶" : "▼";

        toggle.addEventListener("click", () => {
            const isHidden = content.style.display === "none";
            content.style.display = isHidden ? "block" : "none";
            if (chevron) chevron.textContent = isHidden ? "▼" : "▶";
            localStorage.setItem("protoai:history:collapsed", isHidden ? "false" : "true");
            if (isHidden) _loadHistory();
        });

        refreshBtn?.addEventListener("click", () => _loadHistory());
        window.EventBus?.on("chat:sessionCreated", () => _loadHistory());
        window.EventBus?.on("app:projectSelected", () => {
            if (content.style.display !== "none") _loadHistory();
        });

        if (!collapsed) _loadHistory();
    }

    async function _loadHistory() {
        const list  = document.getElementById("historyList");
        const empty = document.getElementById("historyListEmpty");
        if (!list) return;

        const project = window.currentProject;
        if (!project) {
            list.innerHTML = "";
            if (empty) { empty.style.display = "block"; empty.textContent = "Select a project first."; }
            return;
        }

        try {
            list.innerHTML = `<li style="padding:8px 12px;color:var(--text-dim);font-size:11px;">Loading…</li>`;
            const res = await window.backendConnector?.runWorkflow("chat_session", { action: "list", project });
            const sessions = (res?.data || res?.sessions || []);

            if (!sessions.length) {
                list.innerHTML = "";
                if (empty) { empty.style.display = "block"; empty.textContent = "No sessions yet."; }
                return;
            }
            if (empty) empty.style.display = "none";

            list.innerHTML = sessions.slice(-25).reverse().map(s => {
                const label = s.name || (s.id ? s.id.slice(0, 10) : "Session");
                const ts    = s.updatedAt || s.createdAt;
                const ago   = ts ? _relativeTime(ts) : "";
                return `<li data-chat-id="${s.id}" style="cursor:pointer;padding:6px 10px;border-radius:6px;font-size:11px;display:flex;align-items:center;gap:6px;margin-bottom:2px;">
                    <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">💬 ${label}</span>
                    ${ago ? `<span style="color:var(--text-dim);font-size:9px;flex-shrink:0;">${ago}</span>` : ""}
                </li>`;
            }).join("");

            list.querySelectorAll("[data-chat-id]").forEach(item => {
                item.addEventListener("click", () => {
                    const chatId = item.dataset.chatId;
                    window.EventBus?.emit("chat:loadSession", { project, chatId });
                    window.ToastPrim?.show("Loading session…", "info");
                });
                item.addEventListener("mouseenter", () => item.style.background = "rgba(255,255,255,0.04)");
                item.addEventListener("mouseleave", () => item.style.background = "");
            });
        } catch (err) {
            console.warn("[AppShell] Failed to load history:", err);
            list.innerHTML = `<li style="padding:8px 12px;color:var(--error);font-size:11px;">Failed to load sessions</li>`;
        }
    }

    function _relativeTime(ts) {
        const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
        if (diff < 60)    return `${diff}s ago`;
        if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
        return `${Math.floor(diff / 86400)}d ago`;
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
