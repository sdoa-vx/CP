// Last modified: 2026-06-01 00:00 UTC
// Timeline.prim.js — SDOA v5.0 Primitive (Browser)
//
// Change log:
//   5.0.0 — Initial implementation. Swimlane event-stream visualizer.
//            Consumes Chronicle.service.js entries. One lane per source module.
//            Each entry renders as a colored dot on a time axis. Click to inspect
//            the full payload in a side panel. Filterable by source and type prefix.
//            Auto-subscribes to chronicle:entryRecorded for live updates.

(function () {
  "use strict";

  // ── Type color palette (cycles for unknown types) ────────────
  const TYPE_COLORS = {
    "event":    "#7c3aed",   // accent purple
    "mutation": "#2563eb",   // blue
    "command":  "#16a34a",   // green
    "error":    "#ef4444",   // red
    "system":   "#ca8a04",   // amber
  };
  const CYCLE_COLORS = ["#06b6d4","#f97316","#ec4899","#84cc16","#a855f7"];

  function typeColor(type, cycleMap) {
    const prefix = (type ?? "").split(":")[0];
    if (TYPE_COLORS[prefix]) return TYPE_COLORS[prefix];
    if (!cycleMap.has(prefix)) {
      cycleMap.set(prefix, CYCLE_COLORS[cycleMap.size % CYCLE_COLORS.length]);
    }
    return cycleMap.get(prefix);
  }

  // ─────────────────────────────────────────────────────────────

  class TimelinePrim {
    static MANIFEST = {
      // ── Identity ──────────────────────────────
      id:              "Timeline.prim",
      type:            "primitive",
      layer:           2,
      runtime:         "Browser",
      version:         "5.0.1",
      operationalRole: "savant",

      // ── Dependencies ──────────────────────────
      requires:  [],
      dependencies: [],
      capabilities: [
        "timeline:loadEntries",
        "timeline:appendEntry",
        "timeline:clearEntries",
        "timeline:setFilter",
        "timeline:scrollToLatest"
      ],
      dataFiles: [],

      // ── Lifecycle ─────────────────────────────
      lifecycle: ["init", "mount", "update", "unmount", "destroy"],

      // ── Action Surface ────────────────────────
      actions: {
        commands: {
          loadEntries: {
            description: "Replace the full entry set with the provided array.",
            input:  { entries: "object[]" },
            output: "void"
          },
          appendEntry: {
            description: "Append a single Chronicle entry and re-render.",
            input:  { entry: "object" },
            output: "void"
          },
          clearEntries: {
            description: "Wipe all entries and reset the view.",
            input:  {},
            output: "void"
          },
          setFilter: {
            description: "Apply a source or type filter. Pass empty strings to clear.",
            input:  { source: "string?", typePrefix: "string?" },
            output: "void"
          },
          scrollToLatest: {
            description: "Snap the timeline scroll position to the most recent entry.",
            input:  {},
            output: "void"
          }
        },
        events: {
          "timeline:entrySelected": {
            payload: { entry: "object" }
          },
          "timeline:entryDeselected": {
            payload: {}
          }
        },
        accepts: {
          "chronicle:entryRecorded": {
            description: "Live-appends each new Chronicle entry to the timeline."
          }
        },
        slots: {}
      },

      docs: {
        description: "Swimlane event-stream visualizer for Chronicle.service.js. Groups entries by source module into horizontal lanes. Each entry is a color-coded dot on a time axis — click to inspect the full payload. Filterable by source and type prefix. Subscribes to chronicle:entryRecorded for live updates.",
        author: "ProtoAI Core Architecture Group",
        sdoa: "5.0.0"
      },
      last_modified: "2026-07-13T00:00:00Z"
    };

    // ── Private State ─────────────────────────
    _container   = null;
    _root        = null;
    _laneWrap    = null;
    _inspector   = null;
    _filterBar   = null;
    _entries     = [];
    _filter      = { source: "", typePrefix: "" };
    _selected    = null;
    _colorCycle  = new Map();
    _busUnsub    = [];
    _config      = {};

    // ── Lifecycle ─────────────────────────────

    async init(config) {
      this._config = config ?? {};
    }

    async mount(container) {
      this._container = container;
      this._buildDOM();
      this._subscribeEventBus();
      this._render();

      window.EventBus?.command?.("timeline", "loadEntries",   ({ entries })           => this.loadEntries(entries));
      window.EventBus?.command?.("timeline", "appendEntry",   ({ entry })             => this.appendEntry(entry));
      window.EventBus?.command?.("timeline", "clearEntries",  ()                      => this.clearEntries());
      window.EventBus?.command?.("timeline", "setFilter",     ({ source, typePrefix}) => this.setFilter(source, typePrefix));
      window.EventBus?.command?.("timeline", "scrollToLatest",()                      => this.scrollToLatest());
    }

    async update(newState) {
      if (Array.isArray(newState.entries)) { this.loadEntries(newState.entries); return; }
      if (newState.entry)                  { this.appendEntry(newState.entry);   return; }
      if (newState.filter)                 { this.setFilter(newState.filter.source, newState.filter.typePrefix); }
    }

    async unmount() {
      this._unsubscribeEventBus();
      this._root?.remove();
      this._root = this._laneWrap = this._inspector = this._filterBar = null;
    }

    async destroy() {
      this._container = null;
      this._entries   = [];
      this._colorCycle.clear();
    }

    // ── Public API ────────────────────────────

    loadEntries(entries) {
      this._entries = Array.isArray(entries) ? [...entries] : [];
      this._selected = null;
      this._render();
    }

    appendEntry(entry) {
      this._entries.push(entry);
      this._render();
      if (this._config.autoScroll !== false) this.scrollToLatest();
    }

    clearEntries() {
      this._entries  = [];
      this._selected = null;
      this._colorCycle.clear();
      this._render();
      this._renderInspector(null);
    }

    setFilter(source = "", typePrefix = "") {
      this._filter = { source, typePrefix };
      this._updateFilterBar();
      this._render();
    }

    scrollToLatest() {
      if (this._laneWrap) {
        this._laneWrap.scrollLeft = this._laneWrap.scrollWidth;
      }
    }

    // ── Rendering ─────────────────────────────

    _render() {
      this._laneWrap.replaceChildren();

      const visible = this._visibleEntries();
      if (visible.length === 0) {
        const empty = document.createElement("div");
        empty.className   = "sdoa-timeline__empty";
        empty.textContent = "No entries. Waiting for Chronicle…";
        this._laneWrap.appendChild(empty);
        return;
      }

      // Group by source
      const laneMap = new Map();
      for (const entry of visible) {
        const key = entry.source ?? "unknown";
        if (!laneMap.has(key)) laneMap.set(key, []);
        laneMap.get(key).push(entry);
      }

      // Time bounds for positioning
      const times    = visible.map(e => new Date(e.timestamp).getTime());
      const minTime  = Math.min(...times);
      const maxTime  = Math.max(...times);
      const timeSpan = maxTime - minTime || 1;

      const trackWidth = Math.max(this._laneWrap.clientWidth - 160, laneMap.size * 40, 600);

      for (const [source, entries] of laneMap) {
        const lane = document.createElement("div");
        lane.className = "sdoa-timeline__lane";

        const label = document.createElement("div");
        label.className   = "sdoa-timeline__label";
        label.textContent = source;
        label.title       = source;

        const track = document.createElement("div");
        track.className = "sdoa-timeline__track";
        track.style.width = `${trackWidth}px`;

        for (const entry of entries) {
          const t   = new Date(entry.timestamp).getTime();
          const pct = (t - minTime) / timeSpan;
          const x   = Math.round(pct * (trackWidth - 24));

          const dot = document.createElement("button");
          dot.className = "sdoa-timeline__dot" +
            (this._selected?.id === entry.id ? " sdoa-timeline__dot--selected" : "");
          dot.style.left            = `${x}px`;
          dot.style.backgroundColor = typeColor(entry.type, this._colorCycle);
          dot.title                 = `${entry.type}  ·  ${entry.timestamp}`;
          dot.setAttribute("aria-label", `${entry.type} at ${entry.timestamp}`);

          dot.addEventListener("click", () => this._selectEntry(entry));
          track.appendChild(dot);
        }

        lane.appendChild(label);
        lane.appendChild(track);
        this._laneWrap.appendChild(lane);
      }
    }

    _selectEntry(entry) {
      this._selected = entry;
      this._renderInspector(entry);
      this._render();
      window.EventBus?.emit?.("timeline:entrySelected", { entry });
    }

    _renderInspector(entry) {
      this._inspector.replaceChildren();

      if (!entry) {
        const hint = document.createElement("div");
        hint.className   = "sdoa-timeline__inspector-hint";
        hint.textContent = "Click a dot to inspect its payload.";
        this._inspector.appendChild(hint);
        return;
      }

      const rows = [
        ["ID",         entry.id],
        ["Seq #",      entry.sequenceNo],
        ["Type",       entry.type],
        ["Source",     entry.source],
        ["Timestamp",  entry.timestamp],
        ["Prev Hash",  entry.prevHash?.slice(0, 16) + "…"],
        ["Payload",    JSON.stringify(entry.payload, null, 2)]
      ];

      for (const [label, value] of rows) {
        const row = document.createElement("div");
        row.className = "sdoa-timeline__inspector-row";

        const lbl = document.createElement("span");
        lbl.className   = "sdoa-timeline__inspector-label";
        lbl.textContent = label;

        const val = document.createElement("pre");
        val.className   = "sdoa-timeline__inspector-value";
        val.textContent = value ?? "—";

        row.appendChild(lbl);
        row.appendChild(val);
        this._inspector.appendChild(row);
      }

      const deselect = document.createElement("button");
      deselect.className   = "sdoa-timeline__inspector-close";
      deselect.textContent = "✕ Deselect";
      deselect.addEventListener("click", () => {
        this._selected = null;
        this._renderInspector(null);
        this._render();
        window.EventBus?.emit?.("timeline:entryDeselected", {});
      });
      this._inspector.appendChild(deselect);
    }

    _visibleEntries() {
      return this._entries.filter(e => {
        const srcMatch  = !this._filter.source     || (e.source ?? "").includes(this._filter.source);
        const typeMatch = !this._filter.typePrefix || (e.type   ?? "").startsWith(this._filter.typePrefix);
        return srcMatch && typeMatch;
      });
    }

    // ── DOM Construction ──────────────────────

    _buildDOM() {
      this._root = document.createElement("div");
      this._root.className = "sdoa-timeline";

      // Filter bar
      this._filterBar = document.createElement("div");
      this._filterBar.className = "sdoa-timeline__filter-bar";

      const srcInput = document.createElement("input");
      srcInput.className   = "sdoa-timeline__filter-input";
      srcInput.placeholder = "Filter by source…";
      srcInput.setAttribute("aria-label", "Filter by source");
      srcInput.addEventListener("input", e => this.setFilter(e.target.value, this._filter.typePrefix));

      const typeInput = document.createElement("input");
      typeInput.className   = "sdoa-timeline__filter-input";
      typeInput.placeholder = "Filter by type (event, mutation, command…)";
      typeInput.setAttribute("aria-label", "Filter by type prefix");
      typeInput.addEventListener("input", e => this.setFilter(this._filter.source, e.target.value));

      const clearBtn = document.createElement("button");
      clearBtn.className   = "sdoa-timeline__filter-clear";
      clearBtn.textContent = "Clear";
      clearBtn.addEventListener("click", () => {
        srcInput.value = "";
        typeInput.value = "";
        this.setFilter("", "");
      });

      this._filterBar._srcInput  = srcInput;
      this._filterBar._typeInput = typeInput;
      this._filterBar.appendChild(srcInput);
      this._filterBar.appendChild(typeInput);
      this._filterBar.appendChild(clearBtn);

      // Lane scroll area
      this._laneWrap = document.createElement("div");
      this._laneWrap.className = "sdoa-timeline__lanes";

      // Inspector panel
      this._inspector = document.createElement("div");
      this._inspector.className = "sdoa-timeline__inspector";
      this._renderInspector(null);

      // Body (lanes + inspector side-by-side)
      const body = document.createElement("div");
      body.className = "sdoa-timeline__body";
      body.appendChild(this._laneWrap);
      body.appendChild(this._inspector);

      this._root.appendChild(this._filterBar);
      this._root.appendChild(body);
      this._container.appendChild(this._root);
    }

    _updateFilterBar() {
      if (!this._filterBar) return;
      if (this._filterBar._srcInput)  this._filterBar._srcInput.value  = this._filter.source ?? "";
      if (this._filterBar._typeInput) this._filterBar._typeInput.value = this._filter.typePrefix ?? "";
    }

    // ── EventBus Subscriptions ─────────────────

    _subscribeEventBus() {
      if (!window.EventBus) return;
      const onEntry = (entry) => this.appendEntry(entry);
      window.EventBus.on("chronicle:entryRecorded", onEntry);
      this._busUnsub = [() => window.EventBus.off?.("chronicle:entryRecorded", onEntry)];
    }

    _unsubscribeEventBus() {
      this._busUnsub.forEach(fn => fn());
      this._busUnsub = [];
    }
  }

  window.TimelinePrim = TimelinePrim;
})();
