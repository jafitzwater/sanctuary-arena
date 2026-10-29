/**
 * ORDER "Map size and Diablo 2 theme from reference" item 3 [JOSEPH]: procedural Diablo 2 act themes per map zone.
 * All art here is drawn in code (no image files, no third-party or reference art): Blood Moor / Rogue Encampment
 * keep the existing paint; Dry Hills and the desert jungle get sand and sandstone; Spider Forest and the dense
 * jungle get dark canopy, swamp pools and mossy temple slabs; River of Flame, the lava field and the lava river get
 * cracked basalt and glowing lava; Pandemonium gets dark hell stone with ember runes.
 *
 * Flat decals sit inside the tile (walkable ground looks walkable). Tall features (canopy, sandstone, obsidian)
 * are only painted on tiles that are already not walkable (the map border), so nothing new looks like a wall.
 */
import type { ZoneId } from '../data/mapZones';
import { TREE_OUTLINE_INK } from '../readability';

function hash(i: number, j: number): number {
  const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export type ThemeFamily = 'forest' | 'jungle' | 'desert' | 'fire' | 'hell';

export function themeFamily(zone: ZoneId): ThemeFamily {
  switch (zone) {
    case 'dry-hills':
    case 'jungle-desert':
      return 'desert';
    case 'spider-forest':
    case 'jungle-dense':
      return 'jungle';
    case 'river-of-flame':
    case 'jungle-lava':
    case 'lava-river':
      return 'fire';
    case 'pandemonium-fortress':
      return 'hell';
    default:
      return 'forest';
  }
}

/** Flat per-tile decal (already clipped to the tile diamond by the caller). */
export function paintZoneDecal(
  ctx: CanvasRenderingContext2D,
  zone: ZoneId,
  kind: string,
  i: number,
  j: number,
  sx: number,
  sy: number,
): void {
  const n = hash(i * 3 + 1, j * 7 + 2);
  const m = hash(j * 5 + 3, i * 2 + 9);
  const road = kind === 'path';
  switch (zone) {
    case 'dry-hills':
    case 'jungle-desert': {
      if (road) {
        ctx.fillStyle = 'rgba(160, 130, 90, 0.18)';
        ctx.fillRect(sx - 30 + n * 20, sy - 8, 22, 6);
        return;
      }
      // Wind ripples and pebbles.
      ctx.strokeStyle = 'rgba(150, 120, 78, 0.45)';
      ctx.lineWidth = 1;
      for (let r = 0; r < 3; r++) {
        const y = sy - 14 + r * 12 + n * 4;
        ctx.beginPath();
        ctx.moveTo(sx - 46 + m * 10, y);
        ctx.quadraticCurveTo(sx - 10, y - 5, sx + 40 - m * 8, y + 2);
        ctx.stroke();
      }
      if (n > 0.7) {
        ctx.fillStyle = 'rgba(60, 44, 28, 0.6)';
        ctx.fillRect(sx - 12 + m * 24, sy + 4, 4, 2);
        ctx.fillRect(sx + 6 - m * 10, sy - 6, 3, 2);
      }
      if (n < 0.08) {
        // Dry scrub.
        ctx.strokeStyle = 'rgba(90, 80, 40, 0.8)';
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx - 5, sy - 6);
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + 4, sy - 7);
        ctx.stroke();
      }
      return;
    }
    case 'spider-forest':
    case 'jungle-dense': {
      if (road) {
        // Act 3 temple slabs: big mossy flagstones.
        ctx.strokeStyle = 'rgba(16, 22, 14, 0.7)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(sx - 40, sy - 20);
        ctx.lineTo(sx + 40, sy + 20);
        ctx.moveTo(sx - 40, sy + 20);
        ctx.lineTo(sx + 40, sy - 20);
        ctx.stroke();
        ctx.fillStyle = 'rgba(70, 110, 50, 0.32)';
        ctx.beginPath();
        ctx.ellipse(sx - 14 + n * 28, sy - 4 + m * 8, 10, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        return;
      }
      if (zone === 'spider-forest' && n > 0.78) {
        // Swamp pool.
        ctx.fillStyle = 'rgba(28, 48, 40, 0.85)';
        ctx.beginPath();
        ctx.ellipse(sx - 6 + m * 12, sy, 26, 10, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(90, 120, 80, 0.4)';
        ctx.lineWidth = 1;
        ctx.stroke();
        return;
      }
      // Ferns.
      ctx.strokeStyle = zone === 'jungle-dense' ? 'rgba(40, 90, 34, 0.75)' : 'rgba(50, 96, 44, 0.65)';
      ctx.lineWidth = 1.2;
      const count = 2 + Math.floor(n * 3);
      for (let k = 0; k < count; k++) {
        const fx = sx - 36 + hash(i + k, j - k) * 72;
        const fy = sy - 12 + hash(j + k, i - k) * 24;
        ctx.beginPath();
        ctx.moveTo(fx, fy);
        ctx.lineTo(fx - 6, fy - 7);
        ctx.moveTo(fx, fy);
        ctx.lineTo(fx + 6, fy - 6);
        ctx.moveTo(fx, fy);
        ctx.lineTo(fx, fy - 9);
        ctx.stroke();
      }
      return;
    }
    case 'jungle-plains': {
      if (road) return;
      ctx.strokeStyle = 'rgba(150, 150, 70, 0.5)';
      ctx.lineWidth = 1;
      for (let k = 0; k < 4; k++) {
        const fx = sx - 40 + hash(i + k * 2, j) * 80;
        const fy = sy - 14 + hash(j, i + k * 2) * 28;
        ctx.beginPath();
        ctx.moveTo(fx, fy);
        ctx.lineTo(fx - 2, fy - 6);
        ctx.moveTo(fx + 2, fy);
        ctx.lineTo(fx + 3, fy - 5);
        ctx.stroke();
      }
      return;
    }
    case 'river-of-flame':
    case 'jungle-lava':
    case 'lava-river':
    case 'pandemonium-fortress': {
      // Cracked ground with glowing seams.
      const hell = zone === 'pandemonium-fortress';
      const glow = road ? 0.35 : zone === 'jungle-lava' ? 0.85 : 0.65;
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = hell ? `rgba(200, 50, 30, ${glow * 0.7})` : `rgba(255, 110, 30, ${glow})`;
      ctx.beginPath();
      let x = sx - 44 + n * 20;
      let y = sy - 6 + m * 12;
      ctx.moveTo(x, y);
      for (let k = 0; k < 4; k++) {
        x += 16 + hash(i + k, j) * 8;
        y += (hash(j, i + k) - 0.5) * 16;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
      if (!road && zone === 'jungle-lava' && n > 0.8) {
        // Small lava pool (flat; walking over it does nothing, as before).
        const g = ctx.createRadialGradient(sx, sy, 2, sx, sy, 22);
        g.addColorStop(0, 'rgba(255, 200, 80, 0.95)');
        g.addColorStop(0.5, 'rgba(230, 90, 20, 0.85)');
        g.addColorStop(1, 'rgba(80, 20, 8, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(sx, sy, 24, 11, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      if (hell && !road && n > 0.85) {
        // Ember rune.
        ctx.strokeStyle = 'rgba(230, 80, 40, 0.55)';
        ctx.beginPath();
        ctx.ellipse(sx, sy, 12, 6, 0, 0, Math.PI * 2);
        ctx.moveTo(sx - 8, sy);
        ctx.lineTo(sx + 8, sy);
        ctx.stroke();
      }
      return;
    }
    default:
      return;
  }
}

/** Tall border feature on a not-walkable tile, drawn after the ground in screen-y order. */
export function paintBorderFeature(
  ctx: CanvasRenderingContext2D, zone: ZoneId, x: number, y: number, n: number, size = 1, outline = 0,
): void {
  const family = themeFamily(zone);
  if (family === 'forest' || family === 'jungle') {
    const dark = family === 'jungle';
    // Visual readability item 9: `size` is the paint-only edge tree size factor (1 = unchanged).
    const r = (26 + n * 16) * size;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(x, y + 4, r * 0.9, r * 0.38, 0, 0, Math.PI * 2);
    ctx.fill();
    const layers: [number, number, number, string][] = dark
      ? [[0, -r * 1.1, r, '#0c1a0c'], [-r * 0.4, -r * 1.35, r * 0.7, '#123016'], [r * 0.35, -r * 1.45, r * 0.6, '#1a3c1c']]
      : [[0, -r * 1.05, r, '#18260f'], [-r * 0.35, -r * 1.3, r * 0.7, '#22361a'], [r * 0.3, -r * 1.4, r * 0.55, '#2e4422']];
    if (outline > 0) {
      // Visual readability item 9 [JOSEPH t253u]: dark outline = the same trunk and canopy grown by `outline` px, behind.
      ctx.fillStyle = TREE_OUTLINE_INK;
      ctx.fillRect(x - 3 - outline, y - r * 0.9 - outline, 6 + outline * 2, r * 0.9 + outline);
      ctx.beginPath();
      for (const [dx, dy, rr] of layers) {
        ctx.moveTo(x + dx + rr + outline, y + dy);
        ctx.ellipse(x + dx, y + dy, rr + outline, rr * 0.8 + outline, 0, 0, Math.PI * 2);
      }
      ctx.fill();
    }
    ctx.fillStyle = dark ? '#2a1c12' : '#3a2a1a';
    ctx.fillRect(x - 3, y - r * 0.9, 6, r * 0.9);
    for (const [dx, dy, rr, color] of layers) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(x + dx, y + dy, rr, rr * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (dark && n > 0.6) {
      // Hanging vines / web.
      ctx.strokeStyle = 'rgba(200, 210, 200, 0.18)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x - r * 0.6, y - r * 1.2);
      ctx.lineTo(x - r * 0.2, y - r * 0.4);
      ctx.lineTo(x + r * 0.5, y - r * 1.1);
      ctx.stroke();
    }
    return;
  }
  if (family === 'desert') {
    // Sandstone outcrop.
    const w = 30 + n * 22;
    const h = 22 + n * 26;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(x, y + 3, w, w * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#6e5232';
    ctx.beginPath();
    ctx.moveTo(x - w, y);
    ctx.lineTo(x - w * 0.7, y - h);
    ctx.lineTo(x + w * 0.5, y - h * 1.1);
    ctx.lineTo(x + w, y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#94703e';
    ctx.beginPath();
    ctx.moveTo(x - w * 0.7, y - h);
    ctx.lineTo(x + w * 0.5, y - h * 1.1);
    ctx.lineTo(x + w * 0.3, y - h * 0.8);
    ctx.lineTo(x - w * 0.6, y - h * 0.75);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(40, 28, 16, 0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - w * 0.8, y - h * 0.4);
    ctx.lineTo(x + w * 0.8, y - h * 0.35);
    ctx.stroke();
    return;
  }
  // Fire / hell: obsidian spires with a lava glow at the foot.
  const h = 34 + n * 36;
  const glow = ctx.createRadialGradient(x, y, 2, x, y, 30);
  glow.addColorStop(0, family === 'hell' ? 'rgba(220, 60, 30, 0.55)' : 'rgba(255, 120, 30, 0.6)');
  glow.addColorStop(1, 'rgba(80, 10, 0, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.ellipse(x, y, 32, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  for (const [dx, k] of [[-10, 0.7], [6, 1], [16, 0.55]] as const) {
    ctx.fillStyle = family === 'hell' ? '#2a1418' : '#1a1210';
    ctx.beginPath();
    ctx.moveTo(x + dx - 8, y);
    ctx.lineTo(x + dx, y - h * k);
    ctx.lineTo(x + dx + 8, y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = family === 'hell' ? 'rgba(200, 50, 40, 0.5)' : 'rgba(255, 120, 40, 0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + dx, y - h * k);
    ctx.lineTo(x + dx + 3, y - h * k * 0.4);
    ctx.stroke();
  }
}

/** Continuous lava river ribbon: outer basalt crust, molten body, bright core (polygons in bake space). */
export function paintLavaRibbon(
  ctx: CanvasRenderingContext2D,
  layers: { crust: { x: number; y: number }[]; lava: { x: number; y: number }[]; core: { x: number; y: number }[] },
): void {
  const fill = (poly: { x: number; y: number }[], style: string | CanvasGradient) => {
    if (poly.length < 3) return;
    ctx.beginPath();
    ctx.moveTo(poly[0].x, poly[0].y);
    for (let k = 1; k < poly.length; k++) ctx.lineTo(poly[k].x, poly[k].y);
    ctx.closePath();
    ctx.fillStyle = style;
    ctx.fill();
  };
  fill(layers.crust, '#1c0e0a');
  fill(layers.lava, '#c2410c');
  ctx.save();
  ctx.globalAlpha = 0.85;
  fill(layers.core, '#ffb347');
  ctx.restore();
}

/** Stone bridge deck where a lane crosses the lava river (visual only; lanes were always walkable there). */
export function paintBridge(ctx: CanvasRenderingContext2D, deck: { x: number; y: number }[]): void {
  if (deck.length !== 4) return;
  ctx.beginPath();
  ctx.moveTo(deck[0].x, deck[0].y);
  for (let k = 1; k < 4; k++) ctx.lineTo(deck[k].x, deck[k].y);
  ctx.closePath();
  ctx.fillStyle = '#4a4440';
  ctx.fill();
  ctx.strokeStyle = '#1a1412';
  ctx.lineWidth = 3;
  ctx.stroke();
  // Rails along the long sides (0-1 and 2-3) and plank seams across.
  ctx.strokeStyle = '#7a6e62';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(deck[0].x, deck[0].y);
  ctx.lineTo(deck[1].x, deck[1].y);
  ctx.moveTo(deck[3].x, deck[3].y);
  ctx.lineTo(deck[2].x, deck[2].y);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(20, 14, 12, 0.55)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let k = 1; k < 8; k++) {
    const t = k / 8;
    ctx.moveTo(deck[0].x + (deck[1].x - deck[0].x) * t, deck[0].y + (deck[1].y - deck[0].y) * t);
    ctx.lineTo(deck[3].x + (deck[2].x - deck[3].x) * t, deck[3].y + (deck[2].y - deck[3].y) * t);
  }
  ctx.stroke();
}
