/**
 * Procedural Diablo II silhouettes and attack/recall flourishes.
 * Static torsos are stamped once; legs, weapons, and effects redraw live.
 * Nothing here changes positions, timings, or collision.
 */
import { TREE_OUTLINE_INK } from '../readability';

export type ArmorTier = 'light' | 'medium' | 'heavy';
export type AttackPose = 'none' | 'raise' | 'swing' | 'follow';
export type CreatureKind =
  | 'fallen'
  | 'goatman'
  | 'bovine'
  | 'raider'
  | 'blunder'
  | 'destruction'
  | 'rogue'
  | 'guard'
  | 'valkyrie'
  | 'mummy'
  | 'quill'
  | 'wisp';
export type BossMark = 'diablo' | 'mephisto' | 'duriel' | 'raven';
export type PropForm = 'pillar' | 'rock' | 'posts' | 'tent' | 'cart' | 'figure';

const stamps = new Map<string, HTMLCanvasElement>();

function hash(i: number, j: number): number {
  const n = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function stamp(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const hit = stamps.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  if (!g) return canvas;
  g.imageSmoothingEnabled = false;
  draw(g);
  stamps.set(key, canvas);
  return canvas;
}

function poly(g: CanvasRenderingContext2D, pts: number[], fill: string, edge?: string): void {
  g.beginPath();
  g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.closePath();
  g.fillStyle = fill;
  g.fill();
  if (edge) {
    g.strokeStyle = edge;
    g.lineWidth = 1;
    g.stroke();
  }
}

function circ(g: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, edge?: string): void {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = fill;
  g.fill();
  if (edge) {
    g.strokeStyle = edge;
    g.lineWidth = 1;
    g.stroke();
  }
}

/**
 * Visual readability items 5/6/8: while set, the ground marks (shadow ellipse, team ring) are recorded instead of
 * painted, so an outlined body never outlines its own ground marks (the caller replays them first, on the ground).
 */
export type GroundMark = (ctx: CanvasRenderingContext2D) => void;
let groundSink: GroundMark[] | null = null;

/** Run a paint with its ground marks held back; returns them to replay (in the paint's own coordinates). */
export function collectGroundMarks(fn: () => void): GroundMark[] {
  const prev = groundSink;
  const sink: GroundMark[] = [];
  groundSink = sink;
  try {
    fn();
  } finally {
    groundSink = prev;
  }
  return sink;
}

function shadow(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  if (groundSink) {
    groundSink.push((g) => shadow(g, x, y, w, h));
    return;
  }
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.ellipse(x, y, w, h, 0, 0, Math.PI * 2);
  ctx.fill();
}

function teamRing(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, ally: boolean): void {
  if (groundSink) {
    groundSink.push((g) => teamRing(g, x, y, h, ally));
    return;
  }
  ctx.save();
  ctx.globalAlpha = 0.4;
  ctx.strokeStyle = ally ? '#6aa7ff' : '#e4553c';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(x, y, h * 0.2, h * 0.075, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** Noise, cobbles, mud, and sparse debris. The base fill stays the tile color. */
export function paintTileVariation(
  ctx: CanvasRenderingContext2D,
  kind: string,
  i: number,
  j: number,
  sx: number,
  sy: number,
  decor: boolean,
  mud: boolean,
): void {
  const n = hash(i, j);
  if (kind === 'path') {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    for (let k = 0; k < 5; k++) {
      const gx = sx - 48 + hash(i + k, j) * 90;
      const gy = sy - 16 + hash(j + k, i) * 30;
      ctx.fillRect(gx, gy, 14 + (k % 3) * 4, 6);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.fillRect(sx - 30 + n * 20, sy - 10, 16, 5);
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sx - 36, sy - 6);
    ctx.lineTo(sx - 8, sy + 2);
    ctx.moveTo(sx + 6, sy - 2);
    ctx.lineTo(sx + 34, sy + 8);
    ctx.stroke();
  } else if (kind === 'town') {
    ctx.fillStyle = 'rgba(90, 70, 46, 0.28)';
    ctx.fillRect(sx - 40, sy - 8, 28, 10);
    ctx.fillStyle = 'rgba(255, 236, 200, 0.12)';
    ctx.fillRect(sx + 4, sy - 14, 22, 8);
  } else if (kind === 'pale') {
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(sx - 24, sy - 6, 36, 8);
    ctx.fillStyle = 'rgba(140, 40, 36, 0.35)';
    ctx.fillRect(sx - 4 + n * 10, sy - 2, 6, 3);
  } else {
    ctx.fillStyle = n > 0.5 ? 'rgba(0,0,0,0.16)' : 'rgba(70, 84, 36, 0.16)';
    ctx.beginPath();
    ctx.ellipse(sx - 18 + n * 36, sy - 4, 18, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    if (n > 0.72) {
      ctx.fillStyle = 'rgba(62, 44, 28, 0.4)';
      ctx.beginPath();
      ctx.ellipse(sx + 8, sy + 2, 12, 5, 0.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (mud) {
    ctx.fillStyle = 'rgba(58, 42, 28, 0.55)';
    ctx.beginPath();
    ctx.ellipse(sx, sy + 6, 34, 8, 0.15, 0, Math.PI * 2);
    ctx.fill();
  }
  if (decor && n > 0.95) paintDebris(ctx, sx - 10 + n * 20, sy - 2, n);
}

function paintDebris(ctx: CanvasRenderingContext2D, x: number, y: number, n: number): void {
  if (n > 0.985) {
    ctx.fillStyle = '#cbb892';
    ctx.beginPath();
    ctx.arc(x, y, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2a241c';
    ctx.fillRect(x - 1.5, y - 0.5, 1, 1);
    ctx.fillRect(x + 0.8, y - 0.5, 1, 1);
  } else if (n > 0.968) {
    ctx.fillStyle = '#2a3420';
    ctx.beginPath();
    ctx.ellipse(x, y, 7, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1a2014';
    ctx.beginPath();
    ctx.moveTo(x - 4, y);
    ctx.lineTo(x - 2, y - 6);
    ctx.moveTo(x + 2, y);
    ctx.lineTo(x + 5, y - 5);
    ctx.stroke();
  } else {
    ctx.strokeStyle = '#3e5230';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 2, y - 5);
    ctx.moveTo(x, y);
    ctx.lineTo(x + 1, y - 6);
    ctx.moveTo(x, y);
    ctx.lineTo(x + 3, y - 4);
    ctx.stroke();
  }
}

/** A small bone or tuft sitting on an existing prop. Bake only. */
export function paintDecorMark(ctx: CanvasRenderingContext2D, x: number, y: number, variant: number): void {
  if (variant % 4 !== 0) return;
  paintDebris(ctx, x + 8, y - 2, 0.99 - (variant % 3) * 0.01);
}

export function drawPropArt(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  height: number,
  form: PropForm,
  variant: number,
  hell: boolean,
  outline = 0,
): void {
  const h = height;
  const wood = hell ? '#3a2a28' : '#6b4e34';
  const woodHi = hell ? '#5a4038' : '#a07848';
  const cloth = hell ? '#4a3038' : variant % 2 === 0 ? '#8a7a5c' : '#6e5a40';
  shadow(ctx, x, y, h * 0.26, h * 0.09);
  if (form === 'pillar') {
    if (outline > 0) {
      // Visual readability item 9 [JOSEPH t253u]: 2 px dark outline around the tree (bake only, same shape grown).
      const o = outline;
      ctx.fillStyle = TREE_OUTLINE_INK;
      ctx.fillRect(x - h * 0.06 - o, y - h * 0.92 - o, h * 0.12 + o * 2, h * 0.92 + o);
      ctx.strokeStyle = TREE_OUTLINE_INK;
      ctx.lineWidth = Math.max(2, h * 0.04) + o * 2;
      ctx.beginPath();
      ctx.moveTo(x, y - h * 0.7);
      ctx.lineTo(x - h * 0.28, y - h * 0.95);
      ctx.moveTo(x, y - h * 0.62);
      ctx.lineTo(x + h * 0.24, y - h * 0.88);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(x - h * 0.16, y - h * 0.9, h * 0.12 + o, h * 0.06 + o, -0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = variant % 2 === 0 ? '#3e342c' : '#2c3828';
    ctx.fillRect(x - h * 0.06, y - h * 0.92, h * 0.12, h * 0.92);
    ctx.fillStyle = woodHi;
    ctx.fillRect(x - h * 0.02, y - h * 0.9, h * 0.03, h * 0.7);
    ctx.strokeStyle = '#2a241c';
    ctx.lineWidth = Math.max(2, h * 0.04);
    ctx.beginPath();
    ctx.moveTo(x, y - h * 0.7);
    ctx.lineTo(x - h * 0.28, y - h * 0.95);
    ctx.moveTo(x, y - h * 0.62);
    ctx.lineTo(x + h * 0.24, y - h * 0.88);
    ctx.stroke();
    ctx.fillStyle = '#24301c';
    ctx.beginPath();
    ctx.ellipse(x - h * 0.16, y - h * 0.9, h * 0.12, h * 0.06, -0.4, 0, Math.PI * 2);
    ctx.fill();
  } else if (form === 'posts') {
    ctx.fillStyle = wood;
    for (const ox of [-0.28, -0.1, 0.1, 0.28]) {
      ctx.beginPath();
      ctx.moveTo(x + ox * h - 2, y);
      ctx.lineTo(x + ox * h - 1, y - h);
      ctx.lineTo(x + ox * h + 1, y - h * 1.08);
      ctx.lineTo(x + ox * h + 3, y - h);
      ctx.lineTo(x + ox * h + 3, y);
      ctx.fill();
    }
    ctx.fillStyle = woodHi;
    ctx.fillRect(x - h * 0.32, y - h * 0.62, h * 0.64, 3);
  } else if (form === 'tent') {
    poly(ctx, [x, y - h, x + h * 0.4, y, x - h * 0.08, y], cloth, '#2a241c');
    poly(ctx, [x, y - h, x - h * 0.08, y, x - h * 0.42, y], hell ? '#2a2024' : '#5c4c38');
    poly(ctx, [x - h * 0.02, y - h * 0.42, x + h * 0.12, y, x - h * 0.08, y], '#1a1612');
    ctx.fillStyle = wood;
    ctx.fillRect(x - 1.5, y - h, 3, h);
  } else if (form === 'cart') {
    ctx.fillStyle = wood;
    ctx.fillRect(x - h * 0.26, y - h * 0.48, h * 0.52, h * 0.28);
    ctx.fillStyle = '#c4b070';
    ctx.fillRect(x - h * 0.22, y - h * 0.44, h * 0.44, 3);
    ctx.fillStyle = woodHi;
    ctx.fillRect(x - h * 0.04, y - h * 0.4, h * 0.08, h * 0.1);
    ctx.fillStyle = '#2a241c';
    ctx.beginPath();
    ctx.arc(x - h * 0.16, y - h * 0.1, h * 0.09, 0, Math.PI * 2);
    ctx.arc(x + h * 0.16, y - h * 0.1, h * 0.09, 0, Math.PI * 2);
    ctx.fill();
  } else if (form === 'figure') {
    ctx.fillStyle = hell ? '#4a2830' : '#3e4a38';
    ctx.beginPath();
    ctx.moveTo(x, y - h * 0.95);
    ctx.lineTo(x + h * 0.16, y - h * 0.45);
    ctx.lineTo(x + h * 0.1, y);
    ctx.lineTo(x - h * 0.1, y);
    ctx.lineTo(x - h * 0.16, y - h * 0.45);
    ctx.closePath();
    ctx.fill();
    circ(ctx, x, y - h * 0.78, h * 0.07, '#e0c2a4');
  } else {
    ctx.fillStyle = variant % 2 === 0 ? '#5a5348' : '#3e3830';
    ctx.beginPath();
    ctx.ellipse(x, y - h * 0.22, h * 0.34, h * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8a8174';
    ctx.beginPath();
    ctx.ellipse(x - h * 0.08, y - h * 0.32, h * 0.16, h * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,220,180,0.25)';
    ctx.beginPath();
    ctx.ellipse(x - h * 0.08, y - h * 0.32, h * 0.16, h * 0.08, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function torsoStamp(tier: ArmorTier): HTMLCanvasElement {
  return stamp(`torso-${tier}`, 88, 160, (g) => {
    const skin = '#c48a62';
    const skinS = '#8a5438';
    const skinH = '#e4b890';
    const fur = '#3e2c22';
    const furH = '#7a5840';
    const steel = '#c5ced6';
    const steelS = '#6a737c';
    const steelH = '#f2f6fa';
    const leather = '#6a4030';
    const leatherS = '#3a2418';
    const leatherH = '#a87848';
    poly(g, [22, 108, 66, 108, 76, 154, 12, 154], leatherS);
    poly(g, [28, 108, 60, 108, 66, 150, 22, 150], leather);
    g.fillStyle = leatherH;
    g.fillRect(42, 110, 6, 38);
    g.fillStyle = '#241810';
    g.fillRect(24, 102, 40, 8);
    g.fillStyle = steel;
    g.fillRect(38, 100, 12, 10);
    poly(g, [30, 70, 58, 70, 56, 106, 32, 106], skinS);
    poly(g, [34, 66, 54, 72, 52, 102, 36, 102], skin, 'rgba(255,220,180,0.35)');
    g.fillStyle = skinH;
    g.fillRect(46, 76, 5, 18);
    poly(g, [8, 84, 24, 60, 64, 60, 80, 84, 70, 98, 18, 98], fur);
    poly(g, [16, 66, 44, 56, 48, 78, 14, 86], furH);
    circ(g, 16, 72, 11, steelS);
    circ(g, 72, 72, 11, steelS);
    circ(g, 16, 70, 8, steel);
    circ(g, 72, 70, 8, steel);
    g.fillStyle = steelH;
    g.fillRect(10, 64, 8, 3);
    g.fillRect(68, 64, 8, 3);
    circ(g, 44, 48, 14, skinS);
    circ(g, 46, 46, 12, skin, 'rgba(255,220,180,0.4)');
    poly(g, [34, 52, 44, 70, 54, 52], '#4a3024');
    if (tier === 'light') {
      g.fillStyle = leatherS;
      g.fillRect(30, 32, 28, 12);
      g.fillStyle = leatherH;
      g.fillRect(32, 32, 10, 4);
    } else if (tier === 'medium') {
      g.fillStyle = steelS;
      g.beginPath();
      g.arc(44, 44, 15, Math.PI, 0);
      g.fill();
      g.fillStyle = steel;
      g.beginPath();
      g.arc(44, 46, 14, Math.PI, Math.PI * 1.7);
      g.fill();
      poly(g, [30, 40, 18, 16, 34, 36], '#d7c48a', steelS);
      poly(g, [58, 40, 70, 16, 54, 36], '#d7c48a', steelS);
    } else {
      circ(g, 44, 46, 16, steelS);
      circ(g, 46, 44, 13, steel, 'rgba(255,255,255,0.45)');
      g.fillStyle = '#16120e';
      g.fillRect(34, 44, 20, 5);
      poly(g, [28, 40, 16, 18, 32, 36], steel, steelH);
      poly(g, [60, 40, 72, 18, 56, 36], steel, steelH);
    }
  });
}

/** Shaded barbarian. Feet are (x, y); height is the draw height. */
export function paintBarbarian(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  height: number,
  swing: number,
  lean: number,
  screen: number,
  tier: ArmorTier,
  bob: number,
  attack: AttackPose,
  ally: boolean,
): void {
  const h = height;
  const fwdX = Math.cos(screen);
  const fwdY = Math.sin(screen);
  const sideX = -fwdY;
  const sideY = fwdX;
  const step = swing * h * (lean > 0.3 ? 0.16 : lean > 0 ? 0.11 : 0.02);
  shadow(ctx, x, y, h * 0.26, h * 0.09);
  teamRing(ctx, x, y, h, ally);
  ctx.save();
  ctx.translate(x, y + bob);
  const hipY = -h * 0.4;
  const leg = (sign: number) => {
    ctx.strokeStyle = '#3a2418';
    ctx.lineWidth = Math.max(2.5, h * 0.055);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sideX * h * 0.05 * sign, hipY);
    ctx.lineTo(sideX * step * sign, sideY * step * sign);
    ctx.stroke();
    ctx.strokeStyle = '#6a4030';
    ctx.lineWidth = Math.max(1.5, h * 0.028);
    ctx.stroke();
  };
  leg(1);
  leg(-1);
  const wind = attack === 'raise' ? 1 : 0;
  ctx.translate(fwdX * lean * h * 0.28 - fwdX * h * 0.06 * wind, fwdY * lean * h * 0.28 - fwdY * h * 0.06 * wind);
  const body = torsoStamp(tier);
  const dw = h * (body.width / body.height);
  ctx.drawImage(body, -dw / 2, -h, dw, h);
  const arm = (sign: number, weapon: 'sword' | 'axe') => {
    const back = attack === 'raise' ? 1 : attack === 'swing' ? -0.2 : attack === 'follow' ? 0.28 : 0;
    const ax = sideX * h * 0.24 * sign - fwdX * h * 0.2 * back + (attack === 'none' ? -sideX * step * sign * 0.85 : 0);
    const ay = -h * 0.58 - h * 0.2 * back + (attack === 'none' ? -sideY * step * sign * 0.4 : 0);
    ctx.strokeStyle = '#8a5438';
    ctx.lineWidth = Math.max(2.5, h * 0.05);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sideX * h * 0.12 * sign, -h * 0.64);
    ctx.lineTo(ax, ay);
    ctx.stroke();
    ctx.strokeStyle = '#c48a62';
    ctx.lineWidth = Math.max(1.25, h * 0.02);
    ctx.stroke();
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(screen + (attack === 'raise' ? -1.9 : attack === 'swing' ? 1.6 : attack === 'follow' ? 0.32 : swing * 0.7) * sign);
    ctx.fillStyle = '#8a7048';
    ctx.fillRect(-h * 0.045, -h * 0.02, h * 0.09, h * 0.045);
    if (weapon === 'sword') {
      ctx.fillStyle = '#8e98a2';
      ctx.fillRect(-h * 0.018, -h * 0.4, h * 0.036, h * 0.38);
      ctx.fillStyle = '#e8eef4';
      ctx.fillRect(-h * 0.004, -h * 0.4, h * 0.01, h * 0.34);
      ctx.fillStyle = '#6a4030';
      ctx.fillRect(-h * 0.06, -h * 0.03, h * 0.12, h * 0.03);
    } else {
      ctx.fillStyle = '#9aa4ae';
      ctx.beginPath();
      ctx.moveTo(0, -h * 0.28);
      ctx.lineTo(h * 0.14, -h * 0.08);
      ctx.lineTo(h * 0.02, -h * 0.02);
      ctx.lineTo(-h * 0.06, -h * 0.1);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#e8eef4';
      ctx.beginPath();
      ctx.moveTo(0, -h * 0.26);
      ctx.lineTo(h * 0.08, -h * 0.12);
      ctx.lineTo(0, -h * 0.08);
      ctx.fill();
      ctx.fillStyle = '#5c4030';
      ctx.fillRect(-h * 0.018, -h * 0.02, h * 0.036, h * 0.16);
    }
    ctx.restore();
  };
  arm(-1, 'sword');
  arm(1, 'axe');
  ctx.restore();
}

function upperStamp(kind: CreatureKind, ally: boolean): HTMLCanvasElement {
  return stamp(`mob-${kind}-${ally ? 'a' : 'e'}`, 96, 128, (g) => {
    if (kind === 'fallen') {
      poly(g, [20, 96, 78, 90, 70, 48, 40, 58], '#4a1410');
      circ(g, 58, 46, 16, '#8a2a22', '#e07a4a');
      circ(g, 64, 44, 3, '#f0d080');
      poly(g, [46, 40, 34, 18, 50, 36], '#c45a3a');
      poly(g, [18, 70, 36, 78, 28, 98], '#6a2418');
    } else if (kind === 'goatman') {
      poly(g, [34, 100, 62, 100, 58, 52, 38, 52], '#5a3418');
      poly(g, [30, 78, 66, 70, 60, 40, 36, 48], '#7a4a28', '#e0b070');
      circ(g, 48, 36, 14, '#c4a060');
      poly(g, [36, 30, 24, 8, 42, 28], '#e6d3a1');
      poly(g, [60, 30, 74, 6, 54, 28], '#e6d3a1');
      circ(g, 44, 36, 2, '#1a120c');
      circ(g, 54, 36, 2, '#1a120c');
      poly(g, [40, 44, 48, 52, 56, 44], '#3a2a20');
    } else if (kind === 'bovine') {
      poly(g, [14, 108, 82, 108, 76, 46, 20, 46], '#6a5344');
      poly(g, [22, 100, 74, 96, 68, 52, 28, 56], '#c4a06a', '#f0e2c8');
      circ(g, 48, 40, 16, '#d7c4a4');
      poly(g, [34, 34, 22, 8, 40, 30], '#e6dcc8');
      poly(g, [62, 34, 76, 8, 56, 30], '#e6dcc8');
      g.fillStyle = '#2a2018';
      g.fillRect(38, 44, 16, 6);
      circ(g, 36, 40, 2, '#1a120c');
      circ(g, 58, 40, 2, '#1a120c');
    } else if (kind === 'raider') {
      poly(g, [30, 110, 66, 110, 60, 48, 36, 48], '#6a5438');
      poly(g, [34, 100, 62, 96, 56, 52, 40, 56], '#c2a36a', '#e6d2a4');
      circ(g, 48, 40, 12, '#d8b898');
      poly(g, [32, 36, 48, 16, 64, 36, 48, 44], '#3a3428');
      g.fillStyle = '#8a3030';
      g.fillRect(40, 34, 16, 4);
    } else if (kind === 'blunder') {
      circ(g, 48, 78, 30, '#4a3c30');
      circ(g, 48, 74, 26, '#7a6248', '#c4b49a');
      circ(g, 48, 40, 12, '#d2b8a0');
      circ(g, 43, 40, 2, '#1a120c');
      circ(g, 53, 40, 2, '#1a120c');
      g.fillStyle = '#3a3028';
      g.fillRect(28, 70, 40, 6);
    } else if (kind === 'destruction') {
      poly(g, [22, 110, 74, 110, 80, 48, 16, 52], '#2a1214');
      poly(g, [28, 100, 68, 96, 72, 50, 26, 54], '#6e1c18', '#c45a3a');
      circ(g, 48, 38, 14, '#8a2420');
      poly(g, [34, 32, 18, 4, 40, 28], '#1a0c0c');
      poly(g, [62, 32, 80, 2, 56, 28], '#1a0c0c');
      circ(g, 42, 38, 2, '#f0c14a');
      circ(g, 56, 38, 2, '#f0c14a');
      poly(g, [70, 60, 90, 40, 78, 78], '#4a1410');
    } else if (kind === 'rogue') {
      poly(g, [34, 112, 62, 112, 66, 40, 30, 44], '#243024');
      poly(g, [36, 100, 60, 96, 58, 46, 38, 50], ally ? '#3e5a38' : '#4a3030', '#d7c48a');
      poly(g, [30, 48, 48, 18, 66, 48, 48, 58], '#2a241c');
      circ(g, 48, 46, 7, '#e0c2a4');
    } else if (kind === 'guard') {
      poly(g, [32, 110, 64, 110, 60, 50, 36, 50], '#3a4048');
      poly(g, [36, 100, 60, 96, 56, 52, 40, 56], '#d9d3c4', '#6a93a8');
      circ(g, 48, 40, 11, '#c4a574');
      poly(g, [32, 36, 48, 16, 64, 36, 48, 42], '#f4ecd2');
      g.fillStyle = '#1a2430';
      g.fillRect(34, 34, 28, 3);
      circ(g, 22, 70, 12, '#8a93a0', '#e6ebf2');
      g.fillStyle = '#6a5038';
      g.fillRect(16, 62, 12, 16);
    } else if (kind === 'valkyrie') {
      poly(g, [34, 110, 62, 110, 58, 48, 38, 48], '#8a7040');
      poly(g, [36, 100, 60, 94, 56, 50, 40, 54], '#e0c878', '#fff2c4');
      circ(g, 48, 38, 11, '#f4ecd2');
      poly(g, [30, 30, 18, 22, 28, 40], '#f4ecd2');
      poly(g, [66, 30, 78, 22, 68, 40], '#f4ecd2');
      poly(g, [16, 60, 34, 50, 30, 78], 'rgba(240,236,210,0.9)');
      poly(g, [80, 60, 62, 50, 66, 78], 'rgba(240,236,210,0.9)');
      g.fillStyle = '#c4a050';
      g.fillRect(40, 26, 16, 6);
    } else if (kind === 'mummy') {
      poly(g, [32, 112, 64, 112, 58, 36, 38, 36], '#8a7048');
      poly(g, [36, 104, 60, 100, 56, 40, 40, 44], '#e6dcc4', '#5a4830');
      for (let row = 0; row < 5; row++) {
        g.strokeStyle = '#8a7048';
        g.beginPath();
        g.moveTo(38, 48 + row * 12);
        g.lineTo(58, 44 + row * 12);
        g.stroke();
      }
      circ(g, 48, 32, 8, '#d9c7a2');
      circ(g, 45, 32, 1.5, '#3a2418');
      circ(g, 52, 32, 1.5, '#3a2418');
    } else if (kind === 'quill') {
      circ(g, 48, 78, 22, '#4a3a2c');
      circ(g, 48, 74, 16, '#a67c4e', '#e6d3a1');
      for (const [px, py] of [
        [30, 60],
        [66, 58],
        [48, 48],
        [24, 78],
        [72, 76],
      ] as const) {
        poly(g, [px, py, px - 6, py - 16, px + 4, py - 4], '#d2c2a4');
      }
    } else {
      circ(g, 48, 70, 18, '#2a6a68');
      circ(g, 48, 68, 10, '#d8fff8');
    }
  });
}

function limb(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color: string, width: number): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

function liveWeapon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  h: number,
  swing: number,
  kind: CreatureKind,
  attack: AttackPose,
): void {
  const angle = attack === 'raise' ? -1.7 : attack === 'swing' ? 1.35 : attack === 'follow' ? 0.4 : swing * 0.8;
  ctx.save();
  ctx.translate(x + h * 0.16, y - h * 0.52);
  ctx.rotate(angle);
  ctx.fillStyle = '#d7c48a';
  ctx.strokeStyle = '#d7c48a';
  ctx.lineWidth = Math.max(1.5, h * 0.03);
  if (kind === 'goatman' || kind === 'bovine' || kind === 'guard' || kind === 'valkyrie') {
    ctx.beginPath();
    ctx.moveTo(0, h * 0.16);
    ctx.lineTo(0, -h * (kind === 'bovine' ? 0.46 : 0.36));
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -h * 0.4);
    ctx.lineTo(h * 0.08, -h * 0.26);
    ctx.lineTo(-h * 0.08, -h * 0.26);
    ctx.fill();
  } else if (kind === 'blunder' || kind === 'fallen') {
    ctx.fillStyle = '#6a5038';
    ctx.fillRect(-h * 0.03, 0, h * 0.06, h * 0.16);
    circ(ctx, 0, -h * 0.02, h * 0.07, '#5a4030');
  } else if (kind === 'quill' || kind === 'mummy' || kind === 'wisp' || kind === 'rogue') {
    /* body carries the read */
  } else {
    ctx.fillStyle = '#c5ced6';
    ctx.fillRect(-h * 0.015, -h * 0.28, h * 0.03, h * 0.28);
    ctx.fillStyle = '#e8eef4';
    ctx.fillRect(-h * 0.004, -h * 0.28, h * 0.008, h * 0.22);
  }
  ctx.restore();
  if (kind === 'rogue') {
    ctx.save();
    ctx.translate(x + h * 0.12, y - h * 0.58);
    ctx.rotate(angle * 0.25);
    ctx.strokeStyle = '#e6d3a1';
    ctx.lineWidth = Math.max(1.5, h * 0.025);
    ctx.beginPath();
    ctx.arc(0, 0, h * 0.16, -1.15, 1.15);
    ctx.stroke();
    ctx.restore();
  }
}

/** Walk-cycled creature. The upper body is a cached stamp. */
export function paintCreature(
  ctx: CanvasRenderingContext2D,
  kind: CreatureKind,
  x: number,
  y: number,
  h: number,
  swing: number,
  ally: boolean,
  attack: AttackPose,
): void {
  shadow(ctx, x, y, h * (kind === 'bovine' || kind === 'blunder' ? 0.32 : 0.22), h * 0.08);
  teamRing(ctx, x, y, h, ally);
  if (kind === 'wisp') {
    const bob = Math.abs(swing) * h * 0.06;
    circ(ctx, x, y - h * 0.55 - bob, h * 0.22, '#1a4a48');
    circ(ctx, x, y - h * 0.55 - bob, h * 0.12, '#e8fff8');
    return;
  }
  const body = upperStamp(kind, ally);
  const dw = h * (body.width / body.height);
  const bob = Math.abs(swing) * h * 0.03;
  ctx.drawImage(body, x - dw / 2, y - h - bob, dw, h);
  if (kind !== 'quill') {
    const step = swing * h * 0.1;
    const ink = kind === 'valkyrie' ? '#8a7040' : kind === 'destruction' ? '#2a1214' : '#2a2018';
    const hip = y - h * (kind === 'fallen' ? 0.28 : kind === 'blunder' ? 0.22 : 0.36);
    limb(ctx, x - h * 0.06, hip, x - h * 0.1 + step, y, ink, Math.max(2, h * 0.035));
    limb(ctx, x + h * 0.06, hip, x + h * 0.1 - step, y, ink, Math.max(2, h * 0.035));
    limb(ctx, x - h * 0.16, y - h * 0.5, x - h * 0.22 - step * 0.6, y - h * 0.28, ink, Math.max(1.5, h * 0.03));
  }
  liveWeapon(ctx, x, y - bob, h, swing, kind, attack);
}

export function paintBoss(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  h: number,
  mark: BossMark,
  swing: number,
  ally: boolean,
  attack: AttackPose,
  time: number,
): void {
  const floatY = mark === 'mephisto' ? y - h * 0.08 - Math.sin(time * 2) * 4 : y;
  shadow(ctx, x, y, h * 0.34, h * 0.11);
  teamRing(ctx, x, y, h, ally);
  if (mark === 'diablo') {
    poly(ctx, [x - h * 0.28, floatY - h * 0.2, x + h * 0.28, floatY - h * 0.2, x + h * 0.16, floatY - h * 0.72, x - h * 0.16, floatY - h * 0.72], '#4a100e');
    poly(ctx, [x - h * 0.2, floatY - h * 0.28, x + h * 0.2, floatY - h * 0.28, x + h * 0.1, floatY - h * 0.7, x - h * 0.1, floatY - h * 0.7], '#8a1c16', '#e07058');
    for (const sign of [-1, 0, 1]) {
      poly(ctx, [
        x + sign * h * 0.08,
        floatY - h * 0.55,
        x + sign * h * 0.16,
        floatY - h * 0.92,
        x + sign * h * 0.02,
        floatY - h * 0.58,
      ], '#2a0c0c');
    }
    circ(ctx, x, floatY - h * 0.78, h * 0.1, '#6e1c18');
    poly(ctx, [x - h * 0.08, floatY - h * 0.84, x - h * 0.22, floatY - h, x - h * 0.02, floatY - h * 0.8], '#1a0c0c');
    poly(ctx, [x + h * 0.08, floatY - h * 0.84, x + h * 0.22, floatY - h, x + h * 0.02, floatY - h * 0.8], '#1a0c0c');
    circ(ctx, x - h * 0.04, floatY - h * 0.78, h * 0.015, '#f0c14a');
    circ(ctx, x + h * 0.04, floatY - h * 0.78, h * 0.015, '#f0c14a');
    const claw = attack === 'swing' ? h * 0.2 : attack === 'raise' ? -h * 0.08 : swing * h * 0.06;
    poly(ctx, [x + h * 0.16, floatY - h * 0.45, x + h * 0.4, floatY - h * 0.35 + claw, x + h * 0.34, floatY - h * 0.22 + claw], '#3a1010');
  } else if (mark === 'mephisto') {
    ctx.fillStyle = 'rgba(80, 140, 255, 0.16)';
    ctx.beginPath();
    ctx.arc(x, floatY - h * 0.45, h * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(140, 190, 255, 0.22)';
    ctx.beginPath();
    ctx.arc(x, floatY - h * 0.5, h * 0.16, 0, Math.PI * 2);
    ctx.fill();
    poly(ctx, [x, floatY - h * 0.92, x + h * 0.28, floatY - h * 0.15, x - h * 0.28, floatY - h * 0.15], '#141820');
    poly(ctx, [x, floatY - h * 0.86, x + h * 0.16, floatY - h * 0.2, x - h * 0.16, floatY - h * 0.2], '#243044', '#7eb0e0');
    circ(ctx, x, floatY - h * 0.78, h * 0.07, '#e6dcc8');
    circ(ctx, x - h * 0.025, floatY - h * 0.79, h * 0.012, '#1a2430');
    circ(ctx, x + h * 0.025, floatY - h * 0.79, h * 0.012, '#1a2430');
    poly(ctx, [x - h * 0.1, floatY - h * 0.7, x, floatY - h * 0.95, x + h * 0.1, floatY - h * 0.7], '#1a2438');
  } else if (mark === 'duriel') {
    const seg = (ox: number, oy: number, rx: number, ry: number, fill: string) => {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.ellipse(x + ox + swing * 4, floatY - oy, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    };
    seg(0, h * 0.28, h * 0.3, h * 0.16, '#5a4a38');
    seg(h * 0.02, h * 0.48, h * 0.24, h * 0.14, '#8a7a62');
    seg(-h * 0.02, h * 0.66, h * 0.16, h * 0.1, '#c4b496');
    circ(ctx, x + h * 0.08, floatY - h * 0.7, h * 0.05, '#2a2018');
    circ(ctx, x + h * 0.1, floatY - h * 0.71, h * 0.015, '#e0d0a0');
    poly(ctx, [x - h * 0.2, floatY - h * 0.2, x - h * 0.42, floatY - h * 0.05, x - h * 0.16, floatY - h * 0.08], '#6a5a40');
    poly(ctx, [x + h * 0.18, floatY - h * 0.24, x + h * 0.4, floatY - h * 0.08 + swing * 6, x + h * 0.14, floatY - h * 0.1], '#6a5a40');
  } else {
    poly(ctx, [x - h * 0.16, floatY - h * 0.15, x + h * 0.2, floatY - h * 0.15, x + h * 0.1, floatY - h * 0.78, x - h * 0.12, floatY - h * 0.7], '#3a1014');
    poly(ctx, [x - h * 0.08, floatY - h * 0.25, x + h * 0.12, floatY - h * 0.22, x + h * 0.06, floatY - h * 0.72, x - h * 0.06, floatY - h * 0.68], '#8a2428', '#e07070');
    poly(ctx, [x - h * 0.1, floatY - h * 0.62, x, floatY - h * 0.9, x + h * 0.12, floatY - h * 0.62], '#1a0c0e');
    circ(ctx, x, floatY - h * 0.64, h * 0.055, '#d8c8b0');
    circ(ctx, x - h * 0.02, floatY - h * 0.65, h * 0.01, '#1a0c0e');
    circ(ctx, x + h * 0.02, floatY - h * 0.65, h * 0.01, '#1a0c0e');
    const pull = attack === 'raise' ? -0.5 : attack === 'swing' ? 0.4 : swing * 0.2;
    ctx.save();
    ctx.translate(x + h * 0.12, floatY - h * 0.5);
    ctx.rotate(pull);
    ctx.strokeStyle = '#e6d3a1';
    ctx.lineWidth = Math.max(1.5, h * 0.02);
    ctx.beginPath();
    ctx.arc(0, 0, h * 0.16, -1.2, 1.1);
    ctx.stroke();
    ctx.restore();
  }
}

export function paintSpire(ctx: CanvasRenderingContext2D, x: number, y: number, height: number, ally: boolean, alive: boolean): void {
  const h = alive ? height : height * 0.55;
  shadow(ctx, x, y, h * 0.28, h * 0.1);
  ctx.fillStyle = '#5a5148';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + h * 0.28, y - h * 0.12);
  ctx.lineTo(x, y - h * 0.24);
  ctx.lineTo(x - h * 0.28, y - h * 0.12);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#7a7164';
  ctx.beginPath();
  ctx.moveTo(x, y - h * 0.16);
  ctx.lineTo(x + h * 0.16, y - h * 0.4);
  ctx.lineTo(x, y - h * 0.48);
  ctx.lineTo(x - h * 0.16, y - h * 0.4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#3e3830';
  ctx.beginPath();
  ctx.moveTo(x, y - h * 0.44);
  ctx.lineTo(x + h * 0.07, y - h * 0.78);
  ctx.lineTo(x, y - h);
  ctx.lineTo(x - h * 0.07, y - h * 0.78);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x - h * 0.04, y - h * 0.3);
  ctx.lineTo(x + h * 0.02, y - h * 0.7);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,230,190,0.35)';
  ctx.beginPath();
  ctx.moveTo(x - h * 0.08, y - h * 0.5);
  ctx.lineTo(x, y - h * 0.62);
  ctx.lineTo(x + h * 0.06, y - h * 0.48);
  ctx.stroke();
  if (!alive) return;
  const core = ally ? '#6aa7ff' : '#e4553c';
  ctx.fillStyle = ally ? 'rgba(80,150,255,0.35)' : 'rgba(220,60,40,0.38)';
  ctx.beginPath();
  ctx.arc(x, y - h * 0.55, h * 0.14, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = core;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, y - h * 0.62);
  ctx.lineTo(x + h * 0.05, y - h * 0.55);
  ctx.lineTo(x, y - h * 0.48);
  ctx.lineTo(x - h * 0.05, y - h * 0.55);
  ctx.closePath();
  ctx.stroke();
  ctx.fillStyle = '#fff6d8';
  ctx.beginPath();
  ctx.arc(x, y - h * 0.55, h * 0.03, 0, Math.PI * 2);
  ctx.fill();
}

export function paintStronghold(ctx: CanvasRenderingContext2D, x: number, y: number, height: number, ally: boolean, alive: boolean): void {
  const h = alive ? height : height * 0.55;
  shadow(ctx, x, y, h * 0.4, h * 0.12);
  if (ally) {
    ctx.fillStyle = '#5a4030';
    for (const ox of [-0.42, -0.28, 0.28, 0.42]) {
      ctx.beginPath();
      ctx.moveTo(x + ox * h, y);
      ctx.lineTo(x + ox * h, y - h * 0.28);
      ctx.lineTo(x + ox * h + h * 0.03, y - h * 0.34);
      ctx.lineTo(x + ox * h + h * 0.05, y);
      ctx.fill();
    }
    ctx.fillStyle = '#6b4e34';
    ctx.fillRect(x - h * 0.16, y - h * 0.62, h * 0.32, h * 0.4);
    ctx.fillStyle = '#8a6844';
    ctx.fillRect(x - h * 0.16, y - h * 0.62, h * 0.08, h * 0.4);
    ctx.fillStyle = '#3a2418';
    ctx.fillRect(x - h * 0.05, y - h * 0.28, h * 0.1, h * 0.16);
    poly(ctx, [x + h * 0.28, y - h * 0.4, x + h * 0.48, y - h * 0.08, x + h * 0.22, y - h * 0.08], '#8a7a5c', '#3a2418');
    ctx.fillStyle = '#6a5038';
    ctx.fillRect(x - h * 0.42, y - h * 0.2, h * 0.16, h * 0.1);
    ctx.fillStyle = '#c4b070';
    ctx.fillRect(x - h * 0.4, y - h * 0.2, h * 0.12, 2);
    ctx.fillStyle = '#6aa7ff';
    ctx.beginPath();
    ctx.moveTo(x, y - h * 0.7);
    ctx.lineTo(x, y - h * 0.95);
    ctx.lineTo(x + h * 0.14, y - h * 0.84);
    ctx.fill();
  } else {
    ctx.fillStyle = '#2a242c';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + h * 0.4, y - h * 0.14);
    ctx.lineTo(x, y - h * 0.28);
    ctx.lineTo(x - h * 0.4, y - h * 0.14);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#1a141c';
    ctx.fillRect(x - h * 0.16, y - h * 0.7, h * 0.32, h * 0.46);
    ctx.fillStyle = '#3a3038';
    ctx.fillRect(x - h * 0.16, y - h * 0.7, h * 0.08, h * 0.46);
    ctx.fillStyle = '#e4553c';
    ctx.fillRect(x - h * 0.05, y - h * 0.48, h * 0.1, h * 0.12);
    ctx.fillStyle = 'rgba(220,60,40,0.4)';
    ctx.beginPath();
    ctx.arc(x, y - h * 0.42, h * 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#4a1010';
    for (const ox of [-0.22, 0.22]) {
      ctx.beginPath();
      ctx.moveTo(x + ox * h, y - h * 0.16);
      ctx.lineTo(x + ox * h - h * 0.04, y - h * 0.32);
      ctx.lineTo(x + ox * h + h * 0.04, y - h * 0.16);
      ctx.fill();
    }
    ctx.fillStyle = '#e4553c';
    ctx.beginPath();
    ctx.moveTo(x, y - h * 0.74);
    ctx.lineTo(x, y - h);
    ctx.lineTo(x + h * 0.12, y - h * 0.88);
    ctx.fill();
  }
  if (!alive) {
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.moveTo(x - h * 0.1, y - h * 0.5);
    ctx.lineTo(x + h * 0.12, y - h * 0.2);
    ctx.stroke();
  }
}

export function drawSlash(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, screen: number, k: number): void {
  ctx.save();
  ctx.translate(x, y - h * 0.5);
  ctx.rotate(screen);
  ctx.strokeStyle = `rgba(255, 236, 196, ${0.9 * k})`;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(0, 0, h * 0.42, -1.05, 0.75);
  ctx.stroke();
  ctx.strokeStyle = `rgba(255, 255, 255, ${0.55 * k})`;
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.arc(0, 0, h * 0.34, -0.8, 0.45);
  ctx.stroke();
  ctx.restore();
}

export function drawSpark(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, k: number): void {
  ctx.save();
  ctx.translate(x, y - h * 0.55);
  ctx.strokeStyle = `rgba(255, 236, 190, ${k})`;
  ctx.fillStyle = `rgba(255, 244, 210, ${k})`;
  ctx.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + 0.4;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 2, Math.sin(a) * 2);
    ctx.lineTo(Math.cos(a) * h * 0.16, Math.sin(a) * h * 0.16);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawRecall(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  h: number,
  recall: number,
  max: number,
  time: number,
): void {
  const fill = Math.max(0, Math.min(1, 1 - recall / max));
  const sec = Math.max(0, Math.ceil(recall - 1e-4));
  const r = 12 + fill * 22;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(time * 2.4);
  ctx.strokeStyle = `rgba(120, 186, 255, ${0.35 + fill * 0.55})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0.2, Math.PI * 1.35);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.62, Math.PI, Math.PI * 2.2);
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = `rgba(140, 196, 255, ${0.16 + fill * 0.28})`;
  ctx.beginPath();
  ctx.ellipse(x, y, r * 1.35, r * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  const cx = x;
  const cy = y - h - 18;
  ctx.strokeStyle = 'rgba(80, 140, 220, 0.4)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, 12, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = '#9fd4ff';
  ctx.beginPath();
  ctx.arc(cx, cy, 12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * fill);
  ctx.stroke();
  ctx.fillStyle = '#e8f4ff';
  ctx.font = 'bold 12px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(sec), cx, cy);
  ctx.textBaseline = 'alphabetic';
}

export function drawPortal(ctx: CanvasRenderingContext2D, x: number, y: number, k: number): void {
  const r = 16 + (1 - k) * 30;
  ctx.save();
  ctx.globalAlpha = Math.max(0, k);
  ctx.strokeStyle = '#b7dcff';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(x, y, r, r * 0.42, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = `rgba(170, 214, 255, ${0.35 * k})`;
  ctx.beginPath();
  ctx.ellipse(x, y - 24 * k, 10, 32, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawBolt(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, heavy: boolean): void {
  ctx.fillStyle = color;
  ctx.globalAlpha = heavy ? 0.45 : 0.35;
  ctx.beginPath();
  ctx.arc(x, y, heavy ? 14 : 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#fff6d2';
  ctx.beginPath();
  ctx.arc(x, y, heavy ? 3.5 : 2.2, 0, Math.PI * 2);
  ctx.fill();
  if (!heavy) return;
  ctx.strokeStyle = 'rgba(255, 220, 180, 0.85)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x - 7, y);
  ctx.lineTo(x + 7, y);
  ctx.moveTo(x, y - 7);
  ctx.lineTo(x, y + 7);
  ctx.stroke();
}

export function drawFire(ctx: CanvasRenderingContext2D, x: number, y: number, time: number, hell: boolean, blue = false): void {
  const flick = 0.82 + Math.sin(time * 11 + (hell ? 1 : 0)) * 0.18;
  const radius = 30 * flick;
  ctx.fillStyle = blue ? 'rgba(80, 130, 255, 0.28)' : hell ? 'rgba(255, 90, 40, 0.28)' : 'rgba(255, 176, 72, 0.26)';
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = blue ? '#5a8cf0' : hell ? '#e05030' : '#e8a040';
  ctx.beginPath();
  ctx.moveTo(x - 4, y + 2);
  ctx.lineTo(x, y - 14 * flick);
  ctx.lineTo(x + 4, y + 2);
  ctx.fill();
  ctx.fillStyle = '#fff0c8';
  ctx.beginPath();
  ctx.moveTo(x - 2, y);
  ctx.lineTo(x, y - 8 * flick);
  ctx.lineTo(x + 2, y);
  ctx.fill();
}
