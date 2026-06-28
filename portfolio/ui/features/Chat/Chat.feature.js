/* ============================================================
   Chat.feature.js — SDOA v4 Chat Interface
   version: 4.4.0
   Last modified: 2026-05-09
   Changes vs 4.3.0:
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
        version: "4.4.0",
        requires: ["BackendConnector.ui", "EventBus.ui"],
        docs: {
            description: "Primary user interaction surface. Handles messaging, streaming, and command processing.",
            author: "ProtoAI Team"
        }
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
        _initScrollMap();
    }

    function _initScrollMap() {
        const msgList = document.getElementById("chatMessages");
        const scrollMap = document.getElementById("chatScrollMap");
        const viewport = document.getElementById("chatScrollViewport");
        if (!msgList || !scrollMap || !viewport) return;

        msgList.addEventListener("scroll", _updateScrollMap);
        window.addEventListener("resize", _updateScrollMap);

        // Click on scroll map to jump
        scrollMap.addEventListener("mousedown", (e) => {
            const rect = scrollMap.getBoundingClientRect();
            const ratio = (e.clientY - rect.top) / rect.height;
            msgList.scrollTop = ratio * msgList.scrollHeight - (msgList.clientHeight / 2);
        });
    }

    function _updateScrollMap() {
        const msgList = document.getElementById("chatMessages");
        const scrollMap = document.getElementById("chatScrollMap");
        const viewport = document.getElementById("chatScrollViewport");
        if (!msgList || !scrollMap || !viewport) return;

        // Clear old segments
        scrollMap.querySelectorAll(".csm-seg").forEach(el => el.remove());

        const totalH = msgList.scrollHeight;
        const visibleH = msgList.clientHeight;
        const mapH = scrollMap.clientHeight;
        if (totalH <= visibleH) {
            viewport.style.display = "none";
            return;
        }

        viewport.style.display = "block";
        const viewportRatio = visibleH / totalH;
        viewport.style.height = Math.max(10, mapH * viewportRatio) + "px";

        const scrollRatio = msgList.scrollTop / (totalH - visibleH);
        const maxTop = mapH - viewport.offsetHeight;
        viewport.style.top = (scrollRatio * maxTop) + "px";

        // Draw segments
        const messages = msgList.querySelectorAll(".sdoa-message");
        messages.forEach(msg => {
            const topRatio = msg.offsetTop / totalH;
            const hRatio = msg.offsetHeight / totalH;
            const seg = document.createElement("div");
            seg.className = "csm-seg";
            if (msg.classList.contains("sdoa-message--user")) seg.classList.add("user");
            else if (msg.classList.contains("sdoa-message--assistant")) seg.classList.add("assistant");
            else seg.classList.add("system");

            seg.style.top = (topRatio * mapH) + "px";
            seg.style.height = Math.max(2, hRatio * mapH) + "px";
            scrollMap.appendChild(seg);
        });
    }

    function _verifyDOM() {
        console.log("[Chat.feature] DOM validation scheduled for mount.");
    }

    function _wireEvents() {
        const sendBtn = document.getElementById("chatSendBtn");
        const input   = document.getElementById("chatInput");

        if (!sendBtn || !input) return;

        sendBtn.addEventListener("click", () => _handleSend());

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
                        { label: "Send",                icon: "✈",  onClick: () => _handleSend() },
                        { label: "Send and Continue",   icon: "➡",  onClick: () => { _handleSend(); input?.focus(); } },
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
                                _handleSend();
                            }
                        }},
                        { separator: true },
                        { label: "Clear Chat History", icon: "🗑", danger: true, onClick: () => _clearHistory() }
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
                _handleSend();
                return;
            }
            if (e.key === "ArrowUp" && input.selectionStart === 0)                      _navigateHistory(1);
            if (e.key === "ArrowDown" && input.selectionStart === input.value.length)   _navigateHistory(-1);

            // Auto-resize
            input.style.height = "auto";
            input.style.height = input.scrollHeight + "px";
        });

        // System events
        window.EventBus?.on("chat:appendSystemMessage", (data) => _appendMessage("system", data.text));
        window.EventBus?.on("chat:promptOptimize",     (data) => _optimizePrompt(data.text));
        window.EventBus?.on("chat:deepSearch",         (data) => _runDeepSearch(data.query));
        window.EventBus?.on("orchestrator:continuity_editor_rewrite", (data) => _handleRewrite(data));

        // Project switch: show context banner then load sessions
        window.EventBus?.on("app:projectSelected", async (data) => {
            _currentProject = data.project;
            _appendMessage("system", `Context switched to: **${data.project}**`);
            await _loadSessions(data.project);
        });

        // Wire new-session button (may not be in DOM yet if mount() hasn't run)
        document.addEventListener("click", (e) => {
            if (e.target?.id === "chat-session-new") {
                if (_currentProject) _createSession(_currentProject);
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

    // ── Session management ────────────────────────────────────

    async function _loadSessions(project) {
        if (!project || !window.backendConnector) return;
        try {
            const res = await window.backendConnector.runWorkflow("chat_session", { action: "list", project });
            _sessions = res?.data || res?.sessions || [];
        } catch (_) { _sessions = []; }

        // Auto-create a default session if none exist
        if (_sessions.length === 0) {
            try {
                const cr = await window.backendConnector.runWorkflow("chat_session", { action: "create", project, name: "Chat 1" });
                _sessions = [{ id: cr?.data?.id, name: "Chat 1" }];
            } catch (_) {}
        }

        _renderTabBar();
        // Load first (or current) session
        const target = _sessions.find(s => s.id === _currentSessionId) || _sessions[0];
        if (target) await _switchSession(project, target.id);
    }

    function _renderTabBar() {
        const bar = document.getElementById("chat-session-bar");
        if (!bar) return;

        // Remove old tabs (keep the + button)
        bar.querySelectorAll(".chat-session-tab").forEach(t => t.remove());

        const newBtn = bar.querySelector("#chat-session-new");
        _sessions.forEach(sess => {
            const tab = document.createElement("button");
            tab.className = "chat-session-tab";
            tab.dataset.sessionId = sess.id;
            tab.title = sess.name;
            const isActive = sess.id === _currentSessionId;
            tab.style.cssText = [
                "flex-shrink:0; max-width:120px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;",
                "border-radius:4px; border:1px solid var(--border-subtle); cursor:pointer; font-size:11px;",
                "padding:2px 8px; height:26px;",
                isActive
                    ? "background:var(--accent); color:white; border-color:var(--accent);"
                    : "background:none; color:var(--text-dim);"
            ].join("");
            tab.textContent = sess.name;
            tab.addEventListener("click", () => {
                if (_currentProject) _switchSession(_currentProject, sess.id);
            });
            bar.insertBefore(tab, newBtn);
        });
    }

    async function _switchSession(project, sessionId) {
        if (!sessionId) return;
        _currentSessionId = sessionId;
        _renderTabBar();

        // Clear current messages
        const msgList = document.getElementById("chatMessages");
        if (msgList) msgList.innerHTML = "";

        try {
            const res = await window.backendConnector.runWorkflow("chat_session", { action: "load", project, chatId: sessionId });
            const messages = res?.data?.messages || [];
            if (messages.length === 0) {
                _appendMessage("system", "New conversation — start typing below.");
                return;
            }
            const recent = messages.slice(-30);
            for (const msg of recent) {
                const role = msg.role === "user" ? "user" : "assistant";
                const text = msg.message || msg.content || msg.text || "";
                const persona = msg.persona || null;
                if (persona) continue; // Skip loading side-channel commentaries into the main chat history view
                if (text) _appendMessage(role, text, persona);
            }
        } catch (err) {
            console.warn("[Chat.feature] Session load failed:", err);
        }
    }

    async function _createSession(project) {
        const name = `Chat ${_sessions.length + 1}`;
        try {
            const res = await window.backendConnector.runWorkflow("chat_session", { action: "create", project, name });
            const newSess = { id: res?.data?.id, name };
            _sessions.push(newSess);
            await _switchSession(project, newSess.id);
        } catch (err) {
            window.ToastPrim?.show("Could not create session: " + err.message, "error");
        }
    }

    async function _persistMessage(project, sessionId, role, text, persona = null) {
        if (!project || !sessionId) return;
        try {
            const entry = { role, message: text, ts: Date.now() };
            if (persona) entry.persona = persona;
            await window.backendConnector.runWorkflow("chat_session", {
                action: "append", project, chatId: sessionId,
                entry
            });
        } catch (_) { /* non-fatal */ }
    }

    // ── Load persistent history on project select (legacy fallback) ───────

    async function _loadHistory(project) {
        if (!project || !window.backendConnector) return;
        try {
            const res = await window.backendConnector.runWorkflow("history", { project });
            const msgs = res?.history || res?.data?.history || [];
            if (msgs.length === 0) return;
            const recent = msgs.slice(-20);
            for (const msg of recent) {
                const role = msg.role === "user" ? "user" : "assistant";
                const text = msg.message || msg.content || "";
                const persona = msg.persona || null;
                if (persona) continue; // Skip loading side-channel commentaries into history
                if (text) _appendMessage(role, text, persona);
            }
        } catch (err) {
            console.warn("[Chat.feature] History load failed:", err);
        }
    }

    // ── Send ─────────────────────────────────────────────────

    async function _handleSend() {
        if (_isStreaming) return;

        const input = document.getElementById("chatInput");
        const text  = input?.value.trim();
        if (!text) return;

        _history.push(text);
        if (_history.length > 50) _history.shift();
        _historyIdx = -1;

        // Persist prompts to localStorage as fallback
        try {
            const key = `protoai:chat:history:${window.currentProject || "default"}`;
            localStorage.setItem(key, JSON.stringify(_history.slice(-50)));
        } catch (_) { /* quota exceeded — ignore */ }

        input.value = "";
        input.style.height = "auto";
        _appendMessage("user", text);

        const project      = _currentProject || window.currentProject || "default";
        const orchestrator = localStorage.getItem("protoai:orchestrator:enabled") !== "false";
        // If orchestrator is enabled, route through MultiModelSendWorkflow for orchestration.
        // Otherwise, use SendMessageWorkflow directly for the standalone chat response.
        const workflow = orchestrator ? "multi_model_send" : "chat";

        // Active profile — stored by Settings or defaults to "default"
        const profile = localStorage.getItem("protoai:profile:active") || "default";

        // Quick Swap engine override (set by the sidebar Apply button)
        const engine = window.quickSwapEngine || undefined;

        let streamUnlisten = null;
        let streamEl       = null;

        try {
            _isStreaming      = true;
            input.disabled    = true;

            // Create the reply bubble immediately so chunks can flow in
            streamEl = _createStreamBubble();
            const msgId = streamEl.dataset.id || "msg_" + Date.now();

            // Subscribe to Tauri streaming events before starting the request
            if (window.__TAURI__?.event?.listen) {
                streamUnlisten = await window.__TAURI__.event.listen("chat-stream", (event) => {
                    const chunk = event.payload?.chunk ?? event.payload;
                    if (typeof chunk === "string" && chunk) {
                        _appendToStream(streamEl, chunk);
                    }
                });
            }

            // We read the toggles to construct active facets
            let facets = [];
            try {
                const toggles = JSON.parse(localStorage.getItem("protoai:partner:toggles") || "{}");
                const allFacets = ["advisor", "critic", "friend", "comedy", "slutty", "scary", "scared", "alien"];
                facets = allFacets.filter(f => toggles["facet_" + f] !== false);
            } catch (_) {}

            const res = await window.backendConnector?.runWorkflow(workflow, {
                message: text,
                project,
                profile,    // ← was missing; Router requires this field
                engine,     // ← Quick Swap override (undefined = use profile default)
                stream:  true,
                facets,
                msgId
            });

            // Check for backend error (ok: false)
            if (res?.ok === false) {
                const errMsg = res?.error || res?.data?.error || "Backend returned an error.";
                _finalizeStream(streamEl, `**Error:** ${errMsg}`);
                return;
            }

            // Streaming: chunks already rendered; just finalize the bubble.
            // Non-streaming fallback: res.response holds the full reply.
            const reply     = res?.response || res?.data?.response || "";
            const gotChunks = streamEl._content.textContent.trim().length > 0;

            if (gotChunks) {
                _finalizeStream(streamEl);
            } else if (reply) {
                _finalizeStream(streamEl, reply);
            } else {
                _finalizeStream(streamEl, "No response received. Check your API keys in Settings → API Keys.");
            }

            // Persist messages to the active session
            const assistantText = streamEl?._content?.textContent || reply || "";
            _persistMessage(project, _currentSessionId, "user", text);
            if (assistantText) _persistMessage(project, _currentSessionId, "assistant", assistantText);

            // Fire-and-forget: notify LOCAL PARTNER so it can run sidebar commentary.
            // Only do this if we ran the standalone 'chat' workflow instead of 'multi_model_send'.
            if (workflow === "chat" && orchestrator && assistantText) {
                window.EventBus?.emit("chat:messageComplete", { message: text, response: assistantText, id: msgId });
            }

        } catch (err) {
            console.error("[Chat] Send failed:", err);
            const msg = (typeof err === "string") ? err : (err.message || "Unknown error");
            if (streamEl) {
                _finalizeStream(streamEl, `**Error:** ${msg}`);
            } else {
                _appendMessage("system", `**Error:** ${msg}`);
            }
            window.ToastPrim?.show("Message delivery failed", "error");
        } finally {
            _isStreaming   = false;
            input.disabled = false;
            input.focus();
            if (streamUnlisten) streamUnlisten();
        }
    }

    // ── Streaming bubble helpers ─────────────────────────────

    function _createStreamBubble() {
        const msgList = document.getElementById("chatMessages");
        if (!msgList) return null;

        const empty = msgList.querySelector(".chat-empty-state");
        if (empty) empty.style.display = "none";

        const el = document.createElement("div");
        el.className = "sdoa-message chat-message sdoa-message--assistant chat-message--assistant sdoa-message--streaming chat-message--streaming";
        el.dataset.id = "msg_" + Date.now();
        el.style.cssText = "display:flex; gap:12px; padding:12px; border-radius:8px; position:relative;";

        const content = document.createElement("div");
        content.className = "sdoa-message__body content";
        content.style.cssText = "flex:1; line-height:1.5; font-size:14px; overflow-wrap:anywhere;";

        const cursor = document.createElement("span");
        cursor.className = "stream-cursor";
        cursor.style.cssText = "display:inline-block; width:8px; height:14px; background:currentColor; margin-left:2px; animation:blink 1s step-end infinite; vertical-align:text-bottom;";

        el.innerHTML = `
            <div class="avatar" style="width:32px; height:32px; border-radius:16px; background:var(--accent); display:flex; align-items:center; justify-content:center; color:white; font-weight:bold; font-size:12px; flex-shrink:0; position:relative;">
                AI
                <div class="persona-tooltip">AI Assistant</div>
            </div>
            <div class="sdoa-message-actions">
                <button class="sdoa-msg-action-btn copy-msg-btn" title="Copy selection or full message">📋 Copy</button>
            </div>
        `;
        el.appendChild(content);
        content.appendChild(cursor);

        // Stash references for later mutation
        el._content = content;
        el._cursor  = cursor;

        msgList.appendChild(el);
        msgList.scrollTop = msgList.scrollHeight;
        return el;
    }

    function _appendToStream(el, chunk) {
        if (!el || !el._content) return;
        // Insert raw text before the cursor
        const text = document.createTextNode(chunk);
        el._content.insertBefore(text, el._cursor);
        const msgList = document.getElementById("chatMessages");
        if (msgList) msgList.scrollTop = msgList.scrollHeight;
    }

    function _finalizeStream(el, fallbackText) {
        if (!el) return;
        // Remove the blinking cursor
        el._cursor?.remove();
        el.classList.remove("chat-message--streaming");
        el.classList.remove("sdoa-message--streaming");

        if (el._content) {
            const rawText = (fallbackText !== undefined) ? fallbackText : el._content.textContent;
            el._content.innerHTML = _renderMarkdown(rawText);
            el._rawText = rawText; // Store raw text for copying
        }

        const msgList = document.getElementById("chatMessages");
        if (msgList) msgList.scrollTop = msgList.scrollHeight;

        const fullText = el._content?.textContent || "";
        window.EventBus?.emit("chat:appendMessage", { role: "assistant", text: fullText });
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
        _appendMessage("system", `🔎 Running deep search for: **${query}**`);
        try {
            const res = await window.backendConnector?.runWorkflow("deep_search", { query, project: window.currentProject || "default" });
            const answer = res?.data?.answer || res?.answer || "No result.";
            _appendMessage("assistant", answer);
        } catch (err) {
            _appendMessage("system", `**Deep search failed:** ${err.message || err}`);
        }
    }

    function _clearHistory() {
        const msgList = document.getElementById("chatMessages");
        if (!msgList) return;
        if (!confirm("Clear all messages in this view?")) return;
        msgList.innerHTML = "";
        const empty = document.createElement("div");
        empty.className = "chat-empty-state";
        empty.style.cssText = "display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; color:var(--text-dim); gap:8px;";
        empty.innerHTML = `<div style="font-size:32px;">💬</div><div style="font-size:14px;">Start a conversation</div>`;
        msgList.appendChild(empty);
        _updateScrollMap();
        window.ToastPrim?.show("Chat cleared", "info");
    }

    // ── Markdown renderer (lightweight) ──────────────────────

    function _escapeHtml(str) {
        return String(str || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
    }

    function _triggerMermaid(text) {
        if (!window._mermaidLoading && !window.mermaid) {
            window._mermaidLoading = true;
            console.log("[Chat] Loading Mermaid dynamically from jsdelivr CDN...");
            const script = document.createElement("script");
            script.src = "https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js";
            script.onload = () => {
                try {
                    window.mermaid.initialize({
                        startOnLoad: false,
                        theme: "dark",
                        securityLevel: "loose",
                        themeVariables: {
                            background: "#0f172a",
                            primaryColor: "#3b82f6",
                        }
                    });
                    console.log("[Chat] Mermaid initialized successfully.");
                    window.mermaid.run({
                        nodes: document.querySelectorAll(".mermaid"),
                    });
                } catch (e) {
                    console.error("[Chat] Mermaid init failed:", e);
                }
            };
            script.onerror = () => {
                console.error("[Chat] Failed to load Mermaid from CDN.");
                window._mermaidLoading = false;
            };
            document.head.appendChild(script);
        } else if (window.mermaid) {
            setTimeout(() => {
                try {
                    window.mermaid.run({
                        nodes: document.querySelectorAll(".mermaid"),
                    });
                } catch (e) {
                    console.warn("[Chat] Mermaid run failed:", e);
                }
            }, 200);
        }
    }

    function _renderMarkdown(text) {
        if (!text) return "";

        // 1. If marked is available, use it!
        if (window.marked && typeof window.marked.parse === "function") {
            try {
                if (text.includes("```mermaid")) {
                    _triggerMermaid(text);
                }
                return window.marked.parse(text);
            } catch (err) {
                console.warn("[Chat] marked.parse failed, falling back to regex parser:", err);
            }
        }

        // 2. Fallback basic regex parser
        let html = String(text)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");

        const codeBlockRe = new RegExp("```([\\w]*)\\n?([\\s\\S]*?)```", "g");
        html = html.replace(codeBlockRe, (_, lang, code) =>
            `<pre style="background:var(--bg-deep);border-radius:6px;padding:10px 12px;overflow-x:auto;font-size:12px;"><code class="language-${lang || 'text'}">${code.trim()}</code></pre>`
        );
        html = html.replace(/`([^`]+)`/g, `<code style="background:var(--bg-elevated-2);border-radius:3px;padding:1px 5px;font-size:0.9em;">$1</code>`);
        html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
        html = html.replace(/\*(.+?)\*/g,   "<em>$1</em>");
        html = html.replace(/^### (.+)$/gm, `<div style="font-size:13px;font-weight:700;color:var(--text-bright);margin:8px 0 4px;">$1</div>`);
        html = html.replace(/^## (.+)$/gm,  `<div style="font-size:14px;font-weight:700;color:var(--text-bright);margin:10px 0 4px;">$1</div>`);
        html = html.replace(/^# (.+)$/gm,   `<div style="font-size:16px;font-weight:700;color:var(--text-bright);margin:12px 0 6px;">$1</div>`);
        html = html.replace(/^---$/gm, `<hr style="border:none;border-top:1px solid var(--border-subtle);margin:10px 0;">`);
        html = html.replace(/^[-*] (.+)$/gm, `<div style="padding-left:16px;">• $1</div>`);
        html = html.replace(/\n/g, "<br>");
        return html;
    }

    // ── Continuity Editor (Phase 3) ───────────────────────────

    function _handleRewrite({ id, newText, persona, commentaryText }) {
        if (!id) return;
        const msgEl = document.querySelector(`.chat-message[data-id="${id}"]`);
        if (!msgEl) return;

        const contentEl = msgEl.querySelector(".content");
        if (!contentEl) return;

        // 1. Strike out original content
        const originalHtml = contentEl.innerHTML;
        contentEl.innerHTML = `<div style="text-decoration: line-through; opacity: 0.5; filter: grayscale(100%); transition: all 0.5s ease;">${originalHtml}</div>`;

        // 2. Add the commentary/snark from the persona
        const noteEl = document.createElement("div");
        noteEl.style.cssText = `margin-top: 8px; font-size: 11px; font-weight: bold; font-style: italic; color: var(--accent); opacity: 0; transform: translateY(-5px); transition: all 0.3s ease;`;
        noteEl.innerHTML = `↳ ${persona} intercepted: "${commentaryText}"`;
        contentEl.appendChild(noteEl);

        // 3. Prepare the container for the new text
        const newTextContainer = document.createElement("div");
        newTextContainer.style.cssText = `margin-top: 8px; border-left: 3px solid var(--accent); padding-left: 12px; opacity: 0; transition: opacity 0.5s ease;`;
        contentEl.appendChild(newTextContainer);

        // Animate visibility
        setTimeout(() => {
            noteEl.style.opacity = "1";
            noteEl.style.transform = "translateY(0)";

            setTimeout(() => {
                newTextContainer.style.opacity = "1";
                // Animate typing effect for the rewrite
                let i = 0;
                let buffer = "";
                const speed = Math.max(5, 50 - Math.floor(newText.length / 10)); // Variable speed

                function typeChar() {
                    if (i < newText.length) {
                        buffer += newText.charAt(i);
                        newTextContainer.innerHTML = _renderMarkdown(buffer) + `<span style="display:inline-block; width:6px; height:12px; background:currentColor; margin-left:2px; animation:blink 1s infinite;"></span>`;
                        const msgList = document.getElementById("chatMessages");
                        if (msgList) msgList.scrollTop = msgList.scrollHeight;
                        i++;
                        setTimeout(typeChar, speed);
                    } else {
                        newTextContainer.innerHTML = _renderMarkdown(newText);
                    }
                }
                typeChar();
            }, 600);
        }, 100);
    }

    // ── Append message helper ─────────────────────────────────

    function _appendMessage(role, text, persona = null) {
        const msgList = document.getElementById("chatMessages");
        if (!msgList) return;

        const empty = msgList.querySelector(".chat-empty-state");
        if (empty) empty.style.display = "none";

        const el = document.createElement("div");
        const personaClass = (role === "assistant" && persona) ? ` sdoa-message--persona-${persona}` : "";
        el.className = `sdoa-message chat-message sdoa-message--${role} chat-message--${role}${personaClass}`;
        el._rawText = text; // Cache raw text

        if (role === "user") {
            el.style.cssText = "display:flex; gap:12px; padding:12px; border-radius:8px; flex-direction:row-reverse; position:relative;";
            el.innerHTML = `
                <div class="avatar" style="width:32px;height:32px;border-radius:16px;background:var(--bg-elevated-2);display:flex;align-items:center;justify-content:center;color:var(--text-dim);font-weight:bold;font-size:12px;flex-shrink:0;">U</div>
                <div class="sdoa-message__body content" style="flex:1;line-height:1.5;font-size:14px;overflow-wrap:anywhere;background:var(--bg-elevated-1);padding:10px 14px;border-radius:8px;">${_renderMarkdown(text)}</div>
                <div class="sdoa-message-actions">
                    <button class="sdoa-msg-action-btn copy-msg-btn" title="Copy selection or full message">📋 Copy</button>
                </div>
            `;
        } else if (role === "assistant") {
            el.dataset.id = "msg_" + Date.now();
            el.style.cssText = "display:flex; gap:12px; padding:12px; border-radius:8px; position:relative;";

            const personaLabels = {
                advisor: "ADV",
                critic:  "CRT",
                friend:  "FRN",
                comedy:  "CMD",
                slutty:  "SLT",
                slutty_nsfw: "NSFW",
                scary:   "SCR",
                scared:  "SCD",
                alien:   "ALN"
            };
            const personaFullNames = {
                advisor: "Advisor",
                critic:  "Critic",
                friend:  "Friend",
                comedy:  "Comedy",
                slutty:  "Slutty",
                slutty_nsfw: "Slutty (NSFW)",
                scary:   "Scary",
                scared:  "Scared",
                alien:   "Alien"
            };
            const label = (persona && personaLabels[persona]) ? personaLabels[persona] : "AI";
            const tooltipText = (persona && personaFullNames[persona]) ? personaFullNames[persona] + " Persona" : "AI Assistant";

            el.innerHTML = `
                <div class="avatar" style="width:32px;height:32px;border-radius:16px;background:var(--accent);display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;font-size:12px;flex-shrink:0;position:relative;">
                    ${label}
                    <div class="persona-tooltip">${tooltipText}</div>
                </div>
                <div class="sdoa-message__body content" style="flex:1;line-height:1.5;font-size:14px;overflow-wrap:anywhere;">${_renderMarkdown(text)}</div>
                <div class="sdoa-message-actions">
                    <button class="sdoa-msg-action-btn copy-msg-btn" title="Copy selection or full message">📋 Copy</button>
                </div>
            `;
        } else {
            el.style.cssText = "padding:6px 12px; font-size:12px; color:var(--text-dim); font-style:italic; text-align:center;";
            el.innerHTML = _renderMarkdown(text);
        }

        msgList.appendChild(el);
        msgList.scrollTop = msgList.scrollHeight;
        _updateScrollMap();
    }

    // ── Module Registration ───────────────────────────────────
    window.ModuleLoader?.register(MANIFEST, { init, mount });
    window.ChatFeature = { mount, init };

})();
