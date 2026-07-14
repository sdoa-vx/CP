// ============================================================
// BlueprintDomBuilder.component.js — SDOA v5 Component | layer 1
// Updated: 2026-07-14
// Extracted from Blueprint.feature.js (Phase 5 — oversized-file split).
// Builds the static DOM shell (toolbar + layer filter buttons + hint
// text + the SVG canvas with its defs/grid/wires-group/nodes-group)
// and wires the toolbar buttons to the callbacks passed in.
//
// Plain function module (build() is a pure DOM factory — no `this`,
// no persistent state) — same rationale as BlueprintNodeRenderer.
// Blueprint.feature.js calls build() once from its own _buildDOM() and
// assigns the returned refs onto its own instance fields (this._root,
// this._svg, etc.), and pushes the returned unsubscribe functions onto
// its own this._busUnsub array.
// ============================================================

(function () {
    "use strict";

    const MANIFEST = {
        id: "BlueprintDomBuilder.component", type: "component", layer: 1,
        runtime: "Browser", version: "1.0.0",
        docs: { description: "Builds Blueprint.feature.js's static DOM shell — toolbar (title, layer filters, Refresh/Clear/Save buttons, hint) and the SVG canvas (arrowhead marker, grid pattern, wires group, nodes group) — and wires global mousemove/mouseup handlers. Pure factory function returning the built refs; Blueprint.feature.js owns the returned elements. Extracted from Blueprint.feature.js as part of the Phase 5 oversized-file split.", author: "ProtoAI Core Architecture Group" }
    };

    /**
     * build(container, opts) → { root, svg, wiresG, nodesG, unsubFns[] }
     *   opts: {
     *     layerFilter:      current layer filter (null | 1 | 2 | 3),
     *     onRefresh, onClearWiring, onSaveWiring: () => void,
     *     onSetLayerFilter: (layer|null) => void,
     *     onMouseMove, onMouseUp: (e) => void
     *   }
     */
    function build(container, opts) {
        const {
            layerFilter, onRefresh, onClearWiring, onSaveWiring,
            onSetLayerFilter, onMouseMove, onMouseUp
        } = opts;

        const root = document.createElement("div");
        root.className = "sdoa-blueprint";

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
            btn.className   = "sdoa-blueprint__filter-btn" + (layerFilter === l ? " sdoa-blueprint__filter-btn--active" : "");
            btn.textContent = l === null ? "All" : `L${l}`;
            btn.addEventListener("click", () => {
                toolbar.querySelectorAll(".sdoa-blueprint__filter-btn")
                    .forEach(b => b.classList.remove("sdoa-blueprint__filter-btn--active"));
                btn.classList.add("sdoa-blueprint__filter-btn--active");
                onSetLayerFilter(l);
            });
            filterWrap.appendChild(btn);
        });

        const btnRefresh = _toolbarBtn("Refresh",      () => onRefresh());
        const btnClear   = _toolbarBtn("Clear Wiring", () => onClearWiring());
        const btnSave    = _toolbarBtn("Save Schema",  () => onSaveWiring(), "primary");

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

        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("class", "sdoa-blueprint__canvas");
        svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");

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
        svg.appendChild(defs);

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
        svg.appendChild(gridRect);

        const wiresG = document.createElementNS("http://www.w3.org/2000/svg", "g");
        wiresG.setAttribute("class", "sdoa-blueprint__wires");
        svg.appendChild(wiresG);

        const nodesG = document.createElementNS("http://www.w3.org/2000/svg", "g");
        nodesG.setAttribute("class", "sdoa-blueprint__nodes");
        svg.appendChild(nodesG);

        // Global mouse handlers
        svg.addEventListener("mousemove", onMouseMove);
        svg.addEventListener("mouseup",   onMouseUp);
        const unsubFns = [
            () => svg.removeEventListener("mousemove", onMouseMove),
            () => svg.removeEventListener("mouseup",   onMouseUp)
        ];

        canvasWrap.appendChild(svg);
        root.appendChild(toolbar);
        root.appendChild(canvasWrap);
        container.appendChild(root);

        return { root, svg, wiresG, nodesG, unsubFns };
    }

    function _toolbarBtn(label, onClick, variant = "default") {
        const btn = document.createElement("button");
        btn.className   = `sdoa-blueprint__btn sdoa-blueprint__btn--${variant}`;
        btn.textContent = label;
        btn.addEventListener("click", onClick);
        return btn;
    }

    // ── Exports ───────────────────────────────────────────────

    const component = { MANIFEST, build };
    window.BlueprintDomBuilder = component;
    if (window.ModuleLoader) window.ModuleLoader.register(MANIFEST, component);

})();
