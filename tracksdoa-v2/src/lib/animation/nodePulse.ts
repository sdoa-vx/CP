export function pulse(node: HTMLElement, { health }: { health: string }) {
  let frame: number;

  function loop() {
    const base = health === 'degrading' ? 0.8 : 0.4;
    const pulseAmt = Math.sin(Date.now() / 300) * 0.2;
    node.style.opacity = (base + pulseAmt).toString();
    frame = requestAnimationFrame(loop);
  }

  loop();

  return {
    update(newProps: { health: string }) {
      health = newProps.health;
    },
    destroy() {
      cancelAnimationFrame(frame);
    }
  };
}
