export function flowEdge(node: SVGPathElement, { latency }: { latency: number }) {
  let frame: number;

  function loop() {
    const l = latency > 0 ? latency : 50; // prevent div by zero
    const offset = (Date.now() / l) % 100;
    node.style.strokeDashoffset = offset.toString();
    frame = requestAnimationFrame(loop);
  }

  loop();

  return {
    update(newProps: { latency: number }) {
      latency = newProps.latency;
    },
    destroy() {
      cancelAnimationFrame(frame);
    }
  };
}
