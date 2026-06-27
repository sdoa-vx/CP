// ──────────────────────────────────────────────────────────────────
// File:    Cartographer.workflow.js
// Version: 5.2.0
// Updated: 2026-06-27T00:00:00Z
// Changes: Phase 5 Track B — boundary drift detection.
//          New command: boundaryDrift() compares each sleeve's
//          external.commands against observed Chronicle telemetry.
//          Emits cartographer:boundaryDrift with severity-rated report.
//          _buildGraph() now adds "ghost" external-system nodes for
//          every sleeve module and draws "boundary" edges between
//          them. SVG renderer colours sleeve nodes amber and ghost
//          nodes as dashed rectangles labelled with the external system.
//          stats now includes sleeveCount.
// ──────────────────────────────────────────────────────────────────
// Cartographer.workflow.js — SDOA v5.0 Workflow (NodeJS)
// Validated by: ProbationOfficer.workflow.rs
//
// Change log:
//   5.0.0 — Initial implementation. System topology mapper.
//            Blueprint is for wiring; Cartographer is for understanding.
//            Reads all manifests from Oracle, builds a full dependency +
//            event-connection graph as structured JSON, and renders it
//            as a self-contained SVG you can open in any browser.
//
//            Three output formats:
//              graph   — structured JSON (nodes + edges + metadata)
//              svg     — standalone SVG file, openable without a server
//              both    — graph JSON written to disk, SVG returned

"use strict";

const fs   = require("fs");
const path = require("path");
const ResponseFormatter = require("../services/ResponseFormatter.service");

class CartographerWorkflow {
  static MANIFEST = {
    // ── Identity ──────────────────────────────
    id:              "Cartographer.workflow",
    type:            "workflow",
    layer:           3,
    runtime:         "NodeJS",
    version:         "5.2.0",
    operationalRole: "savant",

    // ── Dependencies ──────────────────────────
    requires:  ["Oracle.service", "Chronicle.service", "ResponseFormatter.service"],
    dataFiles: [],

    // ── Lifecycle ─────────────────────────────
    lifecycle: ["init", "run", "dispose"],

    // ── Action Surface ────────────────────────
    actions: {
      commands: {
        run: {
          description: "Build the full system topology graph and render it. Returns graph JSON and/or SVG.",
          input: {
            format:       "string?",   // "graph" | "svg" | "both" (default: "both")
            outputPath:   "string?",   // Write SVG to disk at this path
            layerFilter:  "number?",   // Only include modules from this layer
            groupBy:      "string?",   // "layer" | "runtime" | "type" (default: "layer")
            showOrphans:  "boolean?",  // Include modules with no edges (default: true)
            title:        "string?"    // Graph title in SVG header
          },
          output: "object"   // { graph, svg, writtenTo }
        },
        buildGraph: {
          description: "Build only the structured graph JSON — no rendering.",
          input: { layerFilter: "number?", showOrphans: "boolean?" },
          output: "object"   // GraphData
        },
        renderSvg: {
          description: "Render a previously built graph to SVG.",
          input: { graph: "object", title: "string?", groupBy: "string?" },
          output: "string"   // SVG markup
        },
        diff: {
          description: "Compare two graph snapshots and return added/removed nodes and edges.",
          input: { before: "object", after: "object" },
          output: "object"   // { addedNodes, removedNodes, addedEdges, removedEdges }
        },
        // Phase 5 Track B
        boundaryDrift: {
          description: "Compare each sleeve's declared external.commands against observed Chronicle telemetry. Returns a severity-rated boundaryDriftReport.",
          input: { since: "string?" },   // ISO timestamp lower-bound for telemetry window
          output: "object"               // { driftItems[], summary }
        }
      },
      events: {
        "cartographer:graphBuilt": {
          payload: { nodeCount: "number", edgeCount: "number", snapshotId: "string" }
        },
        "cartographer:svgRendered": {
          payload: { nodeCount: "number", writtenTo: "string?" }
        },
        "cartographer:boundaryDrift": {
          payload: { driftCount: "number", severity: "string", systems: "string[]" }
        }
      },
      accepts: {},
      slots:   {}
    },

    docs: {
      description: "System topology mapper. Reads all registered module manifests from Oracle and builds a full dependency + event-connection graph. Outputs structured JSON (for programmatic use) and/or a self-contained SVG (for humans). Blueprint is for wiring new connections; Cartographer is for understanding what already exists.",
      author: "ProtoAI Core Architecture Group",
      sdoa:   "5.0.0"
    }
  };

  _oracle    = null;
  _chronicle = null;
  _registry  = null;
  _snapSeq   = 0;

  async init(registry) {
    this._registry  = registry;
    this._oracle    = registry.get("Oracle.service");
    this._chronicle = registry.get("Chronicle.service");
  }

  async run(payload) {
    const {
      format      = "both",
      outputPath  = null,
      layerFilter = null,
      groupBy     = "layer",
      showOrphans = true,
      title       = "SDOAvX System Topology"
    } = payload ?? {};

    const graph = this._buildGraph({ layerFilter, showOrphans });
    let   svg   = null;
    let   writtenTo = null;

    this._emit("cartographer:graphBuilt", {
      nodeCount:  graph.nodes.length,
      edgeCount:  graph.edges.length,
      snapshotId: graph.snapshotId
    });

    if (format === "svg" || format === "both") {
      svg = this._renderSvg(graph, { title, groupBy });
    }

    if (outputPath && svg) {
      try {
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, svg, "utf8");
        writtenTo = outputPath;
        this._emit("cartographer:svgRendered", { nodeCount: graph.nodes.length, writtenTo });
      } catch (err) {
        writtenTo = `ERROR: ${err.message}`;
      }
    } else if (svg) {
      this._emit("cartographer:svgRendered", { nodeCount: graph.nodes.length, writtenTo: null });
    }

    this._chronicle?.record({
      type:    "cartographer:graphBuilt",
      source:  "Cartographer.workflow",
      payload: { nodeCount: graph.nodes.length, edgeCount: graph.edges.length }
    });

    return ResponseFormatter.ok({
      graph:     format !== "svg"   ? graph : null,
      svg:       format !== "graph" ? svg   : null,
      writtenTo
    });
  }

  async buildGraph({ layerFilter, showOrphans = true } = {}) {
    return ResponseFormatter.ok({ graph: this._buildGraph({ layerFilter, showOrphans }) });
  }

  async renderSvg({ graph, title = "SDOA Topology", groupBy = "layer" } = {}) {
    return ResponseFormatter.ok({ svg: this._renderSvg(graph, { title, groupBy }) });
  }

  diff({ before, after } = {}) {
    const beforeIds = new Set(before.nodes.map(n => n.id));
    const afterIds  = new Set(after.nodes.map(n => n.id));

    const edgeKey   = e => `${e.from}→${e.to}::${e.type}`;
    const beforeEdges = new Set(before.edges.map(edgeKey));
    const afterEdges  = new Set(after.edges.map(edgeKey));

    return ResponseFormatter.ok({
      addedNodes:   after.nodes.filter(n => !beforeIds.has(n.id)),
      removedNodes: before.nodes.filter(n => !afterIds.has(n.id)),
      addedEdges:   after.edges.filter(e => !beforeEdges.has(edgeKey(e))),
      removedEdges: before.edges.filter(e => !afterEdges.has(edgeKey(e)))
    });
  }

  // ── Phase 5 Track B: Boundary drift detection ─────────────────

  boundaryDrift({ since } = {}) {
    const report  = this._detectBoundaryDrift(since);
    const maxSev  = report.some(r => r.severity === "critical") ? "critical"
                  : report.some(r => r.severity === "high")     ? "high"
                  : report.some(r => r.severity === "medium")   ? "medium"
                  : report.length ? "low" : "none";

    this._emit("cartographer:boundaryDrift", {
      driftCount: report.length,
      severity:   maxSev,
      systems:    [...new Set(report.map(r => r.system))]
    });

    this._chronicle?.record?.({
      type:    "cartographer:boundaryDrift",
      source:  "Cartographer.workflow",
      payload: { driftCount: report.length, severity: maxSev }
    });

    return ResponseFormatter.ok({
      driftItems: report,
      summary: {
        total:    report.length,
        critical: report.filter(r => r.severity === "critical").length,
        high:     report.filter(r => r.severity === "high").length,
        medium:   report.filter(r => r.severity === "medium").length,
        low:      report.filter(r => r.severity === "low").length,
        overallSeverity: maxSev
      }
    });
  }

  _detectBoundaryDrift(since) {
    const surface  = this._oracle?.dumpSurface({}) ?? [];
    const sleeves  = [...new Set(
      surface.filter(e => e.surfaceType === "boundary").map(e => e.moduleId)
    )];

    // Pull observed commands from Chronicle (if available)
    const telemetry = this._getChronicleCommands(since);

    const driftItems = [];

    for (const moduleId of sleeves) {
      const profile = this._oracle?.describeModule({ moduleId });
      if (!profile) continue;

      const declared  = new Set(profile.externalCommands ?? []);
      const observed  = new Set((telemetry[moduleId] ?? []).map(e => e.command));

      const missing   = [...observed].filter(c => !declared.has(c));  // invoked but undeclared
      const stale     = [...declared].filter(c => !observed.has(c));  // declared but never invoked

      const pathMismatch = this._detectPathMismatch(moduleId, profile, telemetry);

      if (!missing.length && !stale.length && !pathMismatch) continue;

      const severity = missing.length      ? "critical"    // undeclared commands = sovereignty breach
                     : pathMismatch        ? "high"        // path drift
                     : stale.length >= 3   ? "medium"      // 3+ declared but never used
                     :                       "low";

      driftItems.push({
        moduleId,
        system:          profile.externalSystem   ?? "unknown",
        transport:       profile.externalTransport ?? "unknown",
        severity,
        missingCommands: missing,   // in observed telemetry but NOT in external.commands → critical
        extraCommands:   stale,     // in external.commands but never observed → stale
        pathMismatch
      });
    }

    return driftItems;
  }

  _getChronicleCommands(since) {
    if (!this._chronicle?.query) return {};
    try {
      const entries = this._chronicle.query({
        type:  "sleeve:boundaryCall",
        since: since ?? null
      }) ?? [];

      const map = {};
      for (const entry of entries) {
        const id = entry.payload?.moduleId;
        if (!id) continue;
        if (!map[id]) map[id] = [];
        map[id].push({ command: entry.payload?.command, ok: entry.payload?.ok });
      }
      return map;
    } catch (_) { return {}; }
  }

  _detectPathMismatch(moduleId, profile, telemetry) {
    // Look for boundary fault events that mention a path/endpoint mismatch
    const calls = telemetry[moduleId] ?? [];
    const faults = calls.filter(c => !c.ok);
    // Heuristic: if >50% of calls fail, flag potential path mismatch
    if (calls.length >= 5 && (faults.length / calls.length) > 0.5) {
      return `High failure rate (${faults.length}/${calls.length}) — possible path or endpoint mismatch`;
    }
    return null;
  }

  async dispose() {
    this._oracle    = null;
    this._chronicle = null;
  }

  // ── Graph Builder ──────────────────────────────────────────────

  _buildGraph({ layerFilter, showOrphans }) {
    const surface    = this._oracle?.dumpSurface({}) ?? [];
    const nodesMap   = new Map();  // moduleId → Node
    const edges      = [];

    // Build node set
    for (const entry of surface) {
      if (layerFilter != null && entry.schema?.layer !== layerFilter) continue;
      if (!nodesMap.has(entry.moduleId)) {
        const desc = this._oracle?.describeModule({ moduleId: entry.moduleId });
        nodesMap.set(entry.moduleId, {
          id:              entry.moduleId,
          type:            desc?.type            ?? "unknown",
          layer:           desc?.manifest?.layer ?? entry.schema?.layer ?? null,
          runtime:         desc?.runtime         ?? entry.schema?.runtime ?? null,
          operationalRole: desc?.manifest?.operationalRole ?? null,
          commands:        desc?.commands        ?? [],
          emittedEvents:   desc?.emittedEvents   ?? [],
          acceptedEvents:  desc?.acceptedEvents  ?? [],
          requires:        desc?.manifest?.requires ?? []
        });
      }
    }

    // Build edges
    for (const [fromId, node] of nodesMap) {
      // Dependency edges (requires[])
      for (const dep of node.requires) {
        if (nodesMap.has(dep)) {
          edges.push({ from: fromId, to: dep, type: "requires", label: "requires" });
        }
      }

      // Event-connection edges (emits → accepts)
      for (const eventName of node.emittedEvents) {
        for (const [toId, toNode] of nodesMap) {
          if (toId === fromId) continue;
          if (toNode.acceptedEvents.includes(eventName)) {
            edges.push({ from: fromId, to: toId, type: "event", label: eventName });
          }
        }
      }
    }

    // v5.4: Add ghost external-system nodes for every sleeve module
    const ghostNodes = new Map();  // externalSystem label → ghost node
    for (const [fromId, node] of nodesMap) {
      const desc = this._oracle?.describeModule({ moduleId: fromId });
      if (!desc || node.type !== "sleeve" || !desc.externalSystem) continue;

      const ghostId = `__ext__${desc.externalSystem}`;
      if (!ghostNodes.has(ghostId)) {
        ghostNodes.set(ghostId, {
          id:              ghostId,
          type:            "external",   // Not an SDOA type — ghost marker only
          layer:           null,
          runtime:         "External",
          operationalRole: null,
          commands:        desc.externalCommands ?? [],
          emittedEvents:   [],
          acceptedEvents:  [],
          requires:        [],
          label:           desc.externalSystem,
          transport:       desc.externalTransport
        });
      }

      edges.push({
        from:  fromId,
        to:    ghostId,
        type:  "boundary",
        label: `${desc.externalTransport} → ${desc.externalSystem}`
      });
    }

    // Merge ghost nodes into map
    for (const [id, ghost] of ghostNodes) nodesMap.set(id, ghost);

    // Filter orphans
    const connectedIds = new Set(edges.flatMap(e => [e.from, e.to]));
    const nodes = [...nodesMap.values()]
      .filter(n => showOrphans || connectedIds.has(n.id));

    return {
      snapshotId: `map-${++this._snapSeq}-${Date.now()}`,
      builtAt:    new Date().toISOString(),
      nodes,
      edges,
      stats: {
        totalModules:  nodes.filter(n => n.type !== "external").length,
        ghostNodes:    ghostNodes.size,
        sleeveCount:   nodes.filter(n => n.type === "sleeve").length,
        totalEdges:    edges.length,
        byLayer:       this._countBy(nodes.filter(n => n.type !== "external"), "layer"),
        byRuntime:     this._countBy(nodes, "runtime"),
        byType:        this._countBy(nodes, "type"),
        orphanCount:   nodes.filter(n => !connectedIds.has(n.id) && n.type !== "external").length
      }
    };
  }

  _countBy(arr, key) {
    return arr.reduce((acc, item) => {
      const val = String(item[key] ?? "unknown");
      acc[val]  = (acc[val] ?? 0) + 1;
      return acc;
    }, {});
  }

  // ── SVG Renderer ───────────────────────────────────────────────

  _renderSvg(graph, { title, groupBy }) {
    const LAYER_COLOR  = { 1: "#7c3aed", 2: "#2563eb", 3: "#16a34a", null: "#ca8a04" };
    const RUNTIME_COLOR = {
      Browser: "#2563eb", NodeJS: "#16a34a", Universal: "#7c3aed",
      Rust: "#ea580c", Python: "#ca8a04", "C++": "#64748b",
      External: "#f59e0b"   // v5.4: ghost external-system nodes
    };
    const TYPE_SHAPE = {
      primitive: "⬡", feature: "◈", adapter: "⬢", service: "◉",
      workflow: "◆", repository: "▣", engine: "◉",
      sleeve: "⟁",   // v5.4: boundary sleeve nodes
      external: "⬚"  // v5.4: ghost external-system nodes
    };

    const nodeColor = (n) => groupBy === "runtime"
      ? (RUNTIME_COLOR[n.runtime] ?? "#64748b")
      : (LAYER_COLOR[n.layer] ?? "#64748b");

    // Layout — group by chosen dimension in columns
    const groups = new Map();
    for (const node of graph.nodes) {
      const key = groupBy === "runtime" ? (node.runtime ?? "Unknown")
                : groupBy === "type"   ? node.type
                : `Layer ${node.layer ?? "?"}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(node);
    }

    const COL_W    = 260;
    const NODE_H   = 54;
    const NODE_PAD = 16;
    const MARGIN   = 60;
    const COL_GAP  = 80;

    // Calculate positions
    const positions = new Map();
    let colIdx = 0;
    for (const [, members] of groups) {
      members.forEach((node, rowIdx) => {
        positions.set(node.id, {
          x: MARGIN + colIdx * (COL_W + COL_GAP),
          y: MARGIN + 60 + rowIdx * (NODE_H + NODE_PAD)
        });
      });
      colIdx++;
    }

    const svgW = MARGIN * 2 + groups.size * (COL_W + COL_GAP);
    const svgH = MARGIN * 2 + 60 + Math.max(...[...groups.values()].map(g => g.length)) * (NODE_H + NODE_PAD);

    // Build SVG parts
    const defs = `
  <defs>
    <marker id="arrow-req" viewBox="0 0 10 10" refX="9" refY="5"
      markerWidth="6" markerHeight="6" orient="auto">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(255,255,255,0.2)"/>
    </marker>
    <marker id="arrow-evt" viewBox="0 0 10 10" refX="9" refY="5"
      markerWidth="6" markerHeight="6" orient="auto">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#7c3aed"/>
    </marker>
    <filter id="glow">
      <feGaussianBlur stdDeviation="2" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>`;

    // Edges
    const edgeLines = graph.edges.map(edge => {
      const from = positions.get(edge.from);
      const to   = positions.get(edge.to);
      if (!from || !to) return "";
      const isReq      = edge.type === "requires";
      const isBoundary = edge.type === "boundary";
      const x1 = from.x + COL_W;
      const y1 = from.y + NODE_H / 2;
      const x2 = to.x;
      const y2 = to.y + NODE_H / 2;
      const dx = Math.abs(x2 - x1) * 0.5;
      // v5.4: boundary edges are amber+dashed
      const stroke = isBoundary ? "#f59e0b" : isReq ? "rgba(255,255,255,0.12)" : "#7c3aed";
      const dash   = (isReq || isBoundary) ? 'stroke-dasharray="5,4"' : '';
      const marker = isBoundary ? "url(#arrow-req)" : isReq ? "url(#arrow-req)" : "url(#arrow-evt)";
      return `<path d="M ${x1} ${y1} C ${x1+dx} ${y1}, ${x2-dx} ${y2}, ${x2} ${y2}"
        fill="none" stroke="${stroke}" stroke-width="1.5" ${dash}
        marker-end="${marker}" opacity="0.7"/>`;
    }).join("\n  ");

    // Group headers
    const groupHeaders = [...groups.entries()].map(([label], idx) => {
      const x = MARGIN + idx * (COL_W + COL_GAP) + COL_W / 2;
      return `<text x="${x}" y="${MARGIN + 36}" text-anchor="middle"
        font-family="'JetBrains Mono', monospace" font-size="11"
        fill="rgba(255,255,255,0.3)" letter-spacing="0.08em">${this._esc(label.toUpperCase())}</text>`;
    }).join("\n  ");

    // Nodes
    const nodeRects = graph.nodes.map(node => {
      const pos   = positions.get(node.id);
      if (!pos) return "";
      const color  = nodeColor(node);
      const shape  = TYPE_SHAPE[node.type] ?? "●";
      const label  = node.label ?? node.id;
      const idShort = label.length > 26 ? label.slice(0, 24) + "…" : label;
      const meta   = [node.runtime, node.type].filter(Boolean).join(" · ");

      // v5.4: Ghost external-system nodes get dashed outline
      const isGhost   = node.type === "external";
      const isSleeve  = node.type === "sleeve";
      const fillColor = isGhost  ? "#1a1208" : "#1a1a2e";
      const dashAttr  = isGhost  ? 'stroke-dasharray="6,3"' : '';
      const topBar    = isSleeve ? `<rect width="${COL_W}" height="3" rx="2" fill="${color}" opacity="0.8"/>` : "";
      const transport = isGhost && node.transport ? `<text x="10" y="50" font-family="'JetBrains Mono', monospace" font-size="9" fill="${color}" opacity="0.5">via ${this._esc(node.transport)}</text>` : "";
      const cmdBadge  = !isGhost ? `<text x="${COL_W - 8}" y="22" text-anchor="end" font-family="'JetBrains Mono', monospace" font-size="10" fill="rgba(255,255,255,0.2)">${node.commands.length}cmd ${node.emittedEvents.length}evt</text>` : "";

      return `
  <g transform="translate(${pos.x}, ${pos.y})" class="carto-node">
    <rect width="${COL_W}" height="${NODE_H}" rx="8"
      fill="${fillColor}" stroke="${color}${isGhost ? "88" : "44"}" stroke-width="${isGhost ? "1.5" : "1"}" ${dashAttr}/>
    ${topBar}
    <text x="10" y="22" font-family="'JetBrains Mono', monospace"
      font-size="12" fill="${isGhost ? color : "#e0e0e0"}">${shape} ${this._esc(idShort)}</text>
    <text x="10" y="38" font-family="'JetBrains Mono', monospace"
      font-size="10" fill="${color}" opacity="0.7">${this._esc(meta)}</text>
    ${transport}
    ${cmdBadge}
  </g>`;
    }).join("");

    // Legend
    const legendItems = groupBy === "runtime"
      ? Object.entries(RUNTIME_COLOR)
      : [[`Layer 1 — Features`, "#7c3aed"], [`Layer 2 — Primitives`, "#2563eb"], [`Layer 3 — Backend`, "#16a34a"]];

    const legend = legendItems.map(([label, color], i) =>
      `<g transform="translate(${MARGIN + i * 200}, ${svgH - 28})">
        <rect width="12" height="12" rx="2" fill="${color}" opacity="0.7"/>
        <text x="18" y="10" font-family="'JetBrains Mono', monospace" font-size="10"
          fill="rgba(255,255,255,0.4)">${this._esc(label)}</text>
      </g>`
    ).join("\n  ");

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg viewBox="0 0 ${svgW} ${svgH}" xmlns="http://www.w3.org/2000/svg"
  width="${svgW}" height="${svgH}" style="background:#0d0d0d;font-family:system-ui,sans-serif">
  ${defs}

  <!-- Background grid -->
  <defs>
    <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
      <path d="M 32 0 L 0 0 0 32" fill="none" stroke="rgba(255,255,255,0.03)" stroke-width="0.5"/>
    </pattern>
  </defs>
  <rect width="100%" height="100%" fill="url(#grid)"/>

  <!-- Title -->
  <text x="${svgW / 2}" y="${MARGIN - 8}" text-anchor="middle"
    font-family="'JetBrains Mono', monospace" font-size="16"
    fill="rgba(255,255,255,0.6)" letter-spacing="0.05em">${this._esc(title)}</text>

  <!-- Stats -->
  <text x="${svgW / 2}" y="${MARGIN + 12}" text-anchor="middle"
    font-family="'JetBrains Mono', monospace" font-size="10"
    fill="rgba(255,255,255,0.2)">${graph.nodes.length} modules · ${graph.edges.length} edges · ${graph.builtAt}</text>

  <!-- Group headers -->
  ${groupHeaders}

  <!-- Edges -->
  <g id="edges">${edgeLines}</g>

  <!-- Nodes -->
  <g id="nodes">${nodeRects}</g>

  <!-- Legend -->
  <g id="legend">${legend}</g>

</svg>`;
  }

  _esc(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  _emit(eventName, payload) {
    try {
      const bus = this._registry?.get?.("EventBus.service");
      bus?.emit?.(eventName, payload);
    } catch (_) {}
  }
}

module.exports = CartographerWorkflow;
