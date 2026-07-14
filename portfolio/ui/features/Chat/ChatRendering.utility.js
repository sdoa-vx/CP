// ============================================================
// ChatRendering.utility.js — SDOA v5 Utility | layer 2
// Updated: 2026-07-14
// Extracted from Chat.feature.js (Phase 5 — oversized-file split).
// Everything here takes only its own parameters (role/text/persona,
// DOM elements, chunk strings) plus DOM/window globals — none of it
// reads or writes Chat.feature.js's private session/streaming state
// (_sessions, _currentSessionId, _isStreaming, _history, etc). That is
// what makes this the single largest, lowest-risk extraction out of
// Chat.feature.js: pure relocation, no ctx object needed anywhere.
//
// Carries:
//   renderMarkdown(text)       — marked.js integration + regex fallback
//                                 + Mermaid diagram trigger.
//   appendMessage(role, text, persona?) — renders one chat bubble.
//   createStreamBubble()       — creates the in-flight assistant bubble.
//   appendToStream(el, chunk)  — appends a streamed text chunk.
//   finalizeStream(el, fallbackText?) — removes the cursor, renders
//                                 final markdown, emits chat:appendMessage.
//   handleRewrite({id, newText, persona, commentaryText}) — Continuity
//                                 Editor strike-through + typed rewrite.
//   clearHistory()             — wipes the message list (with confirm()).
//   initScrollMap()            — wires the minimap scrollbar.
// Plus a private helper (not exported): _triggerMermaid, _updateScrollMap.
// (_escapeHtml stayed in Chat.feature.js core -- see note near
// _triggerMermaid below for why it wasn't duplicated here.)
// ============================================================

(function () {
    "use strict";

    const MANIFEST = {
        id: "ChatRendering.utility", type: "utility", layer: 2,
        runtime: "Browser", version: "1.0.0",
        docs: { description: "Chat.feature.js's message/markdown rendering surface: renderMarkdown (marked.js + regex fallback + Mermaid), appendMessage, the streaming-bubble helpers (createStreamBubble/appendToStream/finalizeStream), the Continuity Editor rewrite animation (handleRewrite), clearHistory, and the scroll minimap (initScrollMap). Zero dependency on Chat.feature.js's private state -- takes only its own parameters. Extracted from Chat.feature.js as part of the Phase 5 oversized-file split.", author: "ProtoAI Team" }
    };

    // ── Markdown renderer (lightweight) ──────────────────────
    // Note: _escapeHtml is NOT duplicated here -- the only call site in
    // the original file was inside Chat.feature.js's init() (the custom
    // marked renderer's code() callback), so it stayed in core. The
    // fallback regex parser below does its own inline &/</> replacement
    // rather than calling a shared helper (that's how the original code
    // was written too).

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

    function renderMarkdown(text) {
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

    // ── Scroll minimap ────────────────────────────────────────

    function initScrollMap() {
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

    // ── Streaming bubble helpers ─────────────────────────────

    function createStreamBubble() {
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

    function appendToStream(el, chunk) {
        if (!el || !el._content) return;
        // Insert raw text before the cursor
        const text = document.createTextNode(chunk);
        el._content.insertBefore(text, el._cursor);
        const msgList = document.getElementById("chatMessages");
        if (msgList) msgList.scrollTop = msgList.scrollHeight;
    }

    function finalizeStream(el, fallbackText) {
        if (!el) return;
        // Remove the blinking cursor
        el._cursor?.remove();
        el.classList.remove("chat-message--streaming");
        el.classList.remove("sdoa-message--streaming");

        if (el._content) {
            const rawText = (fallbackText !== undefined) ? fallbackText : el._content.textContent;
            el._content.innerHTML = renderMarkdown(rawText);
            el._rawText = rawText; // Store raw text for copying
        }

        const msgList = document.getElementById("chatMessages");
        if (msgList) msgList.scrollTop = msgList.scrollHeight;

        const fullText = el._content?.textContent || "";
        window.EventBus?.emit("chat:appendMessage", { role: "assistant", text: fullText });
    }

    // ── Continuity Editor (Phase 3) ───────────────────────────

    function handleRewrite({ id, newText, persona, commentaryText }) {
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
                        newTextContainer.innerHTML = renderMarkdown(buffer) + `<span style="display:inline-block; width:6px; height:12px; background:currentColor; margin-left:2px; animation:blink 1s infinite;"></span>`;
                        const msgList = document.getElementById("chatMessages");
                        if (msgList) msgList.scrollTop = msgList.scrollHeight;
                        i++;
                        setTimeout(typeChar, speed);
                    } else {
                        newTextContainer.innerHTML = renderMarkdown(newText);
                    }
                }
                typeChar();
            }, 600);
        }, 100);
    }

    // ── Append message helper ─────────────────────────────────

    function appendMessage(role, text, persona = null) {
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
                <div class="sdoa-message__body content" style="flex:1;line-height:1.5;font-size:14px;overflow-wrap:anywhere;background:var(--bg-elevated-1);padding:10px 14px;border-radius:8px;">${renderMarkdown(text)}</div>
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
                <div class="sdoa-message__body content" style="flex:1;line-height:1.5;font-size:14px;overflow-wrap:anywhere;">${renderMarkdown(text)}</div>
                <div class="sdoa-message-actions">
                    <button class="sdoa-msg-action-btn copy-msg-btn" title="Copy selection or full message">📋 Copy</button>
                </div>
            `;
        } else {
            el.style.cssText = "padding:6px 12px; font-size:12px; color:var(--text-dim); font-style:italic; text-align:center;";
            el.innerHTML = renderMarkdown(text);
        }

        msgList.appendChild(el);
        msgList.scrollTop = msgList.scrollHeight;
        _updateScrollMap();
    }

    // ── Clear history ─────────────────────────────────────────

    function clearHistory() {
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

    // ── Exports ───────────────────────────────────────────────

    const component = {
        MANIFEST,
        renderMarkdown, appendMessage,
        createStreamBubble, appendToStream, finalizeStream,
        handleRewrite, clearHistory, initScrollMap
    };
    window.ChatRendering = component;
    if (window.ModuleLoader) window.ModuleLoader.register(MANIFEST, component);

})();
