// src/game/engine.ts
export function startEngine(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!;
  const resize = () => { canvas.width = innerWidth; canvas.height = innerHeight; };
  resize();
  addEventListener('resize', resize);
  let raf = 0;
  const loop = () => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    raf = requestAnimationFrame(loop);
  };
  loop();
}
