// Last modified: 2026-07-14
// Playground.feature.js — SDOA v5.1 Feature (Browser)
// Validated by: ProbationOfficer.workflow.rs
//
// Change log:
//   5.1.0 — Phase 5 (oversized-file split). Extracted three
//           self-contained pieces into prototype mixins, applied via
//           Object.assign(PlaygroundFeature.prototype, ...) below:
//             PlaygroundFormExecution.utility.js — inputForType()/
//               parseValue(), _renderForm(), _execute().
//             PlaygroundResultHistory.utility.js — _renderResult(),
//               _clearResult(), _renderHistory(), _clearHistory().
//             PlaygroundDomBuilder.utility.js     — _buildDOM().
//           PlaygroundFeature has no documented subclass override
//           contract (confirmed via grep — no "extends PlaygroundFeature"
//           anywhere in the repo), so unlike SleeveBase this split isn't
//           preserving an override hook; Object.assign was simply the
//           lowest-risk way to move methods off the class body with
//           zero changes to any method's own code — every `this.`
//           reference in the three mixins resolves exactly as it did
//           when the methods were inline. File was 628 lines (flagged
//           non-sdoa-compliant purely for size); now under the Layer 1
//           cap and fully manifest-compliant.
//
//           LOAD ORDER NOTE: Object.assign(prototype, ...) below runs
//           synchronously at script-parse time, so
//           PlaygroundFormExecution.utility.js, PlaygroundResultHistory
//           .utility.js, and PlaygroundDomBuilder.utility.js MUST be
//           loaded via <script> tags before this file, or this throws
//           immediately (window.PlaygroundFormExecution etc. would be
//           undefined). This is sharper than SleeveBase's require()-based
//           mixins, which resolve correctly regardless of require()
//           order. Currently moot -- Playground.feature.js, like
//           Blueprint.feature.js, has no <script> tag anywhere in the
//           repo (confirmed via grep) and is not part of any load
//           order today. Flagging here so whoever eventually wires
//           this up doesn't get bitten by it.
//   5.0.0 — Initial implementation. Live command executor — Swagger UI for SDOA.
//            Loads registry surface from Oracle. Renders a module/command selector.
//            Auto-generates a typed input form from the selected command's input schema.
//            Dispatches the command via EventBus and renders the result as formatted JSON.
//            Maintains a session history of all executions.

(function () {
  "use strict";

  class PlaygroundFeature {
    static MANIFEST = {
      // -- Identity ------------------------------------------
      id:              "Playground.feature",
      type:            "feature",
      layer:           1,
      runtime:         "Browser",
      version:         "5.1.0",
      operationalRole: "savant",

      // -- Dependencies --------------------------------------
      requires:  [
        "Panel.prim", "Select.prim", "Form.prim", "Badge.prim", "Toast.prim",
        "PlaygroundFormExecution.utility", "PlaygroundResultHistory.utility", "PlaygroundDomBuilder.utility"
      ],
      dependencies: [
        "PlaygroundFormExecution.utility", "PlaygroundResultHistory.utility", "PlaygroundDomBuilder.utility"
      ],
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
        description: "Live command executor -- Swagger UI for SDOA. Loads the full registry surface from Oracle and presents a two-panel interface: left for module/command selection with an auto-generated typed form, right for formatted result output and execution history. Zero additional tooling needed to explore or test any registered module. Form rendering/execution, result/history rendering, and DOM construction are contributed via prototype mixins (see dependencies).",
        author: "ProtoAI Core Architecture Group",
        sdoa:   "5.1.0"
      },
      last_modified: "2026-07-14T00:00:00Z"
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

    _unsubscribeEventBus() {
      this._busUnsub.forEach(fn => fn());
      this._busUnsub = [];
    }
  }

  // Prototype mixins — see file header for why this split uses
  // Object.assign onto PlaygroundFeature.prototype.
  Object.assign(
    PlaygroundFeature.prototype,
    window.PlaygroundFormExecution.mixin,
    window.PlaygroundResultHistory.mixin,
    window.PlaygroundDomBuilder.mixin
  );

  window.PlaygroundFeature = PlaygroundFeature;
})();
