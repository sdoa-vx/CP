// Last modified: 2026-06-01 00:00 UTC
// Playground.feature.js — SDOA v5.0 Feature (Browser)
// Validated by: ProbationOfficer.workflow.rs
//
// Change log:
//   5.0.0 — Initial implementation. Live command executor — Swagger UI for SDOA.
//            Loads registry surface from Oracle. Renders a module/command selector.
//            Auto-generates a typed input form from the selected command's input schema.
//            Dispatches the command via EventBus and renders the result as formatted JSON.
//            Maintains a session history of all executions.

(function () {
  "use strict";

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

  // ---------------------------------------------------------------------

  class PlaygroundFeature {
    static MANIFEST = {
      // -- Identity ------------------------------------------
      id:              "Playground.feature",
      type:            "feature",
      layer:           1,
      runtime:         "Browser",
      version:         "5.0.0",
      operationalRole: "savant",

      // -- Dependencies --------------------------------------
      requires:  ["Panel.prim", "Select.prim", "Form.prim", "Badge.prim", "Toast.prim"],
      dataFiles: [],

      // -- Lifecycle -----------------------------------------
      lifecycle: ["init", "mount", "update", "unmount", "destroy"],

      // -- Action Surface ------------------------------------
      actions: {
        commands: {
          refresh: {
            description: "Reload the Oracle surface and rebuild the module/command index.",
            input:  {},
            output: "void"
          },
          selectModule: {
            description: "Programmatically select a module by id.",
            input:  { moduleId: "string" },
            output: "void"
          },
          selectCommand: {
            description: "Programmatically select a command by name on the current module.",
            input:  { commandId: "string" },
            output: "void"
          },
          clearHistory: {
            description: "Wipe the execution history panel.",
            input:  {},
            output: "void"
          }
        },
        events: {
          "playground:commandDispatched": {
            payload: { moduleId: "string", commandId: "string", params: "object", dispatchId: "string" }
          },
          "playground:resultReceived": {
            payload: { dispatchId: "string", result: "object", durationMs: "number" }
          },
          "playground:executionFailed": {
            payload: { dispatchId: "string", error: "string" }
          }
        },
        accepts: {
          "registry:moduleRegistered":   { description: "Triggers an Oracle refresh." },
          "palette:commandSelected":     { description: "Pre-selects a module and command from the CommandPalette." }
        },
        slots: {}
      },

      // -- Backend Contract ----------------------------------
      backendDeps: [
        { action: "oracle_dump_surface", via: "engine_ipc", params: [] }
      ],

      docs: {
        description: "Live command executor -- Swagger UI for SDOA. Loads the full registry surface from Oracle and presents a two-panel interface: left for module/command selection with an auto-generated typed form, right for formatted result output and execution history. Zero additional tooling needed to explore or test any registered module.",
        author: "ProtoAI Core Architecture Group",
        sdoa:   "5.0.0"
      }
    };

    // -- Private State ------------------------------------
    _container      = null;
    _root           = null;
    _surface        = [];        // SurfaceEntry[] from Oracle.dumpSurface
    _moduleIndex    = new Map(); // moduleId -> { commands: { name -> schema } }
    _selectedModule = null;
    _selectedCmd    = null;
    _history        = [];        // [{ dispatchId, moduleId, commandId, params, result, error, durationMs, ts }]
    _dispatchSeq    = 0;
    _busUnsub       = [];

    // DOM refs
    _moduleSelect   = null;
    _cmdSelect      = null;
    _formPanel      = null;
    _resultPanel    = null;
    _historyPanel   = null;
    _runBtn         = null;
    _statusBadge    = null;

    // -- Lifecycle ----------------------------------------

    async init(config) {
      const onRegistered    = ()                        => this.refresh();
      const onPaletteSelect = ({ moduleId, commandId }) => {
        this._selectModuleById(moduleId);
        if (commandId) this._selectCommandById(commandId);
      };
      window.EventBus?.on("registry:moduleRegistered", onRegistered);
      window.EventBus?.on("palette:commandSelected",   onPaletteSelect);
      this._busUnsub.push(
        () => window.EventBus?.off?.("registry:moduleRegistered", onRegistered),
        () => window.EventBus?.off?.("palette:commandSelected",   onPaletteSelect)
      );
    }

    async mount(container) {
      this._container = container;
      this._buildDOM();
      await this.refresh();

      window.EventBus?.command?.("playground", "refresh",       ()             => this.refresh());
      window.EventBus?.command?.("playground", "selectModule",  ({ moduleId }) => this._selectModuleById(moduleId));
      window.EventBus?.command?.("playground", "selectCommand", ({ commandId})=> this._selectCommandById(commandId));
      window.EventBus?.command?.("playground", "clearHistory",  ()             => this._clearHistory());
    }

    async update() {}

    async unmount() {
      this._unsubscribeEventBus();
      this._root?.remove();
      this._root = null;
    }

    async destroy() {
      this._container = null;
      this._surface   = [];
      this._moduleIndex.clear();
      this._history = [];
    }

    // -- Public API ---------------------------------------

    async refresh() {
      this._setStatus("loading", "Fetching Oracle surface...");
      try {
        const resp = await window.DataAdapter?.dispatch("oracle_dump_surface", {});
        this._surface = resp?.surface ?? resp?.data ?? [];
        this._buildModuleIndex();
        this._populateModuleSelect();
        this._setStatus("ready", `${this._moduleIndex.size} modules indexed`);
      } catch (err) {
        this._setStatus("error", "Oracle unavailable -- " + err.message);
      }
    }

    // -- Index Building -----------------------------------

    _buildModuleIndex() {
      this._moduleIndex.clear();
      for (const entry of this._surface) {
        if (entry.surfaceType !== "command") continue;
        if (!this._moduleIndex.has(entry.moduleId)) {
          this._moduleIndex.set(entry.moduleId, { commands: {} });
        }
        this._moduleIndex.get(entry.moduleId).commands[entry.name] = entry.schema;
      }
    }

    // -- Selection ----------------------------------------

    _selectModuleById(moduleId) {
      if (!this._moduleIndex.has(moduleId)) return;
      this._selectedModule = moduleId;
      this._selectedCmd    = null;
      if (this._moduleSelect) this._moduleSelect.value = moduleId;
      this._populateCmdSelect(moduleId);
      this._renderForm(null);
      this._clearResult();
    }

    _selectCommandById(commandId) {
      if (!this._selectedModule) return;
      this._selectedCmd = commandId;
      if (this._cmdSelect) this._cmdSelect.value = commandId;
      const cmds = this._moduleIndex.get(this._selectedModule)?.commands ?? {};
      this._renderForm(cmds[commandId] ?? null);
      this._clearResult();
    }

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
    }

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

    // -- Result Rendering ---------------------------------

    _renderResult(result, durationMs, loading, error) {
      this._resultPanel.replaceChildren();

      if (loading) {
        const spinner = document.createElement("div");
        spinner.className   = "sdoa-playground__spinner";
        spinner.textContent = "Dispatching...";
        this._resultPanel.appendChild(spinner);
        return;
      }

      const header = document.createElement("div");
      header.className = "sdoa-playground__result-header";

      const label = document.createElement("span");
      label.className   = "sdoa-playground__result-label";
      label.textContent = error ? "[x] Error" : "[ok] Result";
      label.style.color = error ? "var(--color-error)" : "var(--color-success)";

      const timing = document.createElement("span");
      timing.className   = "sdoa-playground__result-timing";
      timing.textContent = durationMs != null ? `${durationMs}ms` : "";

      header.appendChild(label);
      header.appendChild(timing);

      const pre = document.createElement("pre");
      pre.className   = "sdoa-playground__result-body" + (error ? " sdoa-playground__result-body--error" : "");
      pre.textContent = error
        ? error
        : JSON.stringify(result ?? null, null, 2);

      this._resultPanel.appendChild(header);
      this._resultPanel.appendChild(pre);
    }

    _clearResult() {
      this._resultPanel.replaceChildren();
      const hint = document.createElement("p");
      hint.className   = "sdoa-playground__hint";
      hint.textContent = "Result will appear here after execution.";
      this._resultPanel.appendChild(hint);
    }

    // -- History Rendering --------------------------------

    _renderHistory() {
      this._historyPanel.replaceChildren();

      if (this._history.length === 0) {
        const hint = document.createElement("p");
        hint.className   = "sdoa-playground__hint";
        hint.textContent = "No executions yet.";
        this._historyPanel.appendChild(hint);
        return;
      }

      for (const run of this._history.slice(0, 20)) {
        const row = document.createElement("div");
        row.className = "sdoa-playground__history-row" +
          (run.error ? " sdoa-playground__history-row--error" : "");

        const main = document.createElement("span");
        main.className   = "sdoa-playground__history-main";
        main.textContent = `${run.moduleId} > ${run.commandId}`;

        const meta = document.createElement("span");
        meta.className   = "sdoa-playground__history-meta";
        meta.textContent = `${run.durationMs}ms · ${run.ts.slice(11, 19)}`;

        row.appendChild(main);
        row.appendChild(meta);

        // Click to restore that run's result
        row.addEventListener("click", () => {
          this._renderResult(run.result, run.durationMs, false, run.error);
          this._selectModuleById(run.moduleId);
          this._selectCommandById(run.commandId);
        });

        this._historyPanel.appendChild(row);
      }
    }

    _clearHistory() {
      this._history = [];
      this._renderHistory();
    }

    // -- Select Population --------------------------------

    _populateModuleSelect() {
      const sel = this._moduleSelect;
      const prev = sel.value;
      sel.replaceChildren();

      const placeholder = document.createElement("option");
      placeholder.value = ""; placeholder.textContent = "-- select module --";
      sel.appendChild(placeholder);

      for (const id of [...this._moduleIndex.keys()].sort()) {
        const opt = document.createElement("option");
        opt.value = id; opt.textContent = id;
        if (id === prev) opt.selected = true;
        sel.appendChild(opt);
      }

      if (prev && this._moduleIndex.has(prev)) {
        this._populateCmdSelect(prev);
      }
    }

    _populateCmdSelect(moduleId) {
      const sel  = this._cmdSelect;
      const prev = sel.value;
      sel.replaceChildren();

      const placeholder = document.createElement("option");
      placeholder.value = ""; placeholder.textContent = "-- select command --";
      sel.appendChild(placeholder);

      const cmds = this._moduleIndex.get(moduleId)?.commands ?? {};
      for (const name of Object.keys(cmds).sort()) {
        const opt = document.createElement("option");
        opt.value = name; opt.textContent = name;
        if (name === prev) opt.selected = true;
        sel.appendChild(opt);
      }

      sel.disabled = Object.keys(cmds).length === 0;
    }

    // -- Status Badge -------------------------------------

    _setStatus(state, msg) {
      if (!this._statusBadge) return;
      this._statusBadge.className = `sdoa-playground__status sdoa-playground__status--${state}`;
      this._statusBadge.textContent = msg;
    }

    // -- DOM Construction ---------------------------------

    _buildDOM() {
      this._root = document.createElement("div");
      this._root.className = "sdoa-playground";

      // -- Top Bar -------------------------------------------
      const topBar = document.createElement("div");
      topBar.className = "sdoa-playground__topbar";

      const title = document.createElement("span");
      title.className   = "sdoa-playground__title";
      title.textContent = "Playground -- Live Command Executor";

      this._statusBadge = document.createElement("span");
      this._statusBadge.className = "sdoa-playground__status sdoa-playground__status--loading";
      this._statusBadge.textContent = "Initializing...";

      const refreshBtn = document.createElement("button");
      refreshBtn.className   = "sdoa-playground__toolbar-btn";
      refreshBtn.textContent = "Refresh";
      refreshBtn.addEventListener("click", () => this.refresh());

      const clearHistBtn = document.createElement("button");
      clearHistBtn.className   = "sdoa-playground__toolbar-btn";
      clearHistBtn.textContent = "Clear History";
      clearHistBtn.addEventListener("click", () => this._clearHistory());

      topBar.appendChild(title);
      topBar.appendChild(this._statusBadge);
      topBar.appendChild(refreshBtn);
      topBar.appendChild(clearHistBtn);

      // -- Selector Row --------------------------------------
      const selectorRow = document.createElement("div");
      selectorRow.className = "sdoa-playground__selector-row";

      this._moduleSelect = document.createElement("select");
      this._moduleSelect.className = "sdoa-playground__select";
      this._moduleSelect.setAttribute("aria-label", "Select module");
      this._moduleSelect.addEventListener("change", e => {
        const id = e.target.value;
        if (id) this._selectModuleById(id);
      });

      const arrow = document.createElement("span");
      arrow.className   = "sdoa-playground__arrow";
      arrow.textContent = ">";

      this._cmdSelect = document.createElement("select");
      this._cmdSelect.className = "sdoa-playground__select";
      this._cmdSelect.disabled  = true;
      this._cmdSelect.setAttribute("aria-label", "Select command");
      this._cmdSelect.addEventListener("change", e => {
        const name = e.target.value;
        if (name) this._selectCommandById(name);
      });

      this._runBtn = document.createElement("button");
      this._runBtn.className   = "sdoa-playground__run-btn";
      this._runBtn.textContent = "Run";
      this._runBtn.disabled    = true;
      this._runBtn.addEventListener("click", () => this._execute());

      selectorRow.appendChild(this._moduleSelect);
      selectorRow.appendChild(arrow);
      selectorRow.appendChild(this._cmdSelect);
      selectorRow.appendChild(this._runBtn);

      // -- Main Body -----------------------------------------
      const body = document.createElement("div");
      body.className = "sdoa-playground__body";

      // Left: form
      const formCol = document.createElement("div");
      formCol.className = "sdoa-playground__col sdoa-playground__col--form";
      const formTitle = document.createElement("div");
      formTitle.className   = "sdoa-playground__col-title";
      formTitle.textContent = "Input Parameters";
      this._formPanel = document.createElement("div");
      this._formPanel.className = "sdoa-playground__form-panel";
      const hint = document.createElement("p");
      hint.className   = "sdoa-playground__hint";
      hint.textContent = "Select a module and command to generate the input form.";
      this._formPanel.appendChild(hint);
      formCol.appendChild(formTitle);
      formCol.appendChild(this._formPanel);

      // Middle: result
      const resultCol = document.createElement("div");
      resultCol.className = "sdoa-playground__col sdoa-playground__col--result";
      const resultTitle = document.createElement("div");
      resultTitle.className   = "sdoa-playground__col-title";
      resultTitle.textContent = "Result";
      this._resultPanel = document.createElement("div");
      this._resultPanel.className = "sdoa-playground__result-panel";
      this._clearResult();
      resultCol.appendChild(resultTitle);
      resultCol.appendChild(this._resultPanel);

      // Right: history
      const historyCol = document.createElement("div");
      historyCol.className = "sdoa-playground__col sdoa-playground__col--history";
      const historyTitle = document.createElement("div");
      historyTitle.className   = "sdoa-playground__col-title";
      historyTitle.textContent = "History";
      this._historyPanel = document.createElement("div");
      this._historyPanel.className = "sdoa-playground__history-panel";
      this._renderHistory();
      historyCol.appendChild(historyTitle);
      historyCol.appendChild(this._historyPanel);

      body.appendChild(formCol);
      body.appendChild(resultCol);
      body.appendChild(historyCol);

      this._root.appendChild(topBar);
      this._root.appendChild(selectorRow);
      this._root.appendChild(body);
      this._container.appendChild(this._root);
    }

    _unsubscribeEventBus() {
      this._busUnsub.forEach(fn => fn());
      this._busUnsub = [];
    }
  }

  window.PlaygroundFeature = PlaygroundFeature;
})();
