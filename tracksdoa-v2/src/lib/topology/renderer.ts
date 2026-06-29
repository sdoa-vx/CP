/**
 * @SdoaManifest
 * id: MeshTopologyRenderer
 * type: UI_LOGIC
 * version: 1.0.0
 * description: Renders the sovereign mesh topology using D3 force layout.
 * capabilities: mesh.render, mesh.animate
 * dependencies: pulse, chronicle
 */
import * as d3 from 'd3';

export function initTopology(target: HTMLElement, meshData: any, pulseData: any, driftData: any) {
  target.innerHTML = '';
  
  const width = target.clientWidth || 800;
  const height = target.clientHeight || 600;

  // Provide some placeholder nodes/links if data is empty
  const nodes = meshData.nodes || [{ id: 'core', group: 1 }];
  const links = meshData.links || [];

  const svg = d3.select(target)
    .append('svg')
    .attr('width', width)
    .attr('height', height);

  const simulation = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links).id((d: any) => d.id))
    .force('charge', d3.forceManyBody().strength(-400))
    .force('center', d3.forceCenter(width / 2, height / 2));

  const link = svg.append('g')
    .selectAll('line')
    .data(links)
    .enter()
    .append('line')
    .attr('stroke', '#30363d')
    .attr('stroke-width', 2);

  const node = svg.append('g')
    .selectAll('circle')
    .data(nodes)
    .enter()
    .append('circle')
    .attr('r', 10)
    .attr('fill', '#58a6ff')
    .style('cursor', 'pointer')
    .on('click', (event, d: any) => {
      const customEvent = new CustomEvent('nodeclick', { detail: d });
      target.dispatchEvent(customEvent);
    });

  simulation.on('tick', () => {
    link
      .attr('x1', (d: any) => d.source.x)
      .attr('y1', (d: any) => d.source.y)
      .attr('x2', (d: any) => d.target.x)
      .attr('y2', (d: any) => d.target.y);

    node
      .attr('cx', (d: any) => d.x)
      .attr('cy', (d: any) => d.y);
  });
}
