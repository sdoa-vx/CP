// ============================================================
// BlueprintNodeRenderer.component.js — SDOA v5 Component | layer 1
// Updated: 2026-07-14
// Extracted from Blueprint.feature.js (Phase 5 — oversized-file split).
// Draws a single module as an SVG node (background, header, title,
// layer badge, event/accept ports + labels) and wires up the
// mousedown/mouseup handlers that start node-drags and wire-drags.
//
// This is a plain function module, not a class — Blueprint.feature.js
// (BlueprintFeature) is a class, but nothing here needs `this` or any
// persistent state of its own. It receives everything it needs
// (the SVG <g> to append into, the shared layout constants, and drag
// callbacks bound to BlueprintFeature's own methods) as an explicit
// `ctx` argument per call, rather than reaching back into
// BlueprintFeature's instance state.
// ============================================================

(function () {
    "use strict";

    const MANIFEST = {
        id: "BlueprintNodeRenderer.component", type: "component", layer: 1,
        runtime: "Browser", version: "1.0.0",
        docs: { description: "Renders a single Blueprint module as an SVG node — background/header/title/badge + event (right) and accept (left) ports with labels — and wires mousedown/mouseup to the drag callbacks passed in via ctx. Extracted from Blueprint.feature.js as part of the Phase 5 oversized-file split.", author: "ProtoAI Core Architecture Group" }
    };

    /**
     * renderNode(id, node, ctx)
     *   node: { manifest, x, y, height, el, ports } — mutated in place
     *         (height, ports, el are (re)computed here).
     *   ctx: {
     *     nodesG:          SVG <g> to append the node into,
     *     layout:          { NODE_W, NODE_H_BASE, PORT_SPACING, PORT_R },
     *     layerColor:      (layer) => cssColor,
     *     onNodeMouseDown: (e, moduleId) => void,
     *     onPortMouseDown: (e, moduleId, portName) => void,   // event ports only
     *     onPortMouseUp:   (moduleId, portName) => void       // accept ports only
     *   }
     */
    function renderNode(id, node, ctx) {
        const { nodesG, layout, layerColor, onNodeMouseDown, onPortMouseDown, onPortMouseUp } = ctx;
        const { NODE_W, NODE_H_BASE, PORT_SPACING } = layout;

        const m        = node.manifest;
        const color    = layerColor(m.layer);
        const events   = Object.keys(m.actions?.events  ?? {});
        const accepts  = Object.keys(m.actions?.accepts ?? {});
        const portRows = Math.max(events.length, accepts.length, 1);
        const height   = NODE_H_BASE + portRows * PORT_SPACING;
        node.height    = height;
        node.ports     = {};

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
                const port = _makePort(cx, cy, "#16a34a", "accept", id, name, layout, onPortMouseDown, onPortMouseUp);
                g.appendChild(port.el);
                node.ports[`accept:${name}`] = { cx: node.x + cx, cy: node.y + cy, type: "accept" };
            }

            // Event port (right, purple)
            if (i < events.length) {
                const name = events[i];
                const cx   = NODE_W;
                const cy   = py;
                const port = _makePort(cx, cy, "#7c3aed", "event", id, name, layout, onPortMouseDown, onPortMouseUp);
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
        rect.addEventListener("mousedown",   e => onNodeMouseDown(e, id));
        header.addEventListener("mousedown", e => onNodeMouseDown(e, id));

        node.el = g;
        nodesG.appendChild(g);
    }

    function _makePort(cx, cy, color, portType, moduleId, portName, layout, onPortMouseDown, onPortMouseUp) {
        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.setAttribute("cx",    cx);
        circle.setAttribute("cy",    cy);
        circle.setAttribute("r",     layout.PORT_R);
        circle.setAttribute("class", `sdoa-blueprint__port sdoa-blueprint__port--${portType}`);
        circle.setAttribute("style", `fill: ${color}; stroke: ${color}88`);
        circle.setAttribute("data-module",   moduleId);
        circle.setAttribute("data-portname", portName);
        circle.setAttribute("data-porttype", portType);

        circle.addEventListener("mousedown", e => {
            e.stopPropagation();
            if (portType === "event") onPortMouseDown(e, moduleId, portName);
        });
        circle.addEventListener("mouseup", e => {
            e.stopPropagation();
            if (portType === "accept") onPortMouseUp(moduleId, portName);
        });

        return { el: circle };
    }

    // ── Exports ───────────────────────────────────────────────

    const component = { MANIFEST, renderNode };
    window.BlueprintNodeRenderer = component;
    if (window.ModuleLoader) window.ModuleLoader.register(MANIFEST, component);

})();
