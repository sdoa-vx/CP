/* ============================================================
   Chat.feature.js — SDOA v5 Chat Interface
   version: 5.0.0
   Last modified: 2026-07-14
   Changes vs 4.4.1:
     - Phase 5 (oversized-file split): extracted three sibling
       components:
         ChatRendering.utility.js — markdown/mermaid rendering,
           appendMessage, streaming-bubble helpers, Continuity Editor
           rewrite animation, clearHistory, scroll minimap. Zero
           dependency on this file's private state (pure functions).
         ChatSessions.utility.js  — session list/load/switch/create,
           message persistence, legacy history loader. Takes an
           explicit ctx object for _sessions/_currentSessionId/
           _currentProject (see that file's header for why).
         ChatSend.utility.js      — handleSend(), the full send/stream
           flow. Takes an explicit ctx object for _isStreaming/
           _history/_historyIdx/_currentProject/_currentSessionId.
       File was 972 lines (flagged non-sdoa-compliant purely for
       size); now under the Layer 2 cap and fully manifest-compliant.
       This file kept: init/mount lifecycle, DOM verification, all
       event wiring (_wireEvents), routing-mode toggle, input-history
       navigation (up/down arrow), prompt optimization, and deep
       search — the parts that either own the DOM construction itself
       or are too small to be worth splitting further.
   Changes vs 4.3.0 (historical):
     - Pass `profile` in every chat payload (was missing → Router
       returned "Missing required fields" for every message).
     - Pass `engine` override from Quick Swap when active.
     - Fix context menu: e.stopPropagation() prevents the global
       document.contextmenu → hide() from immediately destroying
       the menu after show() creates it.
     - Non-streaming error from backend surfaces as user-readable
       message instead of the generic "Model returned no text."
   ============================================================ */

(function () {
    "use strict";

    const MANIFEST = {
        id:      "Chat.feature",
        type:    "feature",
        layer:   2,
        runtime: "Browser",
        version: "5.0.0",
        capabilities: ["chat.send", "chat.sessionManagement", "chat.render"],
        requires: [
            "BackendConnector.ui", "EventBus.ui",
            "ChatRendering.utility", "ChatSessions.utility", "ChatSend.utility"
        ],
        dependencies: ["ChatRendering.utility", "ChatSessions.utility", "ChatSend.utility"],
        docs: {
            description: "Primary user interaction surface. Handles messaging, streaming, and command processing. Markdown/rendering, session management, and the send/stream flow are delegated to ChatRendering.utility, ChatSessions.utility, and ChatSend.utility (see dependencies).",
            author: "ProtoAI Team"
        },
        last_modified: "2026-07-14T00:00:00Z"
    };

    let _chatContainer = null;
    let _chatInput     = null;
    let _isStreaming   = false;

    // Input history (up/down arrow nav)
    let _history    = [];
    let _historyIdx = -1;
    let _tempInput  = "";

    // Session management
    let _currentSessionId = null;
    let _sessions         = [];
    let _currentProject   = null;

    // Passed to the split-out session/send components so they can
    // read/write this file's private state without closing over it
    // directly (a second IIFE has no way to reach into another IIFE's
    // `let` variables) — see ChatSessions.utility.js / ChatSend.utility.js
    // headers for the full rationale.
    const _sessionCtx = {
        getSessions:         () => _sessions,
        setSessions:         (arr) => { _sessions = arr; },
        getCurrentSessionId: () => _currentSessionId,
        setCurrentSessionId: (id) => { _currentSessionId = id; },
        getCurrentProject:   () => _currentProject
    };

    const _sendCtx = {
        isStreaming:         () => _isStreaming,
        setStreaming:        (v) => { _isStreaming = v; },
        pushHistory:         (text) => { _history.push(text); if (_history.length > 50) _history.shift(); },
        resetHistoryIdx:     () => { _historyIdx = -1; },
        getHistorySnapshot:  () => _history,
        getCurrentProject:   () => (_currentProject || window.currentProject || "default"),
        getCurrentSessionId: () => _currentSessionId
    };

    // ── Module Interface ──────────────────────────────────────

    async function init() {
        console.log(`[Chat.feature] Initializing v${MANIFEST.version}...`);
        try {
            _verifyDOM();
            _wireEvents();

            // Configure custom marked renderer if available
            if (window.marked) {
                try {
                    const renderer = {
                        code(code, infostring, escaped) {
                            const lang = (infostring || '').match(/\S*/)[0];
                            if (lang === 'mermaid') {
                                return `<pre class="mermaid" style="background:none; border:none; padding:0; margin:16px 0; overflow:visible; display:flex; justify-content:center;">${code}</pre>`;
                            }
                            const cleanCode = code.replace(/"/g, '&quot;');
                            return `
<div class="code-block-wrapper" style="position:relative; margin:16px 0; border:1px solid var(--border-subtle); border-radius:8px; overflow:hidden;">
  <div class="code-block-header" style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-deep); padding:6px 12px; font-size:11px; color:var(--text-dim); border-bottom:1px solid var(--border-subtle); user-select:none;">
    <span class="code-lang" style="text-transform:uppercase; font-weight:bold;">${lang || 'text'}</span>
    <button class="copy-code-btn" data-code="${cleanCode}" style="background:none; border:none; color:var(--text-dim); cursor:pointer; display:flex; align-items:center; gap:4px; font-size:11px; padding:2px 6px; border-radius:4px; transition:all 0.2s;">📋 Copy</button>
  </div>
  <pre style="margin:0; padding:12px; overflow-x:auto; background:rgba(15,23,42,0.35); font-family:var(--font-mono); font-size:12.5px; line-height:1.5; color:#e2e8f0; border:none; border-radius:0;"><code class="language-${lang || 'text'}">${escaped ? code : _escapeHtml(code)}</code></pre>
</div>`;
                        }
                    };
                    window.marked.use({ renderer });
                } catch (err) {
                    console.warn("[Chat] Failed to configure custom marked renderer:", err);
                }
            }

            // Force reset: unlock input if a silent-partner watchdog fires
            window.EventBus?.on("app:force_reset", () => {
                console.log("[Chat.feature] Force reset triggered. Unlocking input.");
                _isStreaming = false;
                if (_chatInput) {
                    _chatInput.disabled = false;
                    _chatInput.focus();
                }
            });

            // Hot-apply settings toast
            window.EventBus?.on("settings:changed", () => {
                window.ToastPrim?.show("Settings applied. Model and API changes are live.", "info");
            });

            console.log("[Chat.feature] Ready.");
        } catch (err) {
            console.error("[Chat.feature] Init failed:", err);
            window.EventBus?.emit("module:error", { id: MANIFEST.id, phase: "init", error: err.message });
        }
    }

    async function mount(slotElement) {
        console.log("[Chat.feature] Mounting UI...");
        const target = slotElement || document.getElementById("pane-left");
        if (!target) {
            console.warn("[Chat.feature] No mount target found.");
            return;
        }

        target.innerHTML = `
            <div id="chat-feature-main" style="display:flex; flex-direction:column; height:100%; overflow:hidden;">
                <div id="chat-session-bar" style="display:flex; align-items:center; gap:4px; padding:4px 10px; background:var(--bg-deep); border-bottom:1px solid var(--border-subtle); overflow-x:auto; min-height:36px; flex-shrink:0;">
                    <button id="chat-session-new" title="New chat session" style="flex-shrink:0; background:none; border:1px dashed var(--border-subtle); border-radius:4px; color:var(--text-dim); cursor:pointer; font-size:16px; line-height:1; padding:2px 8px; height:26px;">+</button>
                </div>
                <div style="flex:1; position:relative; overflow:hidden; display:flex;">
                    <div id="chatMessages" style="flex:1; overflow-y:auto; padding:20px; display:flex; flex-direction:column; gap:16px;">
                        <div class="chat-empty-state" style="text-align:center; padding-top:100px; color:var(--text-dim);">
                            <h2>ProtoAI Assistant</h2>
                            <p>Select a project to begin context-aware development.</p>
                        </div>
                    </div>
                    <div id="chatScrollMap">
                        <div id="chatScrollViewport"></div>
                    </div>
                </div>
                <div id="chatInputArea" style="padding:16px; background:var(--bg-elevated); border-top:1px solid var(--border-subtle);">
                    <div style="display:flex; gap:12px; margin-bottom:12px;">
                        <button class="chip" data-action="image">🖼 Creator</button>
                        <button class="chip" data-action="deepsearch">🔍 Research</button>
                    </div>
                    <div style="display:flex; gap:12px; align-items:flex-end;">
                        <textarea id="chatInput" class="sdoa-input" placeholder="Type a message… (Shift+Enter for newline, right-click send for routing options)"
                                  style="flex:1; min-height:44px; max-height:200px; resize:none; padding:12px;"></textarea>
                        <button id="chatSendBtn" class="sdoa-button sdoa-button--primary" style="height:44px; width:44px; display:flex; align-items:center; justify-content:center; padding:0;" title="Send (right-click for routing options)">
                            ✈
                        </button>
                    </div>
                </div>
            </div>
        `;

        _chatContainer = document.getElementById("chatMessages");
        _chatInput     = document.getElementById("chatInput");

        _wireEvents();
        window.ChatRendering.initScrollMap();
    }

    function _verifyDOM() {
        console.log("[Chat.feature] DOM validation scheduled for mount.");
    }

    function _wireEvents() {
        const sendBtn = document.getElementById("chatSendBtn");
        const input   = document.getElementById("chatInput");

        if (!sendBtn || !input) return;

        sendBtn.addEventListener("click", () => window.ChatSend.handleSend(_sendCtx));

        // Right-click context menu for routing mode toggle.
        // IMPORTANT: stopPropagation() prevents the global document.contextmenu
        // listener in ContextMenu.prim.js from calling hide() immediately after
        // show(), which would destroy the menu before the user sees it.
        sendBtn.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            e.stopPropagation();
            const currentText = input?.value?.trim() || "";
            if (window.ContextMenuPrim) {
                window.ContextMenuPrim.show({
                    items: [
                        { label: "Send",                icon: "✈",  onClick: () => window.ChatSend.handleSend(_sendCtx) },
                        { label: "Send and Continue",   icon: "➡",  onClick: () => { window.ChatSend.handleSend(_sendCtx); input?.focus(); } },
                        { label: "Send in New Tab",     icon: "📑", onClick: () => window.ToastPrim?.show("New tab routing coming soon", "info") },
                        { separator: true },
                        { label: "Send to Local Partner", icon: "🤖", onClick: () => {
                            if (currentText) {
                                window.EventBus?.emit("partner:manualQuery", { message: currentText });
                                window.ToastPrim?.show("Sent to Local Partner", "info");
                            }
                        }},
                        { separator: true },
                        { label: "Single Routing",     icon: "👤", onClick: () => _setOrchestrator(false) },
                        { label: "Multi Routing",      icon: "🌐", onClick: () => _setOrchestrator(true)  },
                        { separator: true },
                        { label: "Save as Note",       icon: "📝", onClick: () => {
                            if (currentText) {
                                const notes = JSON.parse(localStorage.getItem("protoai:notes") || "[]");
                                notes.push({ text: currentText, ts: Date.now(), project: window.currentProject || "default" });
                                localStorage.setItem("protoai:notes", JSON.stringify(notes));
                                window.ToastPrim?.show("Saved as note", "success");
                            }
                        }},
                        { label: "Copy Message",       icon: "📋", onClick: () => {
                            if (currentText) { navigator.clipboard.writeText(currentText); window.ToastPrim?.show("Copied", "info"); }
                        }},
                        { label: "Regenerate Response", icon: "🔄", onClick: () => {
                            if (_history.length > 0) {
                                input.value = _history[_history.length - 1];
                                window.ChatSend.handleSend(_sendCtx);
                            }
                        }},
                        { separator: true },
                        { label: "Clear Chat History", icon: "🗑", danger: true, onClick: () => window.ChatRendering.clearHistory() }
                    ],
                    position: { x: e.clientX, y: e.clientY }
                });
            } else {
                const mode = confirm("Switch to Multi-Model Routing?") ? "true" : "false";
                localStorage.setItem("protoai:orchestrator:enabled", mode);
                window.EventBus?.emit("app:force_reset");
            }
        });

        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                window.ChatSend.handleSend(_sendCtx);
                return;
            }
            if (e.key === "ArrowUp" && input.selectionStart === 0)                      _navigateHistory(1);
            if (e.key === "ArrowDown" && input.selectionStart === input.value.length)   _navigateHistory(-1);

            // Auto-resize
            input.style.height = "auto";
            input.style.height = input.scrollHeight + "px";
        });

        // System events
        window.EventBus?.on("chat:appendSystemMessage", (data) => window.ChatRendering.appendMessage("system", data.text));
        window.EventBus?.on("chat:promptOptimize",     (data) => _optimizePrompt(data.text));
        window.EventBus?.on("chat:deepSearch",         (data) => _runDeepSearch(data.query));
        window.EventBus?.on("orchestrator:continuity_editor_rewrite", (data) => window.ChatRendering.handleRewrite(data));

        // Project switch: show context banner then load sessions
        window.EventBus?.on("app:projectSelected", async (data) => {
            _currentProject = data.project;
            window.ChatRendering.appendMessage("system", `Context switched to: **${data.project}**`);
            await window.ChatSessions.loadSessions(data.project, _sessionCtx);
        });

        // Wire new-session button (may not be in DOM yet if mount() hasn't run)
        document.addEventListener("click", (e) => {
            if (e.target?.id === "chat-session-new") {
                if (_currentProject) window.ChatSessions.createSession(_currentProject, _sessionCtx);
            }
        });

        // Copy code button delegate
        document.getElementById("chatMessages")?.addEventListener("click", (e) => {
            const btn = e.target.closest(".copy-code-btn");
            if (btn) {
                const codeText = btn.dataset.code || "";
                navigator.clipboard.writeText(codeText).then(() => {
                    const originalText = btn.innerHTML;
                    btn.innerHTML = "✓ Copied";
                    btn.style.color = "var(--success)";
                    setTimeout(() => {
                        btn.innerHTML = originalText;
                        btn.style.color = "";
                    }, 2000);
                }).catch(err => {
                    window.ToastPrim?.show("Failed to copy code: " + err, "error");
                });
            }
        });

        // Copy message or selection button delegate
        document.getElementById("chatMessages")?.addEventListener("click", (e) => {
            const btn = e.target.closest(".copy-msg-btn");
            if (btn) {
                const msgEl = btn.closest(".sdoa-message");
                if (msgEl) {
                    const selection = window.getSelection();
                    const selectedText = selection.toString();

                    let textToCopy = "";
                    // If selection is inside this message, copy selection. Else copy full raw message text.
                    if (selectedText && msgEl.contains(selection.anchorNode)) {
                        textToCopy = selectedText;
                        window.ToastPrim?.show("Selection copied", "success");
                    } else {
                        textToCopy = msgEl._rawText || msgEl.querySelector(".sdoa-message__body")?.textContent || "";
                        window.ToastPrim?.show("Message copied to clipboard", "success");
                    }

                    if (textToCopy) {
                        navigator.clipboard.writeText(textToCopy).then(() => {
                            const originalText = btn.innerHTML;
                            btn.innerHTML = "✓ Copied";
                            setTimeout(() => {
                                btn.innerHTML = originalText;
                            }, 2000);
                        }).catch(err => {
                            window.ToastPrim?.show("Copy failed: " + err, "error");
                        });
                    }
                }
            }
        });
    }

    function _setOrchestrator(enabled) {
        localStorage.setItem("protoai:orchestrator:enabled", enabled ? "true" : "false");
        window.ToastPrim?.show(`Routing: ${enabled ? "Multi-Model" : "Single"} mode`, "info");
    }

    // ── History Navigation ───────────────────────────────────

    function _navigateHistory(dir) {
        if (_history.length === 0) return;
        if (_historyIdx === -1) _tempInput = _chatInput.value;

        _historyIdx += dir;
        if (_historyIdx < -1) _historyIdx = -1;
        if (_historyIdx >= _history.length) _historyIdx = _history.length - 1;

        _chatInput.value = (_historyIdx === -1)
            ? _tempInput
            : _history[(_history.length - 1) - _historyIdx];
    }

    // ── Prompt optimization & deep search ───────────────────

    async function _optimizePrompt(text) {
        window.ToastPrim?.show("Optimizing prompt...", "info");
        try {
            const res = await window.backendConnector?.runWorkflow("Engineer.workflow", { message: text });
            const optimized = res?.data?.prompt || res?.prompt;
            const input = document.getElementById("chatInput");
            if (optimized && input) {
                input.value = optimized;
                input.style.height = "auto";
                input.style.height = input.scrollHeight + "px";
                window.ToastPrim?.show("Prompt optimized!", "success");
            } else {
                window.ToastPrim?.show("Could not optimize prompt", "warning");
            }
        } catch (err) {
            console.error("[Chat] _optimizePrompt error:", err);
            window.ToastPrim?.show("Optimization failed", "error");
        }
    }

    async function _runDeepSearch(query) {
        if (!query) return;
        window.ChatRendering.appendMessage("system", `🔎 Running deep search for: **${query}**`);
        try {
            const res = await window.backendConnector?.runWorkflow("deep_search", { query, project: window.currentProject || "default" });
            const answer = res?.data?.answer || res?.answer || "No result.";
            window.ChatRendering.appendMessage("assistant", answer);
        } catch (err) {
            window.ChatRendering.appendMessage("system", `**Deep search failed:** ${err.message || err}`);
        }
    }

    function _escapeHtml(str) {
        return String(str || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
    }

    // ── Module Registration ───────────────────────────────────
    window.ModuleLoader?.register(MANIFEST, { init, mount });
    window.ChatFeature = { mount, init };

})();
