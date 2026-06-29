/**
 * @SdoaManifest
 * id: LineageTreeRenderer
 * type: UI_LOGIC
 * version: 1.0.0
 * description: Renders the Registrar's lineage tree as a dynamic hierarchy using D3.
 * capabilities: lineage.render
 * dependencies: d3
 */
import * as d3 from 'd3';

export function renderLineageTree(target: HTMLElement, lineageData: any) {
  target.innerHTML = '';
  
  const width = target.clientWidth || 800;
  const height = target.clientHeight || 600;

  const treeLayout = d3.tree().size([height - 50, width - 200]);

  const root = d3.hierarchy(lineageData);
  treeLayout(root);

  const svg = d3.select(target)
    .append('svg')
    .attr('width', width)
    .attr('height', height)
    .append('g')
    .attr('transform', 'translate(50, 25)');

  svg.selectAll('line')
    .data(root.links())
    .enter()
    .append('line')
    .attr('x1', d => d.source.y)
    .attr('y1', d => d.source.x)
    .attr('x2', d => d.target.y)
    .attr('y2', d => d.target.x)
    .attr('stroke', '#30363d')
    .attr('stroke-width', 2);

  const node = svg.selectAll('g.node')
    .data(root.descendants())
    .enter()
    .append('g')
    .attr('class', 'node')
    .attr('transform', d => `translate(${d.y},${d.x})`);

  node.append('circle')
    .attr('r', 8)
    .attr('fill', d => d.data.runtime === 'rust'
      ? '#ff7b72' // red
      : d.data.runtime === 'go'
      ? '#3fb950' // green
      : d.data.runtime === 'ts'
      ? '#58a6ff' // blue
      : '#c9d1d9' // default
    );

  node.append('text')
    .attr('dy', -12)
    .attr('text-anchor', 'middle')
    .text(d => d.data.name || d.data.id)
    .attr('fill', '#c9d1d9')
    .attr('font-size', '12px');
}
