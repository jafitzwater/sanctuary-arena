/**
 * Base layout art [JOSEPH t309u], draw only: Diablo 2 style stone ruin wall blocks, the glowing spawn barrier
 * and its opening countdown. Thin dark outlines like every other structure (readability OUTLINE_INK, 1 px).
 * Nothing here touches collision, pathing or the sim.
 */
import { OUTLINE_ALPHA, OUTLINE_INK } from '../readability';

type P = { x: number; y: number };

/** [TEMP] Wall block height in bake px (before the view scale). Low ruin wall, below a hero's shoulder. */
export const WALL_HEIGHT = 40;
/** [TEMP] Spawn barrier curtain height in bake px. */
export const BARRIER_HEIGHT = 74;
/** [TEMP] Barrier fade-out when it drops, seconds. */
export const BARRIER_FADE = 0.6;
/** Outline width for wall blocks, css px (same as tower outlines). */
export const WALL_OUTLINE_PX = 1;

function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function shade(hex: string, k: number): string {
  const v = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((v >> 16) & 255) * k));
  const g = Math.min(255, Math.round(((v >> 8) & 255) * k));
  const b = Math.min(255, Math.round((v & 255) * k));
  return `rgb(${r},${g},${b})`;
}

/**
 * One ruin block. `foot` is the projected footprint quad (4 screen points, in order), `h` the screen height.
 * Heights vary per seed (broken courses), the top carries rubble and moss, edges get a 1 px dark outline.
 */
export function paintWallBlock(ctx: CanvasRenderingContext2D, foot: P[], h: number, seed: number, hell: boolean): void {
  // Two stones per block, each its own height, so the wall top reads as a broken ruin course, not a crate row.
  const lerp = (a: P, b: P, t: number) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const cut = 0.42 + hash(seed + 41) * 0.16;
  const parts = [
    [foot[0], lerp(foot[0], foot[1], cut), lerp(foot[3], foot[2], cut), foot[3]],
    [lerp(foot[0], foot[1], cut), foot[1], foot[2], lerp(foot[3], foot[2], cut)],
  ].map((q, k) => ({ q, k, depth: q.reduce((sum, pt) => sum + pt.y, 0) }));
  parts.sort((a, b) => a.depth - b.depth);
  for (const part of parts) paintStone(ctx, part.q, h, seed * 2 + part.k, hell);
}

function paintStone(ctx: CanvasRenderingContext2D, foot: P[], h: number, seed: number, hell: boolean): void {
  const r = hash(seed);
  const broken = r < 0.14;
  const hh = h * (broken ? 0.38 + hash(seed + 3) * 0.2 : 0.72 + r * 0.28);
  const stone = hell ? '#4a3a36' : hash(seed + 7) < 0.5 ? '#6a6458' : '#5e594f';
  const top = foot.map((p) => ({ x: p.x, y: p.y - hh }));
  const cx = foot.reduce((s, p) => s + p.x, 0) / 4;
  const cy = foot.reduce((s, p) => s + p.y, 0) / 4;
  ctx.save();
  // Ground shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.beginPath();
  foot.forEach((p, i) => (i ? ctx.lineTo(p.x + (p.x - cx) * 0.25, p.y + (p.y - cy) * 0.25 + 2) : ctx.moveTo(p.x + (p.x - cx) * 0.25, p.y + (p.y - cy) * 0.25 + 2)));
  ctx.closePath();
  ctx.fill();
  // Side faces, back to front.
  const faces = [0, 1, 2, 3]
    .map((i) => ({ a: i, b: (i + 1) % 4, depth: (foot[i].y + foot[(i + 1) % 4].y) / 2 }))
    .sort((m, n) => m.depth - n.depth);
  ctx.lineJoin = 'round';
  ctx.lineWidth = WALL_OUTLINE_PX;
  ctx.strokeStyle = OUTLINE_INK;
  for (const face of faces) {
    const a = foot[face.a];
    const b = foot[face.b];
    // Faces turned toward the light (left) are lighter.
    const lit = b.x - a.x > 0 ? 0.78 : 0.62;
    ctx.fillStyle = shade(stone, lit);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(top[face.b].x, top[face.b].y);
    ctx.lineTo(top[face.a].x, top[face.a].y);
    ctx.closePath();
    ctx.fill();
    // Mortar courses with staggered joints.
    ctx.strokeStyle = 'rgba(20,16,12,0.45)';
    const courses = [0.34, 0.68];
    for (let c = 0; c <= courses.length; c++) {
      const lo = c === 0 ? 0 : courses[c - 1] * h;
      if (lo >= hh) break;
      const hiY = Math.min(hh, c < courses.length ? courses[c] * h : hh);
      if (c < courses.length && courses[c] * h < hh) {
        ctx.beginPath();
        ctx.moveTo(a.x, a.y - courses[c] * h);
        ctx.lineTo(b.x, b.y - courses[c] * h);
        ctx.stroke();
      }
      const t = c % 2 ? 0.3 + hash(seed + c) * 0.15 : 0.6 + hash(seed + c) * 0.15;
      const jx = a.x + (b.x - a.x) * t;
      const jy = a.y + (b.y - a.y) * t;
      ctx.beginPath();
      ctx.moveTo(jx, jy - lo);
      ctx.lineTo(jx, jy - hiY);
      ctx.stroke();
    }
    ctx.globalAlpha = OUTLINE_ALPHA;
    ctx.strokeStyle = OUTLINE_INK;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(top[face.b].x, top[face.b].y);
    ctx.lineTo(top[face.a].x, top[face.a].y);
    ctx.closePath();
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // Top course.
  ctx.fillStyle = shade(stone, 1.12);
  ctx.beginPath();
  top.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  ctx.fill();
  if (!hell && hash(seed + 11) < 0.35) {
    ctx.fillStyle = 'rgba(70,92,48,0.55)';
    ctx.beginPath();
    ctx.ellipse(
      (top[0].x + top[2].x) / 2, (top[0].y + top[2].y) / 2,
      Math.abs(top[2].x - top[0].x) * 0.22 + 1, Math.abs(top[2].y - top[0].y) * 0.18 + 1, 0, 0, Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.globalAlpha = OUTLINE_ALPHA;
  ctx.strokeStyle = OUTLINE_INK;
  ctx.beginPath();
  top.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  ctx.stroke();
  ctx.globalAlpha = 1;
  // Fallen rubble at the foot of broken blocks.
  if (broken) {
    ctx.fillStyle = shade(stone, 0.9);
    for (let k = 0; k < 3; k++) {
      const t = hash(seed + 20 + k);
      const px = foot[0].x + (foot[2].x - foot[0].x) * t + (hash(seed + 30 + k) - 0.5) * 6;
      const py = foot[0].y + (foot[2].y - foot[0].y) * t + 2;
      ctx.beginPath();
      ctx.ellipse(px, py, 2.4, 1.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = OUTLINE_ALPHA * 0.8;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();
}

/**
 * One half of the glowing spawn barrier: a translucent curtain over the projected ring `ring` (screen points,
 * closed loop). `back` = the half behind the centre (drawn before the units), else the front half.
 */
export function paintBarrier(
  ctx: CanvasRenderingContext2D, ring: P[], centerY: number, h: number, color: string, alpha: number, time: number, back: boolean,
): void {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const flick = 0.86 + 0.14 * Math.sin(time * 5.2);
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const mid = (a.y + b.y) / 2;
    if (back !== mid < centerY) continue;
    const grad = ctx.createLinearGradient(0, mid, 0, mid - h);
    grad.addColorStop(0, color.replace('rgb(', 'rgba(').replace(')', `,${0.5 * alpha * flick})`));
    grad.addColorStop(0.55, color.replace('rgb(', 'rgba(').replace(')', `,${0.2 * alpha * flick})`));
    grad.addColorStop(1, color.replace('rgb(', 'rgba(').replace(')', `,${0.1 * alpha * flick})`));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(b.x, b.y - h);
    ctx.lineTo(a.x, a.y - h);
    ctx.closePath();
    ctx.fill();
    // Faint vertical streaks and a soft top rim so the curtain reads as a wall of light.
    ctx.strokeStyle = color.replace('rgb(', 'rgba(').replace(')', `,${0.22 * alpha})`);
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (i % 2 === 0) {
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(a.x, a.y - h);
    }
    ctx.moveTo(a.x, a.y - h);
    ctx.lineTo(b.x, b.y - h);
    ctx.stroke();
    // Rune ribs rising up the curtain.
    if (i % 3 === 0) {
      const rise = (time * 0.6 + i * 0.13) % 1;
      ctx.strokeStyle = `rgba(235,240,255,${0.35 * alpha * (1 - rise)})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y - h * rise * 0.8);
      ctx.lineTo(a.x, a.y - h * rise * 0.8 - h * 0.18);
      ctx.stroke();
    }
  }
  // Bright ground seam.
  ctx.strokeStyle = color.replace('rgb(', 'rgba(').replace(')', `,${0.95 * alpha})`);
  ctx.lineWidth = 2;
  ctx.beginPath();
  let open = false;
  for (let i = 0; i <= ring.length; i++) {
    const a = ring[i % ring.length];
    const b = ring[(i + 1) % ring.length];
    if (back !== (a.y + b.y) / 2 < centerY) {
      open = false;
      continue;
    }
    if (!open) ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    open = true;
  }
  ctx.stroke();
  ctx.restore();
}

/** The opening countdown: a big number with a short caption, screen space, top centre. */
export function paintBarrierCountdown(ctx: CanvasRenderingContext2D, cssW: number, cssH: number, secondsLeft: number): void {
  const n = Math.max(1, Math.ceil(secondsLeft));
  const small = cssH < 500;
  const y = small ? 68 : Math.round(cssH * 0.2);
  const big = small ? 30 : 42;
  const cap = small ? 11 : 13;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.font = `700 ${cap}px "Cinzel", "Cinzel Decorative", Georgia, serif`;
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(8,6,4,0.9)';
  ctx.fillStyle = '#d8c8a0';
  const caption = 'The barrier falls in';
  ctx.strokeText(caption, cssW / 2, y - big * 0.72);
  ctx.fillText(caption, cssW / 2, y - big * 0.72);
  ctx.font = `700 ${big}px "Cinzel Decorative", "Cinzel", Georgia, serif`;
  ctx.lineWidth = 4;
  ctx.strokeText(String(n), cssW / 2, y + 4);
  ctx.fillStyle = '#ffe9a8';
  ctx.shadowColor = 'rgba(120,170,255,0.8)';
  ctx.shadowBlur = 10;
  ctx.fillText(String(n), cssW / 2, y + 4);
  ctx.restore();
}
