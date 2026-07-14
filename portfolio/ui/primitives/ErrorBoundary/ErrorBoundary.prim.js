// ──────────────────────────────────────────────────────────────────
// File:    ErrorBoundary.prim.js
// Version: 4.0.0
// Updated: 2026-06-17T00:00:00Z
// Changes: Distributed from _variances to canonical sdoavx/ structure
// ──────────────────────────────────────────────────────────────────
// ============================================================
// Last modified: 2026-06-07 00:00 UTC
// ErrorBoundary.prim.js — SDOA v4 Primitive | v4.0.0 | layer 2
// Error boundary wrapper for DOM subtrees.
//
// Usage:
//   const boundary = ErrorBoundaryPrim.create({
//     fallback: "Widget failed to load.",
//     onError: (err) => console.error(err),
//   });
//   boundary._sdoaTry(() => {
//     boundary._sdoaBody.appendChild(myWidget);
//   });
//   document.body.appendChild(boundary);
//
//   // Or wrap an existing element:
//   const safe = ErrorBoundaryPrim.wrap(myElement, { fallback: "Oops." });
//   document.body.appendChild(safe);
// ============================================================

(function () {
    "use strict";

    const MANIFEST = {
        id: "ErrorBoundary.prim", type: "primitive", layer: 2, runtime: "Browser", version: "4.0.1",
        requires: [], dependencies: [], capabilities: ["errorboundary:create", "errorboundary:wrap"], dataFiles: [], lifecycle: [],
        actions: {
            commands: {
                create: { description: "Create an error boundary container.", input: "ErrorBoundaryConfig", output: "HTMLElement" },
                wrap:   { description: "Wrap an existing element in an error boundary.", input: { element: "HTMLElement", config: "ErrorBoundaryConfig" }, output: "HTMLElement" }
            },
            events: { "error-boundary:error": { payload: "{ error: Error }" } },
            accepts: {}, slots: { default: "Content rendered inside the boundary." }
        },
        backendDeps: [],
        docs: { description: "UI error boundary primitive. Wraps content slots and catches JS errors. Shows Rebellion Mode fallback UI with Retry/Report/Dismiss. Logs to Chronicle via EventBus.", author: "ProtoAI Core Architecture Group", sdoa: "4.0.0" },
        last_modified: "2026-07-13T00:00:00Z"
    };

    function _makeBtn(label, cls, onClick) {
        var btn = Object.assign(document.createElement('button'), { className: 'sdoa-eb-btn ' + cls, textContent: label });
        btn.addEventListener('click', onClick);
        return btn;
    }

    function _buildFallback(config, err, onReset) {
        const fallback = Object.assign(document.createElement("div"), { className: "sdoa-error-boundary__fallback" });
        fallback.setAttribute("role", "alert");
        const icon = Object.assign(document.createElement("div"), { className: "sdoa-error-boundary__icon", textContent: "⚠" });
        const title = Object.assign(document.createElement("div"), { className: "sdoa-error-boundary__title", textContent: "Something went wrong" });
        const msg = Object.assign(document.createElement("div"), { className: "sdoa-error-boundary__message" });
        if (typeof config.fallback === "string") {
            msg.textContent = config.fallback;
        } else if (config.fallback instanceof HTMLElement) {
            msg.appendChild(config.fallback.cloneNode(true));
        } else if (typeof config.fallback === "function") {
            const result = config.fallback(err);
            if (typeof result === "string") msg.textContent = result;
            else if (result instanceof HTMLElement) msg.appendChild(result);
        } else if (err) {
            msg.textContent = err.message || String(err);
        }
        fallback.appendChild(icon);
        fallback.appendChild(title);
        if (msg.textContent || msg.childElementCount) fallback.appendChild(msg);
        if (config.showReset !== false) {
            const actions = Object.assign(document.createElement("div"), { className: "sdoa-error-boundary__actions" });
            actions.appendChild(_makeBtn("Try again", "sdoa-error-boundary__reset-btn", onReset));
            var reportBtn = _makeBtn('⚑ Report', 'sdoa-eb-btn--report', function() {
                if (window.EventBus && typeof window.EventBus.emit === 'function') window.EventBus.emit('chronicle:record', { type: 'ui:errorBoundaryTriggered', source: 'ErrorBoundary.prim', payload: { message: err.message, stack: err.stack, label: config.label || 'Module' } });
                if (typeof config.onReport === 'function') config.onReport(err);
                reportBtn.textContent = 'Reported'; reportBtn.disabled = true;
            });
            actions.appendChild(reportBtn);
            var dismissBtn = _makeBtn('✕ Dismiss', 'sdoa-eb-btn--dismiss', function() { fallback.remove(); if (typeof config.onDismiss === 'function') config.onDismiss(); });
            actions.appendChild(dismissBtn);
            fallback.appendChild(actions);
        }
        return fallback;
    }

    function create(config = {}) {
        const boundary = Object.assign(document.createElement("div"), { className: "sdoa-error-boundary" + (config.className ? " " + config.className : "") });
        if (config.id) boundary.id = config.id;
        const body = Object.assign(document.createElement("div"), { className: "sdoa-error-boundary__body" });
        boundary.appendChild(body);
        let _errored = false;
        let _fallbackEl = null;
        function _showError(err) {
            if (_errored) return;
            _errored = true;
            if (typeof config.onError === "function") { try { config.onError(err); } catch (_) {} }
            boundary.dispatchEvent(new CustomEvent("error-boundary:error", { bubbles: true, detail: { error: err } }));
            body.style.display = "none";
            _fallbackEl = _buildFallback(config, err, _reset);
            boundary.appendChild(_fallbackEl);
            boundary.classList.add("sdoa-error-boundary--error", 'sdoa-error-boundary--animate');
        }
        function _reset() {
            if (!_errored) return;
            _errored = false;
            if (_fallbackEl) { _fallbackEl.remove(); _fallbackEl = null; }
            body.style.display = "";
            boundary.classList.remove("sdoa-error-boundary--error", 'sdoa-error-boundary--animate');
        }
        boundary._sdoaBody  = body;
        boundary._sdoaError = _showError;
        boundary._sdoaReset = _reset;
        boundary._sdoaTry = (fn) => { try { fn(); } catch (err) { _showError(err); } };
        boundary._sdoaUpdate = (newConfig) => { if ("className" in newConfig) boundary.className = `sdoa-error-boundary ${newConfig.className || ""}`.trim(); };
        return boundary;
    }

    function wrap(element, config = {}) {
        const boundary = create(config);
        boundary._sdoaTry(() => { boundary._sdoaBody.appendChild(element); });
        return boundary;
    }

    window.ErrorBoundaryPrim = { MANIFEST, create, wrap };
    if (window.ModuleLoader) window.ModuleLoader.register(MANIFEST, { create, wrap });

})();
