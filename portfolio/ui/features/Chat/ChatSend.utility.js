// ============================================================
// ChatSend.utility.js — SDOA v5 Utility | layer 2
// Updated: 2026-07-14
// Extracted from Chat.feature.js (Phase 5 — oversized-file split).
// Carries handleSend() — the full send flow: collect input text, push
// to input history, dispatch to the chat/multi_model_send workflow,
// subscribe to Tauri streaming events, render the streaming bubble via
// ChatRendering, persist both sides of the exchange via ChatSessions,
// and fire the chat:messageComplete event for sidebar commentary.
//
// Takes an explicit `ctx` object for Chat.feature.js's private
// _isStreaming/_history/_historyIdx/_currentProject/_currentSessionId
// state — same pattern as ChatSessions.utility.js. Delegates all DOM
// rendering to window.ChatRendering and session persistence to
// window.ChatSessions; this file owns none of the DOM message list.
// ============================================================

(function () {
    "use strict";

    const MANIFEST = {
        id: "ChatSend.utility", type: "utility", layer: 2,
        runtime: "Browser", version: "1.0.0",
        requires: ["ChatRendering.utility", "ChatSessions.utility"],
        dependencies: ["ChatRendering.utility", "ChatSessions.utility"],
        docs: { description: "Chat.feature.js's send flow: handleSend() collects the input, dispatches to the chat/multi_model_send workflow, streams the reply via ChatRendering's streaming-bubble helpers, and persists both sides via ChatSessions.persistMessage(). Takes an explicit ctx object for Chat.feature.js's private streaming/history/session state (see file header). Extracted from Chat.feature.js as part of the Phase 5 oversized-file split.", author: "ProtoAI Team" }
    };

    // ── Send ─────────────────────────────────────────────────

    async function handleSend(ctx) {
        if (ctx.isStreaming()) return;

        const input = document.getElementById("chatInput");
        const text  = input?.value.trim();
        if (!text) return;

        ctx.pushHistory(text);
        ctx.resetHistoryIdx();

        // Persist prompts to localStorage as fallback
        try {
            const key = `protoai:chat:history:${window.currentProject || "default"}`;
            localStorage.setItem(key, JSON.stringify(ctx.getHistorySnapshot().slice(-50)));
        } catch (_) { /* quota exceeded — ignore */ }

        input.value = "";
        input.style.height = "auto";
        window.ChatRendering.appendMessage("user", text);

        const project      = ctx.getCurrentProject();
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
            ctx.setStreaming(true);
            input.disabled = true;

            // Create the reply bubble immediately so chunks can flow in
            streamEl = window.ChatRendering.createStreamBubble();
            const msgId = streamEl.dataset.id || "msg_" + Date.now();

            // Subscribe to Tauri streaming events before starting the request
            if (window.__TAURI__?.event?.listen) {
                streamUnlisten = await window.__TAURI__.event.listen("chat-stream", (event) => {
                    const chunk = event.payload?.chunk ?? event.payload;
                    if (typeof chunk === "string" && chunk) {
                        window.ChatRendering.appendToStream(streamEl, chunk);
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
                window.ChatRendering.finalizeStream(streamEl, `**Error:** ${errMsg}`);
                return;
            }

            // Streaming: chunks already rendered; just finalize the bubble.
            // Non-streaming fallback: res.response holds the full reply.
            const reply     = res?.response || res?.data?.response || "";
            const gotChunks = streamEl._content.textContent.trim().length > 0;

            if (gotChunks) {
                window.ChatRendering.finalizeStream(streamEl);
            } else if (reply) {
                window.ChatRendering.finalizeStream(streamEl, reply);
            } else {
                window.ChatRendering.finalizeStream(streamEl, "No response received. Check your API keys in Settings → API Keys.");
            }

            // Persist messages to the active session
            const assistantText = streamEl?._content?.textContent || reply || "";
            window.ChatSessions.persistMessage(project, ctx.getCurrentSessionId(), "user", text);
            if (assistantText) window.ChatSessions.persistMessage(project, ctx.getCurrentSessionId(), "assistant", assistantText);

            // Fire-and-forget: notify LOCAL PARTNER so it can run sidebar commentary.
            // Only do this if we ran the standalone 'chat' workflow instead of 'multi_model_send'.
            if (workflow === "chat" && orchestrator && assistantText) {
                window.EventBus?.emit("chat:messageComplete", { message: text, response: assistantText, id: msgId });
            }

        } catch (err) {
            console.error("[Chat] Send failed:", err);
            const msg = (typeof err === "string") ? err : (err.message || "Unknown error");
            if (streamEl) {
                window.ChatRendering.finalizeStream(streamEl, `**Error:** ${msg}`);
            } else {
                window.ChatRendering.appendMessage("system", `**Error:** ${msg}`);
            }
            window.ToastPrim?.show("Message delivery failed", "error");
        } finally {
            ctx.setStreaming(false);
            input.disabled = false;
            input.focus();
            if (streamUnlisten) streamUnlisten();
        }
    }

    // ── Exports ───────────────────────────────────────────────

    const component = { MANIFEST, handleSend };
    window.ChatSend = component;
    if (window.ModuleLoader) window.ModuleLoader.register(MANIFEST, component);

})();
