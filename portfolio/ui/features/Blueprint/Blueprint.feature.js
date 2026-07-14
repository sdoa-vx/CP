// Last modified: 2026-07-14
// Blueprint.feature.js — SDOA v5.1 Feature (Browser)
// Validated by: ProbationOfficer.workflow.rs
//
// Change log:
//   5.1.0 — Phase 5 (oversized-file split). Extracted two self-contained
//           pieces into sibling components:
//             BlueprintNodeRenderer.component.js — draws a single SVG
//               node (was _renderNode/_makePort).
//             BlueprintDomBuilder.component.js   — builds the toolbar +
//               SVG canvas shell (was _buildDOM/_toolbarBtn).
//           Both are plain function modules (no `this`) that receive
//           layout constants and drag/toolbar callbacks explicitly via
//           an options object, rather than reaching into
//           BlueprintFeature's instance state. Wire/drag interaction
//           (_renderWires, _startNodeDrag, _startWireDrag,
//           _completeWireDrop, _onMouseMove, _onMouseUp, _recalcPorts)
//           stayed here — it mutates this._nodes / this._connections /
//           this._drag so tightly and interdependently that splitting
//           it out would have meant threading nearly all of
//           BlueprintFeature's state through another file for little
//           benefit. File was 657 lines (flagged non-sdoa-compliant
//           purely for size); now under the Layer 1 cap and fully
//           manifest-compliant.
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
      version:         "5.1.0",
      operationalRole: "savant",

      // -- Dependencies --------------------------------------
      requires:  ["Panel.prim", "Toolbar.prim", "Toast.prim", "BlueprintNodeRenderer.component", "BlueprintDomBuilder.component"],
      dependencies: ["BlueprintNodeRenderer.component", "BlueprintDomBuilder.component"],
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
        description: "Phase 2 visual orchestrator. Renders all registry modules as draggable SVG nodes. Event ports (right side, purple) connect to Accept ports (left side, green). Completing a wire writes the association into the connection map. Save dispatches to blueprint_save workflow, which commits the wiring as a SDOA accepts/events schema JSON. Node drawing and the toolbar/canvas DOM shell are delegated to BlueprintNodeRenderer.component and BlueprintDomBuilder.component.",
        author: "ProtoAI Core Architecture Group",
        sdoa:   "5.1.0"
      },
      last_modified: "2026-07-14T00:00:00Z"
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

      const nodeCtx = {
        nodesG:          this._nodesG,
        layout:          { NODE_W, NODE_H_BASE, PORT_SPACING, PORT_R },
        layerColor,
        onNodeMouseDown: (e, moduleId)              => this._startNodeDrag(e, moduleId),
        onPortMouseDown: (e, moduleId, portName)    => this._startWireDrag(e, moduleId, portName),
        onPortMouseUp:   (moduleId, portName)       => this._completeWireDrop(moduleId, portName)
      };

      for (const [id, node] of this._nodes) {
        if (this._layerFilter != null && node.manifest.layer !== this._layerFilter) continue;
        window.BlueprintNodeRenderer.renderNode(id, node, nodeCtx);
      }

      this._renderWires();
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
      const { root, svg, wiresG, nodesG, unsubFns } = window.BlueprintDomBuilder.build(this._container, {
        layerFilter:      this._layerFilter,
        onRefresh:        () => this.refresh(),
        onClearWiring:    () => this.clearWiring(),
        onSaveWiring:     () => this.saveWiring(),
        onSetLayerFilter: (l) => this.setLayerFilter(l),
        onMouseMove:      (e) => this._onMouseMove(e),
        onMouseUp:        (e) => this._onMouseUp(e)
      });
      this._root   = root;
      this._svg    = svg;
      this._wiresG = wiresG;
      this._nodesG = nodesG;
      this._busUnsub.push(...unsubFns);
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
