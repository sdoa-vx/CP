// ───────────────────────────
// File:    graph/engine.js
// Version: 1.0.00
// Updated: 2026-06-18T00:00:00Z
// Changes: Initial capability graph wrapper
// ───────────────────────────

import Graph from 'graphology';
import { forEachEdge } from 'graphology-utils';
import { detect as detectCycles } from 'graphology-dag';
import { singleSource } from 'graphology-shortest-path';

export class CapabilityGraph {
  constructor(db) {
    this.db = db;
    this.graph = new Graph({ type: 'directed' });
  }

  loadFromDatabase() {
    this.graph.clear();

    const modules = this.db
      .prepare(`SELECT id, manifestJson FROM modules`)
      .all();

    for (const m of modules) {
      if (!this.graph.hasNode(m.id)) {
        this.graph.addNode(m.id, { manifest: JSON.parse(m.manifestJson) });
      }
    }

    const edges = this.db.prepare(`SELECT fromId, toId, edgeType FROM edges`).all();
    for (const e of edges) {
      if (!this.graph.hasEdge(e.fromId, e.toId)) {
        this.graph.addDirectedEdge(e.fromId, e.toId, { type: e.edgeType });
      }
    }
  }

  saveToDatabase() {
    const insert = this.db.prepare(`
      INSERT INTO edges (fromId, toId, edgeType)
      VALUES (@fromId, @toId, @edgeType)
      ON CONFLICT(fromId, toId, edgeType) DO NOTHING
    `);

    this.db.prepare(`DELETE FROM edges`).run();

    this.db.transaction(() => {
      forEachEdge(this.graph, (edge, attrs, source, target) => {
        insert.run({
          fromId: source,
          toId: target,
          edgeType: attrs.type || 'depends',
        });
      });
    })();
  }

  buildFromManifests() {
    this.graph.clear();

    const modules = this.db
      .prepare(`SELECT id, manifestJson FROM modules`)
      .all();

    for (const m of modules) {
      const manifest = JSON.parse(m.manifestJson);
      if (!this.graph.hasNode(m.id)) {
        this.graph.addNode(m.id, { manifest });
      }

      const requires = manifest.requires || manifest.dependencies || [];
      for (const dep of requires) {
        if (!this.graph.hasNode(dep)) {
          this.graph.addNode(dep, { manifest: null });
        }
        if (!this.graph.hasEdge(m.id, dep)) {
          this.graph.addDirectedEdge(m.id, dep, { type: 'requires' });
        }
      }
    }
  }

  detectCycles() {
    return detectCycles(this.graph);
  }

  topoOrder() {
    // simple Kahn-like topo sort using in-degree
    const inDegree = new Map();
    this.graph.forEachNode((n) => {
      inDegree.set(n, this.graph.inDegree(n));
    });

    const queue = [];
    for (const [n, d] of inDegree.entries()) {
      if (d === 0) queue.push(n);
    }

    const order = [];
    while (queue.length) {
      const n = queue.shift();
      order.push(n);
      this.graph.forEachOutboundNeighbor(n, (nbr) => {
        const d = inDegree.get(nbr) - 1;
        inDegree.set(nbr, d);
        if (d === 0) queue.push(nbr);
      });
    }

    return order;
  }

  shortestPath(fromId, toId) {
    const paths = singleSource(this.graph, fromId);
    return paths[toId] || null;
  }

  detectLayerViolations() {
    const violations = [];
    this.graph.forEachEdge((edge, attrs, source, target) => {
      const srcNode = this.graph.getNodeAttributes(source);
      const tgtNode = this.graph.getNodeAttributes(target);
      
      const srcLayer = srcNode?.manifest?.layer;
      const tgtLayer = tgtNode?.manifest?.layer;
      
      if (srcLayer !== undefined && tgtLayer !== undefined) {
        if (srcLayer > tgtLayer) {
          violations.push({
            source, target, srcLayer, tgtLayer,
            reason: `Module at layer ${srcLayer} cannot depend on module at layer ${tgtLayer}`
          });
        }
      }
    });
    return violations;
  }

  detectSovereigntyViolations() {
    const violations = [];
    this.graph.forEachNode((node, attrs) => {
      if (!attrs.manifest && attrs.manifest !== null) {
        violations.push({
          node,
          reason: 'Node has no manifest attributes defined'
        });
      }
    });
    return violations;
  }

  detectBoundaryViolations() {
    const violations = [];
    // Placeholder for complex domain/boundary rules
    return violations;
  }

  writeGraphCache(cachePath) {
    import('fs').then(fs => {
      import('path').then(path => {
        const serialized = this.graph.export();
        const dir = path.dirname(cachePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(cachePath, JSON.stringify(serialized, null, 2), 'utf8');
      });
    });
    return true;
  }

  validateGraphIntegrity() {
    const errors = [];
    
    if (this.detectCycles()) {
      errors.push('Graph contains circular dependencies');
    }
    
    const layerErrs = this.detectLayerViolations();
    if (layerErrs.length > 0) {
      errors.push(`Found ${layerErrs.length} layer violations`);
    }

    const sovErrs = this.detectSovereigntyViolations();
    if (sovErrs.length > 0) {
      errors.push(`Found ${sovErrs.length} sovereignty violations`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      layerViolations: layerErrs,
      sovereigntyViolations: sovErrs
    };
  }
}

