// ============================================================
// ChatSessions.utility.js — SDOA v5 Utility | layer 2
// Updated: 2026-07-14
// Extracted from Chat.feature.js (Phase 5 — oversized-file split).
// Carries session management: loading the session list, rendering the
// tab bar, switching sessions, creating new sessions, persisting
// messages to a session, and the legacy pre-session history loader.
//
// Chat.feature.js's _sessions / _currentSessionId are its own private
// `let` variables -- a second IIFE can't close over them, so this file
// takes an explicit `ctx` object ({ getSessions, setSessions,
// getCurrentSessionId, setCurrentSessionId, getCurrentProject }),
// same pattern ProjectManagerCustomFields.utility.js used earlier in
// this phase. Calls out to window.ChatRendering.appendMessage() for
// rendering -- ChatSessions never touches the DOM message list
// directly.
// ============================================================

(function () {
    "use strict";

    const MANIFEST = {
        id: "ChatSessions.utility", type: "utility", layer: 2,
        runtime: "Browser", version: "1.0.0",
        requires: ["ChatRendering.utility"],
        dependencies: ["ChatRendering.utility"],
        docs: { description: "Chat.feature.js's session management: loadSessions(), renderTabBar(), switchSession(), createSession(), persistMessage(), and the legacy loadHistory() fallback. Takes an explicit ctx object for Chat.feature.js's private _sessions/_currentSessionId state (see file header). Extracted from Chat.feature.js as part of the Phase 5 oversized-file split.", author: "ProtoAI Team" }
    };

    // ── Session management ────────────────────────────────────

    async function loadSessions(project, ctx) {
        if (!project || !window.backendConnector) return;
        let sessions = [];
        try {
            const res = await window.backendConnector.runWorkflow("chat_session", { action: "list", project });
            sessions = res?.data || res?.sessions || [];
        } catch (_) { sessions = []; }

        // Auto-create a default session if none exist
        if (sessions.length === 0) {
            try {
                const cr = await window.backendConnector.runWorkflow("chat_session", { action: "create", project, name: "Chat 1" });
                sessions = [{ id: cr?.data?.id, name: "Chat 1" }];
            } catch (_) {}
        }

        ctx.setSessions(sessions);
        renderTabBar(ctx);
        // Load first (or current) session
        const target = sessions.find(s => s.id === ctx.getCurrentSessionId()) || sessions[0];
        if (target) await switchSession(project, target.id, ctx);
    }

    function renderTabBar(ctx) {
        const bar = document.getElementById("chat-session-bar");
        if (!bar) return;

        // Remove old tabs (keep the + button)
        bar.querySelectorAll(".chat-session-tab").forEach(t => t.remove());

        const newBtn = bar.querySelector("#chat-session-new");
        const sessions = ctx.getSessions();
        const currentSessionId = ctx.getCurrentSessionId();
        sessions.forEach(sess => {
            const tab = document.createElement("button");
            tab.className = "chat-session-tab";
            tab.dataset.sessionId = sess.id;
            tab.title = sess.name;
            const isActive = sess.id === currentSessionId;
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
                const project = ctx.getCurrentProject();
                if (project) switchSession(project, sess.id, ctx);
            });
            bar.insertBefore(tab, newBtn);
        });
    }

    async function switchSession(project, sessionId, ctx) {
        if (!sessionId) return;
        ctx.setCurrentSessionId(sessionId);
        renderTabBar(ctx);

        // Clear current messages
        const msgList = document.getElementById("chatMessages");
        if (msgList) msgList.innerHTML = "";

        try {
            const res = await window.backendConnector.runWorkflow("chat_session", { action: "load", project, chatId: sessionId });
            const messages = res?.data?.messages || [];
            if (messages.length === 0) {
                window.ChatRendering.appendMessage("system", "New conversation — start typing below.");
                return;
            }
            const recent = messages.slice(-30);
            for (const msg of recent) {
                const role = msg.role === "user" ? "user" : "assistant";
                const text = msg.message || msg.content || msg.text || "";
                const persona = msg.persona || null;
                if (persona) continue; // Skip loading side-channel commentaries into the main chat history view
                if (text) window.ChatRendering.appendMessage(role, text, persona);
            }
        } catch (err) {
            console.warn("[Chat.feature] Session load failed:", err);
        }
    }

    async function createSession(project, ctx) {
        const sessions = ctx.getSessions();
        const name = `Chat ${sessions.length + 1}`;
        try {
            const res = await window.backendConnector.runWorkflow("chat_session", { action: "create", project, name });
            const newSess = { id: res?.data?.id, name };
            sessions.push(newSess);
            ctx.setSessions(sessions);
            await switchSession(project, newSess.id, ctx);
        } catch (err) {
            window.ToastPrim?.show("Could not create session: " + err.message, "error");
        }
    }

    async function persistMessage(project, sessionId, role, text, persona = null) {
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

    async function loadHistory(project) {
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
                if (text) window.ChatRendering.appendMessage(role, text, persona);
            }
        } catch (err) {
            console.warn("[Chat.feature] History load failed:", err);
        }
    }

    // ── Exports ───────────────────────────────────────────────

    const component = {
        MANIFEST,
        loadSessions, renderTabBar, switchSession, createSession, persistMessage, loadHistory
    };
    window.ChatSessions = component;
    if (window.ModuleLoader) window.ModuleLoader.register(MANIFEST, component);

})();
