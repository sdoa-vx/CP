// Last modified: 2026-06-01 00:00 UTC
// Blueprint.feature.js — SDOA v5.0 Feature (Browser)
// Validated by: ProbationOfficer.workflow.rs
//
// Change log:
//   5.0.0 — Initial implementation. Phase 2 visual orchestrator realized.
//            Renders the live registry as a draggable SVG node graph.
//            Each module is a node. Event ports (right) connect to Accept ports (left).
//            Dragging a wire between ports writes the association into the
//            active connection map. Save dispatches to blueprint_save workflow
//            which commits the wiring as a .schema.json file.

(function () {
  "use strict";

  // -- Layout constants --------------------------------------------------
  const NODE_W       = 220;
  const NODE_H_BASE  = 72;
  const PORT_R       = 6;
  const PORT_SPACING = 22;
  const GRID_COLS    = 3;
  const GRID_PAD_X   = 60;
  const GRID_PAD_Y   = 60;
  const GRID_GAP_X   = 320;
  const GRID_GAP_Y   = 180;

  // -- Layer accent colors (mirror Chronicle palette) --------------------
  const LAYER_COLOR = { 1: "#7c3aed", 2: "#2563eb", 3: "#16a34a" };

  function layerColor(layer) { return LAYER_COLOR[layer] ?? "#ca8a04"; }

  // -- Cubic bezier wire path between two SVG points --------------------
  function wirePath(x1, y1, x2, y2) {
    const dx = Math.abs(x2 - x1) * 0.55;
    return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
  }

  // ---------------------------------------------------------------------

  class BlueprintFeature {
    static MANIFEST = {
      // -- Identity ------------------------------------------
      id:              "Blueprint.feature",
      type:            "feature",
      layer:           1,
      runtime:         "Browser",
      version:         "5.0.0",
      operationalRole: "savant",

      // -- Dependencies --------------------------------------
      requires:  ["Panel.prim", "Toolbar.prim", "Toast.prim"],
      dataFiles: ["ui/data/schemas/blueprint-layout.schema.json"],

      // -- Lifecycle -----------------------------------------
      lifecycle: ["init", "mount", "update", "unmount", "destroy"],

      // -- Action Surface ------------------------------------
      actions: {
        commands: {
          refresh: {
            description: "Re-fetch the registry surface from Oracle and redraw all nodes.",
            input:  {},
            output: "void"
          },
          saveWiring: {
            description: "Dispatch the current connection map to the blueprint_save workflow.",
            input:  {},
            output: "void"
          },
          clearWiring: {
            description: "Remove all drawn connections from the canvas.",
            input:  {},
            output: "void"
          },
          setLayerFilter: {
            description: "Show only nodes belonging to the specified layer (1, 2, or 3). Pass null to show all.",
            input:  { layer: "number?" },
            output: "void"
          }
        },
        events: {
          "blueprint:connectionCreated": {
            payload: { fromModule: "string", fromEvent: "string", toModule: "string", toAccept: "string" }
          },
          "blueprint:connectionRemoved": {
            payload: { fromModule: "string", fromEvent: "string", toModule: "string", toAccept: "string" }
          },
          "blueprint:saved": {
            payload: { connectionCount: "number", schemaPath: "string" }
          }
        },
        accepts: {
          "registry:moduleRegistered":   { description: "Triggers a node graph refresh." },
          "registry:moduleDeregistered": { description: "Triggers a node graph refresh." }
        },
        slots: {
          toolbar: "Additional toolbar actions injected by the parent feature."
        }
      },

      // -- Backend Contract ----------------------------------
      backendDeps: [
        { action: "oracle_dump_surface", via: "engine_ipc", params: [] },
        { action: "blueprint_save",      via: "engine_ipc", params: ["connections", "schemaPath"] }
      ],

      docs: {
        description: "Phase 2 visual orchestrator. Renders all registry modules as draggable SVG nodes. Event ports (right side, purple) connect to Accept ports (left side, green). Completing a wire writes the association into the connection map. Save dispatches to blueprint_save workflow, which commits the wiring as a SDOA accepts/events schema JSON.",
        author: "ProtoAI Core Architecture Group",
        sdoa:   "5.0.0"
      }
    };

    // -- Private State ------------------------------------
    _container   = null;
    _root        = null;
    _svg         = null;
    _nodesG      = null;
    _wiresG      = null;
    _draftWireEl = null;

    _nodes       = new Map();   // moduleId -> { manifest, x, y, el, ports }
    _connections = [];          // [{ fromModule, fromEvent, toModule, toAccept }]
    _layerFilter = null;

    // Drag state
    _drag        = null;   // { type: "node"|"wire", ... }
    _svgOrigin   = null;   // DOMPoint for SVG coordinate mapping

    _busUnsub    = [];

    // -- Lifecycle ----------------------------------------

    async init(config) {
      window.EventBus?.on("registry:moduleRegistered",   () => this.refresh());
      window.EventBus?.on("registry:moduleDeregistered", () => this.refresh());
    }

    async mount(container) {
      this._container = container;
      this._buildDOM();
      await this.refresh();

      window.EventBus?.command?.("blueprint", "refresh",       ()         => this.refresh());
      window.EventBus?.command?.("blueprint", "saveWiring",    ()         => this.saveWiring());
      window.EventBus?.command?.("blueprint", "clearWiring",   ()         => this.clearWiring());
      window.EventBus?.command?.("blueprint", "setLayerFilter",({ layer}) => this.setLayerFilter(layer));
    }

    async update(newState) {
      if (newState.layerFilter !== undefined) this.setLayerFilter(newState.layerFilter);
    }

    async unmount() {
      this._unsubscribeEventBus();
      this._root?.remove();
      this._root = this._svg = this._nodesG = this._wiresG = null;
      this._nodes.clear();
      this._connections = [];
    }

    async destroy() { this._container = null; }

    // -- Public API ---------------------------------------

    async refresh() {
      let surface = [];
      try {
        const resp = await window.DataAdapter?.dispatch("oracle_dump_surface", {});
        surface = resp?.surface ?? resp?.data ?? [];
      } catch (_) { /* Oracle not wired yet -- canvas stays empty */ }

      // Group surface entries by moduleId to reconstruct per-module manifests
      const manifestMap = new Map();
      for (const entry of surface) {
        if (!manifestMap.has(entry.moduleId)) {
          manifestMap.set(entry.moduleId, {
            id: entry.moduleId,
            actions: { commands: {}, events: {}, accepts: {} }
          });
        }
        const m = manifestMap.get(entry.moduleId);
        if (entry.surfaceType === "command") m.actions.commands[entry.name] = entry.schema;
        if (entry.surfaceType === "emits")   m.actions.events[entry.name]   = entry.schema;
        if (entry.surfaceType === "accepts") m.actions.accepts[entry.name]  = entry.schema;
        // Carry through layer/runtime from schema metadata if present
        if (entry.schema?.layer)   m.layer   = entry.schema.layer;
        if (entry.schema?.runtime) m.runtime = entry.schema.runtime;
      }

      this._layoutNodes(manifestMap);
      this._renderAll();
    }

    saveWiring() {
      const schemaPath = "ui/data/schemas/blueprint-wiring.schema.json";
      window.DataAdapter?.dispatch("blueprint_save", {
        connections: this._connections,
        schemaPath
      }).then(() => {
        window.EventBus?.emit?.("blueprint:saved", {
          connectionCount: this._connections.length,
          schemaPath
        });
        this._toast("Wiring saved -> " + schemaPath, "success");
      }).catch(err => this._toast("Save failed: " + err.message, "error"));
    }

    clearWiring() {
      this._connections = [];
      this._renderWires();
      this._toast("Connections cleared.", "info");
    }

    setLayerFilter(layer) {
      this._layerFilter = layer ?? null;
      this._renderAll();
    }

    // -- Node Layout --------------------------------------

    _layoutNodes(manifestMap) {
      let col = 0, row = 0;
      this._nodes.clear();

      for (const [id, manifest] of manifestMap) {
        const eventCount  = Object.keys(manifest.actions?.events  ?? {}).length;
        const acceptCount = Object.keys(manifest.actions?.accepts ?? {}).length;
        const portRows    = Math.max(eventCount, acceptCount, 1);
        const height      = NODE_H_BASE + portRows * PORT_SPACING;

        const x = GRID_PAD_X + col * GRID_GAP_X;
        const y = GRID_PAD_Y + row * GRID_GAP_Y;

        this._nodes.set(id, { manifest, x, y, height, el: null, ports: {} });

        col++;
        if (col >= GRID_COLS) { col = 0; row++; }
      }
    }

    // -- Full Render --------------------------------------

    _renderAll() {
      this._nodesG.replaceChildren();
      this._wiresG.replaceChildren();

      // Resize SVG viewBox to fit all nodes
      let maxX = 800, maxY = 600;
      for (const n of this._nodes.values()) {
        maxX = Math.max(maxX, n.x + NODE_W + GRID_PAD_X);
        maxY = Math.max(maxY, n.y + n.height + GRID_PAD_Y);
      }
      this._svg.setAttribute("viewBox", `0 0 ${maxX} ${maxY}`);
      this._svg.setAttribute("width",   maxX);
      this._svg.setAttribute("height",  maxY);

      for (const [id, node] of this._nodes) {
        if (this._layerFilter != null && node.manifest.layer !== this._layerFilter) continue;
        this._renderNode(id, node);
      }

      this._renderWires();
    }

    // -- Node Rendering -----------------------------------

    _renderNode(id, node) {
      const m          = node.manifest;
      const color      = layerColor(m.layer);
      const events     = Object.keys(m.actions?.events  ?? {});
      const accepts    = Object.keys(m.actions?.accepts ?? {});
      const portRows   = Math.max(events.length, accepts.length, 1);
      const height     = NODE_H_BASE + portRows * PORT_SPACING;
      node.height      = height;
      node.ports       = {};

      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.setAttribute("class",     "sdoa-blueprint__node");
      g.setAttribute("transform", `translate(${node.x},${node.y})`);
      g.setAttribute("data-id",   id);

      // -- Background rect -----------
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("width",  NODE_W);
      rect.setAttribute("height", height);
      rect.setAttribute("rx",     "8");
      rect.setAttribute("class",  "sdoa-blueprint__node-bg");
      rect.setAttribute("style",  `--node-color: ${color}`);
      g.appendChild(rect);

      // -- Header bar ----------------
      const header = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      header.setAttribute("width",  NODE_W);
      header.setAttribute("height", "28");
      header.setAttribute("rx",     "8");
      header.setAttribute("class",  "sdoa-blueprint__node-header");
      header.setAttribute("style",  `fill: ${color}22; stroke: ${color}55`);
      g.appendChild(header);

      // -- Module ID text ------------
      const title = document.createElementNS("http://www.w3.org/2000/svg", "text");
      title.setAttribute("x",     "10");
      title.setAttribute("y",     "18");
      title.setAttribute("class", "sdoa-blueprint__node-title");
      title.textContent = id.length > 26 ? id.slice(0, 24) + "..." : id;
      g.appendChild(title);

      // -- Layer badge ---------------
      const badge = document.createElementNS("http://www.w3.org/2000/svg", "text");
      badge.setAttribute("x",     NODE_W - 8);
      badge.setAttribute("y",     "18");
      badge.setAttribute("class", "sdoa-blueprint__node-badge");
      badge.setAttribute("style", `fill: ${color}`);
      badge.textContent = m.runtime ? `L${m.layer ?? "?"} · ${m.runtime}` : `L${m.layer ?? "?"}`;
      g.appendChild(badge);

      // -- Port columns --------------
      const maxPorts = Math.max(events.length, accepts.length);
      for (let i = 0; i < maxPorts; i++) {
        const py = NODE_H_BASE - 12 + i * PORT_SPACING;

        // Accept port (left, green)
        if (i < accepts.length) {
          const name = accepts[i];
          const cx   = 0;
          const cy   = py;
          const port = this._makePort(cx, cy, "#16a34a", "accept", id, name);
          g.appendChild(port.el);
          node.ports[`accept:${name}`] = { cx: node.x + cx, cy: node.y + cy, type: "accept" };
        }

        // Event port (right, purple)
        if (i < events.length) {
          const name = events[i];
          const cx   = NODE_W;
          const cy   = py;
          const port = this._makePort(cx, cy, "#7c3aed", "event", id, name);
          g.appendChild(port.el);
          node.ports[`event:${name}`] = { cx: node.x + cx, cy: node.y + cy, type: "event" };

          // Port label
          const lbl = document.createElementNS("http://www.w3.org/2000/svg", "text");
          lbl.setAttribute("x",     NODE_W - 10);
          lbl.setAttribute("y",     cy + 4);
          lbl.setAttribute("class", "sdoa-blueprint__port-label sdoa-blueprint__port-label--right");
          lbl.textContent = name.length > 20 ? name.slice(0, 18) + "..." : name;
          g.appendChild(lbl);
        }

        // Accept label
        if (i < accepts.length) {
          const name = accepts[i];
          const cy   = py;
          const lbl  = document.createElementNS("http://www.w3.org/2000/svg", "text");
          lbl.setAttribute("x",     "10");
          lbl.setAttribute("y",     cy + 4);
          lbl.setAttribute("class", "sdoa-blueprint__port-label");
          lbl.textContent = name.length > 20 ? name.slice(0, 18) + "..." : name;
          g.appendChild(lbl);
        }
      }

      // -- Drag to move node ---------
      rect.addEventListener("mousedown",  e => this._startNodeDrag(e, id));
      header.addEventListener("mousedown", e => this._startNodeDrag(e, id));

      node.el = g;
      this._nodesG.appendChild(g);
    }

    _makePort(cx, cy, color, portType, moduleId, portName) {
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx",    cx);
      circle.setAttribute("cy",    cy);
      circle.setAttribute("r",     PORT_R);
      circle.setAttribute("class", `sdoa-blueprint__port sdoa-blueprint__port--${portType}`);
      circle.setAttribute("style", `fill: ${color}; stroke: ${color}88`);
      circle.setAttribute("data-module",   moduleId);
      circle.setAttribute("data-portname", portName);
      circle.setAttribute("data-porttype", portType);

      circle.addEventListener("mousedown", e => {
        e.stopPropagation();
        if (portType === "event") this._startWireDrag(e, moduleId, portName);
      });
      circle.addEventListener("mouseup", e => {
        e.stopPropagation();
        if (portType === "accept") this._completeWireDrop(moduleId, portName);
      });

      return { el: circle };
    }

    // -- Wire Rendering -----------------------------------

    _renderWires() {
      this._wiresG.replaceChildren();
      for (const conn of this._connections) {
        const fromNode = this._nodes.get(conn.fromModule);
        const toNode   = this._nodes.get(conn.toModule);
        if (!fromNode || !toNode) continue;

        const fromPort = fromNode.ports[`event:${conn.fromEvent}`];
        const toPort   = toNode.ports[`accept:${conn.toAccept}`];
        if (!fromPort || !toPort) continue;

        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d",     wirePath(fromPort.cx, fromPort.cy, toPort.cx, toPort.cy));
        path.setAttribute("class", "sdoa-blueprint__wire");

        // Double-click to remove
        path.addEventListener("dblclick", () => {
          this._connections = this._connections.filter(c => c !== conn);
          window.EventBus?.emit?.("blueprint:connectionRemoved", conn);
          this._renderWires();
        });

        this._wiresG.appendChild(path);
      }
    }

    // -- Drag: Node Move ----------------------------------

    _startNodeDrag(e, moduleId) {
      e.preventDefault();
      const pt = this._svgPoint(e);
      const n  = this._nodes.get(moduleId);
      this._drag = { type: "node", moduleId, startX: pt.x - n.x, startY: pt.y - n.y };
    }

    // -- Drag: Wire Draw ----------------------------------

    _startWireDrag(e, moduleId, eventName) {
      e.preventDefault();
      const node = this._nodes.get(moduleId);
      const port = node?.ports[`event:${eventName}`];
      if (!port) return;

      this._draftWireEl = document.createElementNS("http://www.w3.org/2000/svg", "path");
      this._draftWireEl.setAttribute("class", "sdoa-blueprint__wire sdoa-blueprint__wire--draft");
      this._wiresG.appendChild(this._draftWireEl);

      this._drag = { type: "wire", moduleId, eventName, ox: port.cx, oy: port.cy };
    }

    _completeWireDrop(toModule, toAccept) {
      if (!this._drag || this._drag.type !== "wire") return;
      const conn = {
        fromModule: this._drag.moduleId,
        fromEvent:  this._drag.eventName,
        toModule,
        toAccept
      };
      const exists = this._connections.some(
        c => c.fromModule === conn.fromModule && c.fromEvent === conn.fromEvent &&
             c.toModule   === conn.toModule   && c.toAccept  === conn.toAccept
      );
      if (!exists) {
        this._connections.push(conn);
        window.EventBus?.emit?.("blueprint:connectionCreated", conn);
      }
      this._drag = null;
      this._draftWireEl?.remove();
      this._draftWireEl = null;
      this._renderWires();
    }

    // -- Global Mouse Handlers ----------------------------

    _onMouseMove(e) {
      if (!this._drag) return;
      const pt = this._svgPoint(e);

      if (this._drag.type === "node") {
        const n = this._nodes.get(this._drag.moduleId);
        n.x = pt.x - this._drag.startX;
        n.y = pt.y - this._drag.startY;
        n.el.setAttribute("transform", `translate(${n.x},${n.y})`);
        // Update port positions
        for (const [key, port] of Object.entries(n.ports)) {
          const isEvent  = key.startsWith("event:");
          port.cx = n.x + (isEvent ? NODE_W : 0);
          // cy stays relative -- recalculate from node y
          port.cy = n.y + (port.cy - (n.y - (port.cy - n.y)));
        }
        // Recalculate ports properly
        this._recalcPorts(this._drag.moduleId);
        this._renderWires();
      }

      if (this._drag.type === "wire" && this._draftWireEl) {
        this._draftWireEl.setAttribute(
          "d", wirePath(this._drag.ox, this._drag.oy, pt.x, pt.y)
        );
      }
    }

    _onMouseUp() {
      if (this._drag?.type === "wire") {
        this._draftWireEl?.remove();
        this._draftWireEl = null;
      }
      this._drag = null;
    }

    _recalcPorts(moduleId) {
      const node    = this._nodes.get(moduleId);
      const m       = node.manifest;
      const events  = Object.keys(m.actions?.events  ?? {});
      const accepts = Object.keys(m.actions?.accepts ?? {});
      const maxP    = Math.max(events.length, accepts.length, 1);
      for (let i = 0; i < maxP; i++) {
        const py = node.y + NODE_H_BASE - 12 + i * PORT_SPACING;
        if (i < events.length) {
          node.ports[`event:${events[i]}`]   = { cx: node.x + NODE_W, cy: py, type: "event" };
        }
        if (i < accepts.length) {
          node.ports[`accept:${accepts[i]}`] = { cx: node.x,          cy: py, type: "accept" };
        }
      }
    }

    _svgPoint(e) {
      const pt = this._svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      return pt.matrixTransform(this._svg.getScreenCTM().inverse());
    }

    // -- DOM Construction ---------------------------------

    _buildDOM() {
      this._root = document.createElement("div");
      this._root.className = "sdoa-blueprint";

      // -- Toolbar -------------------------------------------
      const toolbar = document.createElement("div");
      toolbar.className = "sdoa-blueprint__toolbar";

      const title = document.createElement("span");
      title.className   = "sdoa-blueprint__title";
      title.textContent = "Blueprint -- Registry Orchestrator";

      const filterWrap = document.createElement("div");
      filterWrap.className = "sdoa-blueprint__layer-filters";
      [null, 1, 2, 3].forEach(l => {
        const btn = document.createElement("button");
        btn.className   = "sdoa-blueprint__filter-btn" + (this._layerFilter === l ? " sdoa-blueprint__filter-btn--active" : "");
        btn.textContent = l === null ? "All" : `L${l}`;
        btn.addEventListener("click", () => {
          toolbar.querySelectorAll(".sdoa-blueprint__filter-btn")
            .forEach(b => b.classList.remove("sdoa-blueprint__filter-btn--active"));
          btn.classList.add("sdoa-blueprint__filter-btn--active");
          this.setLayerFilter(l);
        });
        filterWrap.appendChild(btn);
      });

      const btnRefresh = this._toolbarBtn("Refresh",      () => this.refresh());
      const btnClear   = this._toolbarBtn("Clear Wiring", () => this.clearWiring());
      const btnSave    = this._toolbarBtn("Save Schema",  () => this.saveWiring(), "primary");

      const hint = document.createElement("span");
      hint.className   = "sdoa-blueprint__hint";
      hint.textContent = "Drag event ports to accept ports to wire modules. Double-click a wire to remove it.";

      toolbar.appendChild(title);
      toolbar.appendChild(filterWrap);
      toolbar.appendChild(btnRefresh);
      toolbar.appendChild(btnClear);
      toolbar.appendChild(btnSave);
      toolbar.appendChild(hint);

      // -- SVG Canvas ----------------------------------------
      const canvasWrap = document.createElement("div");
      canvasWrap.className = "sdoa-blueprint__canvas-wrap";

      this._svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      this._svg.setAttribute("class",       "sdoa-blueprint__canvas");
      this._svg.setAttribute("xmlns",       "http://www.w3.org/2000/svg");

      // Arrowhead marker
      const defs   = document.createElementNS("http://www.w3.org/2000/svg", "defs");
      const marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
      marker.setAttribute("id",          "sdoa-arrow");
      marker.setAttribute("viewBox",     "0 0 10 10");
      marker.setAttribute("refX",        "9");
      marker.setAttribute("refY",        "5");
      marker.setAttribute("markerWidth", "6");
      marker.setAttribute("markerHeight","6");
      marker.setAttribute("orient",      "auto-start-reverse");
      const arrowPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
      arrowPath.setAttribute("d",    "M 0 0 L 10 5 L 0 10 z");
      arrowPath.setAttribute("fill", "#7c3aed");
      marker.appendChild(arrowPath);
      defs.appendChild(marker);
      this._svg.appendChild(defs);

      // Grid pattern
      const gridPattern = document.createElementNS("http://www.w3.org/2000/svg", "pattern");
      gridPattern.setAttribute("id", "sdoa-grid"); gridPattern.setAttribute("width","32");
      gridPattern.setAttribute("height","32"); gridPattern.setAttribute("patternUnits","userSpaceOnUse");
      const gridPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
      gridPath.setAttribute("d", "M 32 0 L 0 0 0 32"); gridPath.setAttribute("fill","none");
      gridPath.setAttribute("stroke","rgba(255,255,255,0.04)"); gridPath.setAttribute("stroke-width","0.5");
      gridPattern.appendChild(gridPath); defs.appendChild(gridPattern);

      const gridRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      gridRect.setAttribute("width","100%"); gridRect.setAttribute("height","100%");
      gridRect.setAttribute("fill","url(#sdoa-grid)");
      this._svg.appendChild(gridRect);

      this._wiresG = document.createElementNS("http://www.w3.org/2000/svg", "g");
      this._wiresG.setAttribute("class", "sdoa-blueprint__wires");
      this._svg.appendChild(this._wiresG);

      this._nodesG = document.createElementNS("http://www.w3.org/2000/svg", "g");
      this._nodesG.setAttribute("class", "sdoa-blueprint__nodes");
      this._svg.appendChild(this._nodesG);

      // Global mouse handlers
      const onMove = e => this._onMouseMove(e);
      const onUp   = e => this._onMouseUp(e);
      this._svg.addEventListener("mousemove", onMove);
      this._svg.addEventListener("mouseup",   onUp);
      this._busUnsub.push(
        () => { this._svg?.removeEventListener("mousemove", onMove); },
        () => { this._svg?.removeEventListener("mouseup",   onUp);   }
      );

      canvasWrap.appendChild(this._svg);
      this._root.appendChild(toolbar);
      this._root.appendChild(canvasWrap);
      this._container.appendChild(this._root);
    }

    _toolbarBtn(label, onClick, variant = "default") {
      const btn = document.createElement("button");
      btn.className   = `sdoa-blueprint__btn sdoa-blueprint__btn--${variant}`;
      btn.textContent = label;
      btn.addEventListener("click", onClick);
      return btn;
    }

    _toast(msg, type = "info") {
      window.EventBus?.emit?.("toast:show", { message: msg, type, duration: 3000 });
    }

    _unsubscribeEventBus() {
      this._busUnsub.forEach(fn => fn());
      this._busUnsub = [];
    }
  }

  window.BlueprintFeature = BlueprintFeature;
})();
