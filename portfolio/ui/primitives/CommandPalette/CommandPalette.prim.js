// Last modified: 2026-06-01 00:00 UTC
// CommandPalette.prim.js — SDOA v5.0 Primitive (Browser)
//
// Change log:
//   5.0.0 — Initial implementation. Registry-aware ⌘K command launcher.
//            Reads live command surface from window.SDOARegistry at mount time.
//            Keyboard-navigable, filterable, dispatches via EventBus.command().
//            Auto-refreshes index when registry:moduleRegistered fires.

(function () {
  "use strict";

  class CommandPalettePrim {
    static MANIFEST = {
      // ── Identity ──────────────────────────────
      id:              "CommandPalette.prim",
      type:            "primitive",
      layer:           2,
      runtime:         "Browser",
      version:         "5.0.0",
      operationalRole: "savant",

      // ── Dependencies ──────────────────────────
      requires:        [],
      dataFiles:       [],

      // ── Lifecycle ─────────────────────────────
      lifecycle: ["init", "mount", "update", "unmount", "destroy"],

      // ── Action Surface ────────────────────────
      actions: {
        commands: {
          open: {
            description: "Open the command palette, optionally pre-seeding the query.",
            input:  { query: "string?" },
            output: "void"
          },
          close: {
            description: "Close and reset the command palette.",
            input:  {},
            output: "void"
          },
          refreshIndex: {
            description: "Rebuild the command index from the live registry.",
            input:  {},
            output: "void"
          }
        },
        events: {
          "palette:opened":          { payload: {} },
          "palette:closed":          { payload: {} },
          "palette:commandSelected": { payload: { moduleId: "string", commandId: "string", params: "object" } }
        },
        accepts: {
          "registry:moduleRegistered": {
            description: "Triggers a command index refresh when a new module is registered."
          },
          "palette:open": {
            description: "External signal to open the palette (e.g. from a keyboard shortcut service)."
          }
        },
        slots: {}
      },

      // ── Documentation ─────────────────────────
      docs: {
        description: "Registry-aware command palette. Reads the live SDOA registry command surface at mount time and presents a searchable, keyboard-navigable launcher. Every declared module command is instantly accessible. New modules auto-appear via registry:moduleRegistered.",
        author: "ProtoAI Core Architecture Group",
        sdoa: "5.0.0"
      }
    };

    // ── Private State ──────────────────────────
    _container    = null;
    _overlay      = null;
    _panel        = null;
    _input        = null;
    _list         = null;
    _commandIndex = [];
    _filtered     = [];
    _activeIdx    = 0;
    _isOpen       = false;
    _config       = {};
    _keyHandler   = null;
    _busUnsub     = [];

    // ── Lifecycle ──────────────────────────────

    async init(config) {
      this._config = config ?? {};
    }

    async mount(container) {
      this._container = container;
      this._buildDOM();
      this._attachKeyHandler();
      this._subscribeEventBus();
      this._buildIndex();

      window.EventBus?.command?.("commandPalette", "open",         ({ query } = {}) => this.open(query));
      window.EventBus?.command?.("commandPalette", "close",        ()               => this.close());
      window.EventBus?.command?.("commandPalette", "refreshIndex", ()               => this._buildIndex());
    }

    async update(newState) {
      if ("open" in newState && newState.open !== this._isOpen) {
        newState.open ? this.open() : this.close();
      }
    }

    async unmount() {
      this._detachKeyHandler();
      this._unsubscribeEventBus();
      this._overlay?.remove();
      this._overlay = null;
      this._panel   = null;
      this._input   = null;
      this._list    = null;
    }

    async destroy() {
      this._container    = null;
      this._commandIndex = [];
    }

    // ── Public API ─────────────────────────────

    open(preQuery = "") {
      if (this._isOpen) return;
      this._isOpen = true;
      this._overlay.classList.add("sdoa-command-palette--visible");
      this._input.value = preQuery;
      this._filter(preQuery);
      requestAnimationFrame(() => this._input.focus());
      window.EventBus?.emit?.("palette:opened", {});
    }

    close() {
      if (!this._isOpen) return;
      this._isOpen = false;
      this._overlay.classList.remove("sdoa-command-palette--visible");
      this._input.value = "";
      this._activeIdx = 0;
      window.EventBus?.emit?.("palette:closed", {});
    }

    // ── Index Building ─────────────────────────

    _buildIndex() {
      this._commandIndex = [];
      const registry = window.SDOARegistry;
      if (!registry) return;

      const modules = typeof registry.getAll === "function"
        ? registry.getAll()
        : Object.values(registry._modules ?? {});

      for (const mod of modules) {
        const manifest = mod?.MANIFEST ?? mod;
        const moduleId = manifest?.id;
        const commands = manifest?.actions?.commands ?? {};

        for (const [cmdId, cmdDef] of Object.entries(commands)) {
          this._commandIndex.push({
            moduleId,
            commandId:   cmdId,
            description: cmdDef.description ?? "",
            inputSchema: cmdDef.input ?? {}
          });
        }
      }

      if (this._isOpen) this._filter(this._input?.value ?? "");
    }

    // ── Filtering & Rendering ──────────────────

    _filter(query) {
      const q = (query ?? "").toLowerCase().trim();
      this._filtered = q.length === 0
        ? [...this._commandIndex]
        : this._commandIndex.filter(entry =>
            entry.moduleId.toLowerCase().includes(q)   ||
            entry.commandId.toLowerCase().includes(q)  ||
            entry.description.toLowerCase().includes(q)
          );
      this._activeIdx = 0;
      this._renderList();
    }

    _renderList() {
      this._list.replaceChildren();

      if (this._filtered.length === 0) {
        const empty = document.createElement("div");
        empty.className = "sdoa-command-palette__empty";
        empty.textContent = "No commands match.";
        this._list.appendChild(empty);
        return;
      }

      this._filtered.forEach((entry, idx) => {
        const item = document.createElement("div");
        item.className = "sdoa-command-palette__item" +
          (idx === this._activeIdx ? " sdoa-command-palette__item--active" : "");
        item.dataset.idx = idx;
        item.setAttribute("role", "option");
        item.setAttribute("aria-selected", idx === this._activeIdx ? "true" : "false");

        const meta = document.createElement("span");
        meta.className = "sdoa-command-palette__meta";
        meta.textContent = `${entry.moduleId}  ›  ${entry.commandId}`;

        const desc = document.createElement("span");
        desc.className = "sdoa-command-palette__desc";
        desc.textContent = entry.description;

        item.appendChild(meta);
        item.appendChild(desc);

        item.addEventListener("click",     () => this._select(idx));
        item.addEventListener("mousemove", () => {
          this._activeIdx = idx;
          this._renderList();
        });

        this._list.appendChild(item);
      });

      const activeEl = this._list.querySelector(".sdoa-command-palette__item--active");
      activeEl?.scrollIntoView({ block: "nearest" });
    }

    _select(idx) {
      const entry = this._filtered[idx];
      if (!entry) return;

      const hasRequiredInputs = Object.keys(entry.inputSchema)
        .filter(k => !k.endsWith("?")).length > 0;

      window.EventBus?.emit?.("palette:commandSelected", {
        moduleId:  entry.moduleId,
        commandId: entry.commandId,
        params:    {}
      });

      if (!hasRequiredInputs) {
        window.EventBus?.command?.(entry.moduleId, entry.commandId, {});
      }

      this.close();
    }

    // ── DOM Construction ───────────────────────

    _buildDOM() {
      this._overlay = document.createElement("div");
      this._overlay.className = "sdoa-command-palette";
      this._overlay.setAttribute("role", "dialog");
      this._overlay.setAttribute("aria-modal", "true");
      this._overlay.setAttribute("aria-label", "Command palette");

      this._panel = document.createElement("div");
      this._panel.className = "sdoa-command-palette__panel";

      const inputWrap = document.createElement("div");
      inputWrap.className = "sdoa-command-palette__input-wrap";

      const icon = document.createElement("span");
      icon.className = "sdoa-command-palette__icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = "⌘";

      this._input = document.createElement("input");
      this._input.className   = "sdoa-command-palette__input";
      this._input.type        = "text";
      this._input.placeholder = "Search commands…";
      this._input.setAttribute("aria-label",     "Command search");
      this._input.setAttribute("autocomplete",   "off");
      this._input.setAttribute("spellcheck",     "false");
      this._input.setAttribute("aria-autocomplete", "list");
      this._input.addEventListener("input", e => this._filter(e.target.value));

      inputWrap.appendChild(icon);
      inputWrap.appendChild(this._input);

      this._list = document.createElement("div");
      this._list.className = "sdoa-command-palette__list";
      this._list.setAttribute("role", "listbox");

      this._panel.appendChild(inputWrap);
      this._panel.appendChild(this._list);
      this._overlay.appendChild(this._panel);

      this._overlay.addEventListener("click", e => {
        if (e.target === this._overlay) this.close();
      });

      this._container.appendChild(this._overlay);
    }

    // ── Keyboard Handling ──────────────────────

    _attachKeyHandler() {
      this._keyHandler = (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "k") {
          e.preventDefault();
          this._isOpen ? this.close() : this.open();
          return;
        }
        if (!this._isOpen) return;

        switch (e.key) {
          case "Escape":
            e.preventDefault();
            this.close();
            break;
          case "ArrowDown":
            e.preventDefault();
            this._activeIdx = Math.min(this._activeIdx + 1, this._filtered.length - 1);
            this._renderList();
            break;
          case "ArrowUp":
            e.preventDefault();
            this._activeIdx = Math.max(this._activeIdx - 1, 0);
            this._renderList();
            break;
          case "Enter":
            e.preventDefault();
            this._select(this._activeIdx);
            break;
        }
      };
      document.addEventListener("keydown", this._keyHandler);
    }

    _detachKeyHandler() {
      if (this._keyHandler) {
        document.removeEventListener("keydown", this._keyHandler);
        this._keyHandler = null;
      }
    }

    // ── EventBus Subscriptions ─────────────────

    _subscribeEventBus() {
      if (!window.EventBus) return;

      const onModuleRegistered = ()            => this._buildIndex();
      const onPaletteOpen      = ({ query } = {}) => this.open(query);

      window.EventBus.on("registry:moduleRegistered", onModuleRegistered);
      window.EventBus.on("palette:open",              onPaletteOpen);

      this._busUnsub = [
        () => window.EventBus.off?.("registry:moduleRegistered", onModuleRegistered),
        () => window.EventBus.off?.("palette:open",              onPaletteOpen)
      ];
    }

    _unsubscribeEventBus() {
      this._busUnsub.forEach(fn => fn());
      this._busUnsub = [];
    }
  }

  window.CommandPalettePrim = CommandPalettePrim;
})();
