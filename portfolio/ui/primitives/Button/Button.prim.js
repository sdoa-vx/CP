// ============================================================
// Button.prim.js — SDOA v4 Primitive
// version: 4.0.0
// Last modified: 2026-05-04 03:11 UTC
// layer: 2 (primitive)
//
// Generic button primitive. Renders any clickable action.
// Configured via a config object — never subclassed.
//
// Usage:
//   const btn = Button.create({
//     label: "Save",
//     icon: "💾",
//     variant: "primary",
//     onClick: () => { ... },
//   });
//   container.appendChild(btn);
// ============================================================

(function () {
    "use strict";

    // ── SDOA v4 MANIFEST ─────────────────────────────────────
    const MANIFEST = {
        id:       "Button.prim",
        type:     "primitive",
        layer:    2,
        runtime:  "Browser",
        version:  "4.0.1",
        last_modified: "2026-07-13T00:00:00Z",

        requires: [],
        dependencies: [],
        capabilities: ["button:create"],
        dataFiles: [],

        lifecycle: [],

        actions: {
            commands: {
                create: {
                    description: "Create a button DOM element from config.",
                    input: { label: "string?", icon: "string?", variant: "string?", size: "string?", onClick: "fn?", disabled: "boolean?", tooltip: "string?", loading: "boolean?", id: "string?" },
                    output: "HTMLElement"
                },
            },
            events: {},
            accepts: {},
            slots: {},
        },

        backendDeps: [],

        docs: {
            description: "Generic button primitive. Supports primary, secondary, ghost, danger, icon-only variants. Handles loading states and tooltips.",
            author: "ProtoAI team",
            sdoa: "4.0.0"
        }
    };
    // ── end MANIFEST ─────────────────────────────────────────

    function create(config = {}) {
        const btn = document.createElement("button");

        const variant = config.variant || "secondary";
        const size    = config.size    || "md";

        btn.className = `sdoa-button sdoa-button--${variant} sdoa-button--${size}`;
        if (config.className) btn.className += ` ${config.className}`;
        if (config.loading)   btn.classList.add("sdoa-button--loading");

        if (config.id)       btn.id = config.id;
        if (config.tooltip)  btn.title = config.tooltip;
        if (config.disabled || config.loading) btn.disabled = true;

        _renderContent(btn, config);

        if (typeof config.onClick === "function") {
            btn.addEventListener("click", (e) => {
                if (btn.disabled) return;
                config.onClick(e);
            });
        }

        btn._sdoaUpdate = (newConfig) => {
            Object.assign(config, newConfig);

            btn.className = `sdoa-button sdoa-button--${newConfig.variant || variant} sdoa-button--${newConfig.size || size}`;
            if (newConfig.className) btn.className += ` ${newConfig.className}`;
            if (newConfig.loading)   btn.classList.add("sdoa-button--loading");

            btn.disabled = !!(newConfig.disabled || newConfig.loading);
            if (newConfig.tooltip) btn.title = newConfig.tooltip;

            _renderContent(btn, config);
        };

        return btn;
    }

    function _renderContent(btn, config) {
        let html = "";

        if (config.loading) {
            html += `<span class="sdoa-button__spinner"></span>`;
        }

        if (config.icon && !config.loading) {
            html += `<span class="sdoa-button__icon">${config.icon}</span>`;
        }

        if (config.label) {
            html += `<span class="sdoa-button__label">${config.label}</span>`;
        }

        btn.innerHTML = html;
    }

    // ── Export ────────────────────────────────────────────────
    window.ButtonPrim = { MANIFEST, create };

    if (window.ModuleLoader) {
        window.ModuleLoader.register(MANIFEST, { create });
    }

})();
