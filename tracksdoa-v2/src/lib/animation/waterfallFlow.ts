export function waterfall(node: HTMLElement) {
  let frame: number;

  function loop() {
    const offset = (Date.now() / 50) % 100;
    node.style.backgroundPositionY = `${offset}%`;
    frame = requestAnimationFrame(loop);
  }

  loop();

  return {
    destroy() {
      cancelAnimationFrame(frame);
    }
  };
}
