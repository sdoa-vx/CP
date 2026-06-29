export function animateSigil(node: HTMLElement, { active }: { active: boolean }) {
  let frame: number;

  function loop() {
    const intensity = active ? 1 + Math.sin(Date.now() / 200) * 0.3 : 0.2;
    node.style.filter = `drop-shadow(0 0 ${intensity}rem var(--color))`;
    frame = requestAnimationFrame(loop);
  }

  loop();

  return {
    update(newProps: { active: boolean }) {
      active = newProps.active;
    },
    destroy() {
      cancelAnimationFrame(frame);
    }
  };
}
