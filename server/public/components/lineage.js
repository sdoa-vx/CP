export default {
  render() {
    return `
      <div class="sdoa-card" style="height: calc(100vh - 120px); display: flex; flex-direction: column;">
        <div style="margin-bottom: 1rem;">
          <h2>Lineage Tree (Registrar)</h2>
          <p class="text-muted">Hierarchical visualization of module origin and evolution.</p>
        </div>
        <div id="lineage-container" style="flex: 1; background: rgba(0,0,0,0.3); border-radius: 8px; border: 1px solid var(--sdoa-border); overflow: hidden; position: relative;">
          <!-- D3 Graph will render here -->
        </div>
      </div>
    `;
  },
  
  init() {
    this.renderGraph();
  },

  renderGraph() {
    const container = document.getElementById('lineage-container');
    if (!container || !window.d3) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    // Create a dummy tree data
    const data = {
      name: "SDOA Core",
      children: [
        {
          name: "Substrate",
          children: [{ name: "Engine" }, { name: "Router" }]
        },
        {
          name: "UI",
          children: [{ name: "Dashboard V3" }, { name: "Mesh Panel" }]
        }
      ]
    };

    const tree = d3.tree().size([width - 100, height - 100]);
    const root = d3.hierarchy(data);
    tree(root);

    const svg = d3.select('#lineage-container').append('svg')
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', 'translate(50, 50)');

    svg.selectAll('path')
      .data(root.links())
      .join('path')
      .attr('fill', 'none')
      .attr('stroke', 'rgba(255,255,255,0.2)')
      .attr('stroke-width', 2)
      .attr('d', d3.linkVertical()
        .x(d => d.x)
        .y(d => d.y)
      );

    const node = svg.selectAll('g.node')
      .data(root.descendants())
      .join('g')
      .attr('transform', d => `translate(${d.x},${d.y})`);

    node.append('circle')
      .attr('r', 6)
      .attr('fill', '#10b981');

    node.append('text')
      .attr('dy', '0.31em')
      .attr('x', d => d.children ? -10 : 10)
      .attr('text-anchor', d => d.children ? 'end' : 'start')
      .attr('fill', '#c9d1d9')
      .attr('font-size', '12px')
      .text(d => d.data.name);
  }
};
