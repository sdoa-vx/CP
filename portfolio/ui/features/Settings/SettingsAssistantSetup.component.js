// ============================================================
// SettingsAssistantSetup.component.js — SDOA v5 Component | layer 1
// Updated: 2026-07-14
// Extracted from Settings.feature.js (Phase 5 — oversized-file split).
// Renders the "custom-assistant-setup" field type: partner-assistant
// pulse frequency and active persona toggles (stored in localStorage).
// Settings.feature.js's _renderTab() dispatches to
// window.SettingsAssistantSetup.render() for any field with
// type: "custom-assistant-setup".
// ============================================================

(function () {
    "use strict";

    const MANIFEST = {
        id: "SettingsAssistantSetup.component", type: "component", layer: 1,
        runtime: "Browser", version: "1.0.0",
        requires: ["Toast.prim"],
        docs: { description: "Renders the custom-assistant-setup field for Settings.feature.js — partner-assistant pulse frequency select and active-persona toggle buttons, persisted to localStorage under protoai:partner:pulse / protoai:partner:toggles. Extracted from Settings.feature.js as part of the Phase 5 oversized-file split.", author: "ProtoAI team" }
    };

    // ── Assistant Setup ───────────────────────────────────────

    function render(container) {
        const wrap = document.createElement("div");
        wrap.style.cssText = "display:flex; flex-direction:column; gap:20px;";

        let pulse = parseInt(localStorage.getItem("protoai:partner:pulse") || "10", 10);
        let toggles = {};
        try { toggles = JSON.parse(localStorage.getItem("protoai:partner:toggles")) || {}; } catch(e){}

        wrap.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:8px;">
                <label style="font-size:12px; font-weight:600; color:var(--text-muted); text-transform:uppercase;">Pulse Frequency</label>
                <select class="sdoa-input" id="asstPulseSelect" style="max-width:200px; padding:8px; font-size:13px; border-radius:6px; border:1px solid var(--border-subtle); background:var(--bg-elevated); color:var(--text-primary);">
                    <option value="1">1 minute</option>
                    <option value="5">5 minutes</option>
                    <option value="10">10 minutes</option>
                    <option value="15">15 minutes</option>
                    <option value="30">30 minutes</option>
                    <option value="60">1 hour</option>
                </select>
                <div style="font-size:11px; color:var(--text-dim);">How often the assistant randomly checks in on your project.</div>
            </div>

            <div style="display:flex; flex-direction:column; gap:8px; margin-top:8px;">
                <label style="font-size:12px; font-weight:600; color:var(--text-muted); text-transform:uppercase;">Active Personas</label>
                <div id="asstFacetContainer" style="display:flex; flex-wrap:wrap; gap:8px;"></div>
                <div style="font-size:11px; color:var(--text-dim);">Select which aspects of the AI's personality are active in the fan-out commentary.</div>
            </div>
        `;

        const sel = wrap.querySelector("#asstPulseSelect");
        sel.value = pulse;
        sel.addEventListener("change", () => {
            localStorage.setItem("protoai:partner:pulse", sel.value);
            window.ToastPrim?.show("Pulse frequency updated", "success");
        });

        const facetsWrap = wrap.querySelector("#asstFacetContainer");
        const FACETS = [
            { key: "advisor", label: "Advisor" },
            { key: "critic",  label: "Critic" },
            { key: "friend",  label: "Friend" },
            { key: "comedy",  label: "Comedy" },
            { key: "slutty",  label: "Slutty" },
            { key: "slutty_nsfw", label: "Slutty (NSFW)" },
            { key: "scary",   label: "Scary" },
            { key: "scared",  label: "Scared" },
            { key: "alien",   label: "Alien" }
        ];

        FACETS.forEach(f => {
            const key = 'facet_' + f.key;
            const active = f.key === "slutty_nsfw" ? toggles[key] === true : toggles[key] !== false;

            const btn = document.createElement("button");
            btn.className = "sdoa-button " + (active ? "sdoa-button--primary" : "sdoa-button--ghost");
            btn.style.cssText = "font-size: 12px; padding: 6px 12px; border-radius: 12px;";
            btn.innerHTML = (active ? "☑ " : "☐ ") + f.label;

            btn.addEventListener("click", () => {
                const isCurrentlyActive = f.key === "slutty_nsfw" ? toggles[key] === true : toggles[key] !== false;
                const newState = !isCurrentlyActive;

                if (f.key === "slutty_nsfw" && newState === true) {
                    const confirmed = confirm(
                        "DISCLAIMER:\nThe Slutty (NSFW) persona generates explicitly flirtatious, highly sexually suggestive, and uninhibited comments.\n\nAre you sure you want to enable this NSFW persona?"
                    );
                    if (!confirmed) {
                        return;
                    }
                }

                toggles[key] = newState;
                localStorage.setItem("protoai:partner:toggles", JSON.stringify(toggles));

                btn.className = "sdoa-button " + (newState ? "sdoa-button--primary" : "sdoa-button--ghost");
                btn.innerHTML = (newState ? "☑ " : "☐ ") + f.label;
            });
            facetsWrap.appendChild(btn);
        });

        container.appendChild(wrap);
    }

    // ── Exports ───────────────────────────────────────────────

    const component = { MANIFEST, render };
    window.SettingsAssistantSetup = component;
    if (window.ModuleLoader) window.ModuleLoader.register(MANIFEST, component);

})();
