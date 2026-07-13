import { MeshStateStore } from '../state/meshState.js';

export default {
  async render() {
    return `
      <div class="sdoa-card" style="height: calc(100vh - 120px); display: flex; flex-direction: column;">
        <div style="margin-bottom: 1rem; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <h2>Cinematic Mesh Map</h2>
            <p class="text-muted">Live Visual Sovereignty Layer (VSL) Force Graph.</p>
          </div>
        </div>
        <div id="mesh-container" style="flex: 1; background: rgba(0,0,0,0.6); border-radius: 8px; border: 1px solid var(--sdoa-border); overflow: hidden; position: relative;">
          <!-- D3 Graph will render here -->
        </div>
      </div>
    `;
  },
  
  init() {
    this.simulation = null;
    this.svg = null;
    this.linkGroup = null;
    this.nodeGroup = null;
    this.labelGroup = null;

    window.triggerMeshRipple = this.triggerRipple.bind(this);

    this.renderInitialGraph();
    
    // Subscribe to MeshStateStore for lag-resistant data updates
    this.unsubscribe = MeshStateStore.subscribe((state) => {
      this.updateGraph(state.nodes, state.links);
    });

    // Start data polling to feed the store
    this.fetchData();
    this.fetchInterval = setInterval(() => this.fetchData(), 3000);
  },

  destroy() {
    if (this.unsubscribe) this.unsubscribe();
    if (this.fetchInterval) clearInterval(this.fetchInterval);
    if (this.simulation) this.simulation.stop();
  },

  renderInitialGraph() {
    const container = document.getElementById('mesh-container');
    if (!container || !window.d3) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    container.innerHTML = ''; // clear

    this.svg = d3.select('#mesh-container').append('svg')
      .attr('width', width)
      .attr('height', height);

    // Filter for node glow
    const defs = this.svg.append("defs");
    
    // Healthy glow
    const filterHealthy = defs.append("filter").attr("id", "glow-healthy");
    filterHealthy.append("feGaussianBlur").attr("stdDeviation", "4").attr("result", "coloredBlur");
    const feMergeH = filterHealthy.append("feMerge");
    feMergeH.append("feMergeNode").attr("in", "coloredBlur");
    feMergeH.append("feMergeNode").attr("in", "SourceGraphic");

    // Degraded glow
    const filterDegraded = defs.append("filter").attr("id", "glow-degraded");
    filterDegraded.append("feGaussianBlur").attr("stdDeviation", "6").attr("result", "coloredBlur");
    const feMergeD = filterDegraded.append("feMerge");
    feMergeD.append("feMergeNode").attr("in", "coloredBlur");
    feMergeD.append("feMergeNode").attr("in", "SourceGraphic");

    // Critical glow
    const filterCritical = defs.append("filter").attr("id", "glow-critical");
    filterCritical.append("feGaussianBlur").attr("stdDeviation", "8").attr("result", "coloredBlur");
    const feMergeC = filterCritical.append("feMerge");
    feMergeC.append("feMergeNode").attr("in", "coloredBlur");
    feMergeC.append("feMergeNode").attr("in", "SourceGraphic");

    // Define arrowhead marker for routing flow
    defs.append("marker")
      .attr("id", "arrowhead")
      .attr("viewBox", "-0 -5 10 10")
      .attr("refX", 25)
      .attr("refY", 0)
      .attr("orient", "auto")
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("markerUnits", "strokeWidth")
      .attr("xoverflow", "visible")
      .append("svg:path")
      .attr("d", "M 0,-5 L 10 ,0 L 0,5")
      .attr("fill", "rgba(139, 92, 246, 0.8)")
      .style("stroke", "none");

    this.simulation = d3.forceSimulation()
      .force('link', d3.forceLink().id(d => d.id).distance(100))
      .force('charge', d3.forceManyBody().strength(-150))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide().radius(d => d.radius + 20));

    this.linkGroup = this.svg.append('g').attr('class', 'links');
    this.nodeGroup = this.svg.append('g').attr('class', 'nodes');
    this.labelGroup = this.svg.append('g').attr('class', 'labels');
  },

  async fetchData() {
    try {
      const res = await fetch('/dashboard/api/mesh/topology');
      const data = await res.json();
      
      if (data.ok && data.topology) {
        MeshStateStore.updateFromSnapshot({
          nodes: data.topology.nodes,
          links: data.topology.links
        });
      }
    } catch (err) {
      console.error("Failed to fetch topology", err);
    }
  },

  updateGraph(nodes, links) {
    if (!this.simulation) return;
    if (!nodes || !links) return;

    // ----- Update Links -----
    const linkSelection = this.linkGroup.selectAll('line').data(links, d => d.source.id + "-" + d.target.id);
    linkSelection.exit().remove();
    
    const linkEnter = linkSelection.enter().append('line')
      .attr('stroke', d => d.type === 'route' ? 'rgba(139, 92, 246, 0.8)' : 'rgba(255,255,255,0.2)')
      .attr('stroke-width', d => d.value || 1)
      .attr('stroke-dasharray', d => d.type === 'route' ? '8,4' : 'none')
      .attr('marker-end', d => d.type === 'route' ? 'url(#arrowhead)' : '');
      
    const linkElements = linkEnter.merge(linkSelection);
    
    // Animate flow for routes
    linkElements.filter(d => d.type === 'route')
      .style('animation', 'flow 2s linear infinite');

    if (!document.getElementById('mesh-styles')) {
      const style = document.createElement('style');
      style.id = 'mesh-styles';
      style.innerHTML = `@keyframes flow { to { stroke-dashoffset: -12; } }`;
      document.head.appendChild(style);
    }

    // ----- Update Nodes -----
    const nodeSelection = this.nodeGroup.selectAll('circle').data(nodes, d => d.id);
    nodeSelection.exit().remove();
    
    const nodeEnter = nodeSelection.enter().append('circle')
      .attr('r', d => d.radius)
      .attr('stroke', '#fff')
      .attr('stroke-width', 1.5)
      .call(this.drag(this.simulation));

    const nodeElements = nodeEnter.merge(nodeSelection)
      .attr('fill', d => d.color || '#9ca3af')
      .attr('r', d => d.radius)
      .attr('filter', d => {
        if (d.color === '#ef4444') return 'url(#glow-critical)';
        if (d.color === '#f59e0b') return 'url(#glow-degraded)';
        if (d.color === '#3b82f6') return 'url(#glow-healthy)';
        return null;
      });

    // Node click handler
    nodeElements.on("click", (event, d) => {
      console.log("Clicked Node:", d);
      // In a full implementation, open sovereign detail panel here
    });

    // Node glowing pulse for critical
    nodeElements.filter(d => d.color === '#ef4444')
      .transition().duration(500).attr('r', d => d.radius * 1.3)
      .transition().duration(500).attr('r', d => d.radius)
      .on("end", function repeat() {
        d3.select(this)
          .transition().duration(500).attr('r', d => d.radius * 1.3)
          .transition().duration(500).attr('r', d => d.radius)
          .on("end", repeat);
      });

    // ----- Update Labels -----
    const labelSelection = this.labelGroup.selectAll('text').data(nodes, d => d.id);
    labelSelection.exit().remove();
    
    const labelEnter = labelSelection.enter().append('text')
      .attr('dy', -25)
      .attr('dx', 0)
      .attr('text-anchor', 'middle')
      .attr('fill', '#c9d1d9')
      .attr('font-size', '12px')
      .attr('font-family', 'Inter, sans-serif')
      .text(d => d.name);
      
    const labelElements = labelEnter.merge(labelSelection);

    // Feed data to simulation
    this.simulation.nodes(nodes);
    this.simulation.force('link').links(links);
    
    // Restart simulation gently
    this.simulation.alpha(0.3).restart();

    this.simulation.on('tick', () => {
      linkElements
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);

      nodeElements
        .attr('cx', d => d.x)
        .attr('cy', d => d.y);

      labelElements
        .attr('x', d => d.x)
        .attr('y', d => d.y);
    });
  },

  drag(simulation) {
    function dragstarted(event) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      event.subject.fx = event.subject.x;
      event.subject.fy = event.subject.y;
    }
    
    function dragged(event) {
      event.subject.fx = event.x;
      event.subject.fy = event.y;
    }
    
    function dragended(event) {
      if (!event.active) simulation.alphaTarget(0);
      event.subject.fx = null;
      event.subject.fy = null;
    }
    
    return d3.drag()
      .on('start', dragstarted)
      .on('drag', dragged)
      .on('end', dragended);
  },

  triggerRipple(event) {
    if (!this.svg || !this.simulation) return;
    
    let color = '#fcd34d'; // modified (yellow)
    if (event.action === 'rename' || event.action === 'created') color = '#34d399'; // green
    if (event.action === 'deleted') color = '#f87171'; // red

    let targetNode = null;
    if (event.file) {
       // Try to guess the module name from the file name, e.g. TimeMachine.service.ts -> TimeMachine
       const parts = event.file.split('/');
       const filename = parts[parts.length - 1];
       const baseName = filename.split('.')[0];
       
       const nodes = this.simulation.nodes();
       targetNode = nodes.find(n => n.name === baseName || n.id === baseName || n.name.includes(baseName));
    }

    let cx, cy;
    if (targetNode) {
       cx = targetNode.x;
       cy = targetNode.y;
       
       // Pulse the node
       this.nodeGroup.selectAll('circle').filter(d => d.id === targetNode.id)
         .transition().duration(200).attr('r', targetNode.radius * 2)
         .attr('filter', 'url(#glow-healthy)')
         .transition().duration(1000).attr('r', targetNode.radius)
         .attr('filter', null);
         
       // Thicken edges
       this.linkGroup.selectAll('line').filter(d => d.source.id === targetNode.id || d.target.id === targetNode.id)
         .transition().duration(200).attr('stroke-width', 4).attr('stroke', color)
         .transition().duration(1000).attr('stroke-width', d => d.value || 1).attr('stroke', d => d.type === 'route' ? 'rgba(139, 92, 246, 0.8)' : 'rgba(255,255,255,0.2)');
         
       // Enlarge label temporarily
       this.labelGroup.selectAll('text').filter(d => d.id === targetNode.id)
         .transition().duration(200).attr('font-size', '16px').attr('fill', '#fff')
         .transition().duration(1000).attr('font-size', '12px').attr('fill', '#c9d1d9');
    } else {
       // Spawn near center if module not found
       const container = document.getElementById('mesh-container');
       cx = container.clientWidth / 2 + (Math.random() * 100 - 50);
       cy = container.clientHeight / 2 + (Math.random() * 100 - 50);
    }

    const radiusTarget = event.sizeBytes ? Math.min(Math.max(event.sizeBytes / 20, 50), 400) : 100;

    // Spawn the ripple
    this.svg.insert('circle', ':first-child')
       .attr('cx', cx)
       .attr('cy', cy)
       .attr('r', targetNode ? targetNode.radius : 10)
       .attr('fill', 'none')
       .attr('stroke', color)
       .attr('stroke-width', 4)
       .attr('opacity', 1)
       .transition()
       .duration(1200)
       .ease(d3.easeCubicOut)
       .attr('r', radiusTarget)
       .attr('opacity', 0)
       .attr('stroke-width', 0)
       .remove();
  }
};
