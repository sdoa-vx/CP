// ============================================================
// PlaygroundFormExecution.utility.js — SDOA v5 Utility | layer 1
// Updated: 2026-07-14
// Extracted from Playground.feature.js (Phase 5 — oversized-file
// split). Carries the input-form renderer and command execution flow:
//   inputForType(type, id, value) / parseValue(type, rawValue) — free
//     functions mapping a schema type to a form control and back.
//   _renderForm(cmdSchema)  — builds the typed input form for the
//     selected command.
//   _execute()              — collects form values, dispatches the
//     command via EventBus, records history, renders the result.
//
// Prototype mixin (applied via Object.assign(PlaygroundFeature.prototype,
// ...) in Playground.feature.js), not an instantiated module.
// PlaygroundFeature is a plain leaf class with no documented subclass
// override contract (confirmed via grep — zero "extends PlaygroundFeature"
// anywhere in the repo), so unlike the SleeveBase split, this isn't
// preserving an override hook — it's simply the lowest-risk way to move
// methods off a class body with zero changes to the method bodies
// themselves: Object.assign onto the prototype means every `this.`
// reference here keeps resolving exactly as it did inline.
// ============================================================

(function () {
    "use strict";

    const MANIFEST = {
        id: "PlaygroundFormExecution.utility", type: "utility", layer: 1,
        runtime: "Browser", version: "1.0.0",
        docs: { description: "Prototype mixin (applied via Object.assign, not instantiated) contributing Playground.feature.js's input-form renderer and command execution flow: inputForType()/parseValue() type mapping, _renderForm(), _execute(). Extracted from Playground.feature.js as part of the Phase 5 oversized-file split.", author: "ProtoAI Core Architecture Group" }
    };

    // -- Type -> input element mapping ------------------------------------
    function inputForType(type, id, value) {
        const base = type?.replace("?", "") ?? "string";
        if (base === "boolean") {
            const el = document.createElement("select");
            ["true", "false"].forEach(v => {
                const o = document.createElement("option");
                o.value = v; o.textContent = v;
                if (String(value) === v) o.selected = true;
                el.appendChild(o);
            });
            return el;
        }
        if (base === "number") {
            const el = document.createElement("input");
            el.type  = "number";
            el.value = value ?? "";
            return el;
        }
        if (base === "object" || base === "object[]") {
            const el = document.createElement("textarea");
            el.rows  = 4;
            el.value = value ? JSON.stringify(value, null, 2) : "{}";
            return el;
        }
        const el = document.createElement("input");
        el.type  = "text";
        el.value = value ?? "";
        return el;
    }

    function parseValue(type, rawValue) {
        const base = type?.replace("?", "") ?? "string";
        if (base === "boolean") return rawValue === "true";
        if (base === "number")  return Number(rawValue);
        if (base === "object" || base === "object[]") {
            try { return JSON.parse(rawValue); } catch { return rawValue; }
        }
        return rawValue;
    }

    const PlaygroundFormExecutionMixin = {

        // -- Form Rendering -----------------------------------

        _renderForm(cmdSchema) {
            this._formPanel.replaceChildren();

            if (!cmdSchema) {
                const hint = document.createElement("p");
                hint.className   = "sdoa-playground__hint";
                hint.textContent = "Select a module and command to generate the input form.";
                this._formPanel.appendChild(hint);
                this._runBtn.disabled = true;
                return;
            }

            const inputSchema = cmdSchema.input ?? {};
            const isEmpty     = Object.keys(inputSchema).length === 0;

            if (isEmpty) {
                const note = document.createElement("p");
                note.className   = "sdoa-playground__hint";
                note.textContent = "This command takes no inputs.";
                this._formPanel.appendChild(note);
                this._runBtn.disabled = false;
                return;
            }

            for (const [param, type] of Object.entries(inputSchema)) {
                const isOptional = param.endsWith("?") || type?.endsWith("?");
                const cleanParam = param.replace("?", "");

                const row = document.createElement("div");
                row.className = "sdoa-playground__field";

                const label = document.createElement("label");
                label.className   = "sdoa-playground__label";
                label.htmlFor     = `pg-${cleanParam}`;
                label.textContent = cleanParam + (isOptional ? "" : " *");

                const typeTag = document.createElement("span");
                typeTag.className   = "sdoa-playground__type-tag";
                typeTag.textContent = (type ?? "string").replace("?", "");

                const inputEl = inputForType(type, `pg-${cleanParam}`, "");
                inputEl.id        = `pg-${cleanParam}`;
                inputEl.className = "sdoa-playground__input";
                inputEl.dataset.param = cleanParam;
                inputEl.dataset.type  = type ?? "string";

                label.appendChild(typeTag);
                row.appendChild(label);
                row.appendChild(inputEl);
                this._formPanel.appendChild(row);
            }

            this._runBtn.disabled = false;
        },

        // -- Execution ----------------------------------------

        async _execute() {
            if (!this._selectedModule || !this._selectedCmd) return;

            // Collect params from form
            const params = {};
            this._formPanel.querySelectorAll("[data-param]").forEach(el => {
                params[el.dataset.param] = parseValue(el.dataset.type, el.value ?? el.textContent);
            });

            const dispatchId = `pg-${Date.now()}-${++this._dispatchSeq}`;
            const t0         = Date.now();

            this._setStatus("running", `Dispatching ${this._selectedModule} > ${this._selectedCmd}...`);
            this._runBtn.disabled = true;
            this._renderResult(null, null, true);

            window.EventBus?.emit?.("playground:commandDispatched", {
                moduleId:   this._selectedModule,
                commandId:  this._selectedCmd,
                params,
                dispatchId
            });

            try {
                const result = await window.EventBus?.commandAsync?.(
                    this._selectedModule,
                    this._selectedCmd,
                    params
                );
                const durationMs = Date.now() - t0;

                this._history.unshift({
                    dispatchId, moduleId: this._selectedModule, commandId: this._selectedCmd,
                    params, result, error: null, durationMs, ts: new Date().toISOString()
                });

                this._renderResult(result, durationMs, false);
                this._renderHistory();
                this._setStatus("ready", `[ok] ${durationMs}ms`);

                window.EventBus?.emit?.("playground:resultReceived", { dispatchId, result, durationMs });
            } catch (err) {
                const durationMs = Date.now() - t0;
                this._history.unshift({
                    dispatchId, moduleId: this._selectedModule, commandId: this._selectedCmd,
                    params, result: null, error: err.message, durationMs, ts: new Date().toISOString()
                });

                this._renderResult(null, durationMs, false, err.message);
                this._renderHistory();
                this._setStatus("error", "[x] " + err.message);

                window.EventBus?.emit?.("playground:executionFailed", { dispatchId, error: err.message });
            } finally {
                this._runBtn.disabled = false;
            }
        }

    };

    // ── Exports ───────────────────────────────────────────────

    const component = { MANIFEST, mixin: PlaygroundFormExecutionMixin };
    window.PlaygroundFormExecution = component;
    if (window.ModuleLoader) window.ModuleLoader.register(MANIFEST, component);

})();
