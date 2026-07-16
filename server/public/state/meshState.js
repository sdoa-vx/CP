const listeners = new Set();

let currentState = {
  nodes: [],
  links: [],
  violations: [],
  rules: [],
  timeline: [],
  currentTimestamp: null,
  isReplaying: false // Conflict-aware mode
};

export const MeshStateStore = {
  getState() {
    return currentState;
  },

  setReplayMode(isActive) {
    currentState.isReplaying = isActive;
  },

  updateFromSnapshot(snapshot, force = false) {
    // If we're replaying, ignore live polling updates unless forced
    if (currentState.isReplaying && !force) return;

    // Incremental Merge Logic (Preserves D3 Physics references)
    if (snapshot.nodes) {
      const existingNodes = new Map(currentState.nodes.map(n => [n.id, n]));
      const nextNodes = [];
      for (const next of snapshot.nodes) {
        if (existingNodes.has(next.id)) {
          const old = existingNodes.get(next.id);
          // Preserve d3 physics coords
          Object.assign(old, next, { x: old.x, y: old.y, vx: old.vx, vy: old.vy });
          nextNodes.push(old);
        } else {
          nextNodes.push(next);
        }
      }
      currentState.nodes = nextNodes;
    }

    if (snapshot.links) {
      // Re-map links to node references so D3 links don't break
      const nodeMap = new Map(currentState.nodes.map(n => [n.id, n]));
      currentState.links = snapshot.links.map(l => ({
        ...l,
        source: typeof l.source === 'object' ? l.source : nodeMap.get(l.source),
        target: typeof l.target === 'object' ? l.target : nodeMap.get(l.target)
      })).filter(l => l.source && l.target);
    }

    if (snapshot.violations) currentState.violations = snapshot.violations;
    if (snapshot.rules) currentState.rules = snapshot.rules;
    if (snapshot.timeline) currentState.timeline = snapshot.timeline;
    if (snapshot.currentTimestamp) currentState.currentTimestamp = snapshot.currentTimestamp;

    this.notify();
  },

  applyDelta(delta) {
    if (currentState.isReplaying) return;
    // (A real system would do deep incremental event applies here)
    // For now we assume applyDelta is similar to applyEvent but with partial state
    this.updateFromSnapshot(delta, false);
  },

  applyEvent(event) {
    currentState.timeline.push(event);
    this.notify();
  },

  subscribe(callback) {
    listeners.add(callback);
    callback(currentState); // initial sync
    return () => listeners.delete(callback);
  },

  triggerImpactWave(event) {
    if (window.triggerMeshRipple) {
      window.triggerMeshRipple(event);
    }
  },

  notify() {
    for (const listener of listeners) {
      try {
        listener(currentState);
      } catch (err) {
        console.error("MeshStateStore listener error:", err);
      }
    }
  }
};
