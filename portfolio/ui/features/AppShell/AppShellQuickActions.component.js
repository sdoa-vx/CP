// ============================================================
// AppShellQuickActions.component.js — SDOA v5 Component | layer 1
// Updated: 2026-07-14
// Extracted from AppShell.feature.js (Phase 5 — oversized-file split).
// Carries the eight [data-action] quick-action handlers wired by the
// core's global click delegate: image prompt creator, image gen, deep
// search, new chat, summarize, translate, code assist, explain code.
//
// Pure DOM + backendConnector + EventBus handlers — none of these
// depend on AppShell.feature.js's private closure state (_sidebarCollapsed/
// _splitActive/_splitMode/_monacoEditor), so this file takes no ctx.
// ============================================================

(function () {
    "use strict";

    const MANIFEST = {
        id: "AppShellQuickActions.component", type: "component", layer: 1,
        runtime: "Browser", version: "1.0.0",
        requires: [],
        dependencies: [],
        docs: { description: "AppShell.feature.js's eight [data-action] quick-action handlers: handlePromptCreator, handleImageGen, handleDeepSearch, handleNewChat, handleSummarize, handleTranslate, handleCodeAssist, handleExplainCode. No ctx needed — none depend on the core's private state. Extracted from AppShell.feature.js as part of the Phase 5 oversized-file split.", author: "ProtoAI Team" }
    };

    function handlePromptCreator() {
        const input = document.getElementById("chatInput");
        if (!input || !input.value.trim()) {
            window.ToastPrim?.show("Type a basic prompt first!", "info");
            return;
        }
        window.EventBus?.emit("chat:promptOptimize", { text: input.value });
    }

    async function handleImageGen() {
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

    function handleDeepSearch() {
        const input = document.getElementById("chatInput");
        if (!input || !input.value.trim()) {
            window.ToastPrim?.show("Enter a research topic first.", "info");
            return;
        }
        window.EventBus?.emit("chat:deepSearch", { query: input.value });
    }

    function handleNewChat() {
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

    function handleSummarize() {
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

    function handleTranslate() {
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

    function handleCodeAssist() {
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

    function handleExplainCode() {
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

    // ── Exports ───────────────────────────────────────────────

    const component = {
        MANIFEST,
        handlePromptCreator, handleImageGen, handleDeepSearch, handleNewChat,
        handleSummarize, handleTranslate, handleCodeAssist, handleExplainCode
    };
    window.AppShellQuickActions = component;
    if (window.ModuleLoader) window.ModuleLoader.register(MANIFEST, component);

})();
