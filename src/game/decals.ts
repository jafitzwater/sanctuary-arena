/**
 * Blood pools stamped into the cached map canvas. Render-only; the sim never
 * reads them, so Math.random here does not affect combat.
 */

export function stampBloodPool(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  ichor: boolean,
): void {
  const rgb = ichor ? '42, 72, 34' : '110, 18, 22';
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, 0.5);
  const pool = ctx.createRadialGradient(0, 0, radius * 0.12, 0, 0, radius);
  pool.addColorStop(0, `rgba(${rgb}, 0.95)`);
  pool.addColorStop(0.62, `rgba(${rgb}, 0.62)`);
  pool.addColorStop(1, `rgba(${rgb}, 0)`);
  ctx.fillStyle = pool;
  ctx.beginPath();
  ctx.ellipse(0, 0, radius, radius * 0.78, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  const drops = 4 + Math.floor(Math.random() * 4);
  for (let i = 0; i < drops; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = radius * (0.55 + Math.random() * 0.7);
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist * 0.5;
    ctx.fillStyle = `rgba(${rgb}, ${0.55 + Math.random() * 0.4})`;
    ctx.beginPath();
    ctx.ellipse(x + dx, y + dy, 1.4 + Math.random() * 2.2, 1 + Math.random(), angle, 0, Math.PI * 2);
    ctx.fill();
  }
}
