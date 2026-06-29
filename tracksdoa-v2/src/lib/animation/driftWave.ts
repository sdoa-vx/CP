export function driftWave(node: HTMLElement) {
  let frame: number;

  function loop() {
    const wave = Math.sin(Date.now() / 500) * 5;
    node.style.transform = `translateY(${wave}px)`;
    frame = requestAnimationFrame(loop);
  }

  loop();

  return {
    destroy() {
      cancelAnimationFrame(frame);
    }
  };
}
