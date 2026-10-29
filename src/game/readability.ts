/**
 * Visual readability items 5-9 [JOSEPH t253u], code-side only: draw/bake values and pure helpers.
 * Rendering only. Nothing here touches collision, hitboxes, targeting, pathing, spawns, map size, speed,
 * abilities, items, skills, lighting or animations. Exact order values are [JOSEPH]; values chosen here are [TEMP].
 * The "clean up or regenerate blurry sprites" lines are held pending Joseph's art decision (not in this file).
 */

// ---- Item 5: characters ------------------------------------------------------------------------------------
/** Item 5 [JOSEPH]: dark outline around every character sprite, css px. */
export const CHARACTER_OUTLINE_PX = 2;
/** [TEMP] Outline ink (near-black, warm, D2 style). */
export const OUTLINE_INK = 'rgb(8, 6, 4)';
/** [TEMP] Outline opacity. */
export const OUTLINE_ALPHA = 0.85;
/** [TEMP] Local contrast stretch around each sheet's own mean luminance (1 = unchanged). */
export const CHARACTER_CONTRAST = 1.18;
/** [TEMP] Highlight at the top of each sprite cell (+8%), fading to... */
export const CHARACTER_TOP_LIGHT = 0.08;
/** [TEMP] ...a shade at the feet of each cell (-12%). */
export const CHARACTER_FOOT_SHADE = 0.12;

// ---- Item 6: towers ----------------------------------------------------------------------------------------
/** Item 6 [JOSEPH]: dark outline around tower sprites, css px. */
export const TOWER_OUTLINE_PX = 2;
/** [TEMP] Contrast stretch on the tower body so it stands out from the ground. */
export const STRUCTURE_CONTRAST = 1.22;
/** [TEMP] Stone platform under each tower: half-width as a fraction of the drawn height. */
export const TOWER_PLATFORM_W = 0.36;
/** [TEMP] Ground shadow under towers and bases (was 0.45 in d2look shadow()). */
export const STRUCTURE_SHADOW_ALPHA = 0.62;
/** [TEMP] Ground shadow size vs the old d2look ellipse. */
export const STRUCTURE_SHADOW_GROW = 1.25;

// ---- Item 8: base buildings --------------------------------------------------------------------------------
/** Item 8 [JOSEPH]: key base buildings drawn +10%. Visual only; unit radius / hitbox / targeting unchanged. */
export const BASE_VISUAL_SCALE = 1.1;
/** [TEMP] "Stronger outline" on base buildings, css px. */
export const BASE_OUTLINE_PX = 2.5;
/** [TEMP] Base platform half-width as a fraction of the drawn height. */
export const BASE_PLATFORM_W = 0.5;
/** The key base buildings (the two strongholds). */
export const BASE_BUILDING_IDS: readonly string[] = ['base-ally', 'base-enemy'];

/** Draw-height multiplier for a unit def. Only the strongholds change; never used by sim/collision. */
export function structureVisualScale(defId: string): number {
  return BASE_BUILDING_IDS.includes(defId) ? BASE_VISUAL_SCALE : 1;
}

// ---- Item 7: ground ----------------------------------------------------------------------------------------
/** Item 7 [JOSEPH]: lane path edges darkened by 15% (multiply 0.85). */
export const LANE_EDGE_DARKEN = 0.15;
/** [TEMP] Width of the darkened inner band on a lane edge tile side, bake px (tile half-height is 41). */
export const LANE_EDGE_BAND = 9;
/** [TEMP] Lane surface lift for lane / jungle / river separation (+6%). */
export const LANE_LIFT = 1.06;
/** [TEMP] Walkable jungle floor (grass / blend) value (-4%). */
export const JUNGLE_TONE = 0.96;
/** [TEMP] River bank tiles (-14%), so the lava river reads apart from the jungle. */
export const BANK_TONE = 0.86;
/** [TEMP] Subtle tile variation on large ground areas: +/- 5% value, low frequency. */
export const TILE_VARIATION = 0.05;
/** [TEMP] Variation cell size in tiles (smooth value noise). */
export const TILE_VARIATION_CELL = 5;

// ---- Item 9: trees -----------------------------------------------------------------------------------------
/** Item 9 [JOSEPH]: dark outline around tree sprites, screen px (baked at the current view scale). */
export const TREE_OUTLINE_PX = 2;
/** Item 9 [JOSEPH]: ground under tree clusters darkened by 10% (multiply 0.9). */
export const TREE_GROUND_DARKEN = 0.1;
/** [TEMP] Tree outline ink. */
export const TREE_OUTLINE_INK = 'rgba(6, 8, 4, 0.88)';
/** Placement threshold for forest/jungle canopies away from the edge (unchanged, was in stampGround). */
export const TREE_THRESHOLD = 0.45;
/** [TEMP] Lower threshold on jungle-edge tiles (not walkable, next to walkable) for denser, overlapping edges. */
export const TREE_EDGE_THRESHOLD = 0.2;
/** [TEMP] Edge tree size range (paint only). */
export const TREE_EDGE_SIZE_MIN = 0.85;
export const TREE_EDGE_SIZE_MAX = 1.25;

function hash01(i: number, j: number): number {
  const n = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

/** Deterministic paint-only size factor for an edge tree at lattice (i, j). */
export function treeEdgeSize(i: number, j: number): number {
  return TREE_EDGE_SIZE_MIN + hash01(i * 7 + 3, j * 5 + 1) * (TREE_EDGE_SIZE_MAX - TREE_EDGE_SIZE_MIN);
}

/** Canopy placement: returns the normalized size seed 0..1, or null when no tree is painted on this tile. */
export function treeSeed(n: number, edge: boolean): number | null {
  const threshold = edge ? TREE_EDGE_THRESHOLD : TREE_THRESHOLD;
  if (n <= threshold) return null;
  return (n - threshold) / (1 - threshold);
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Smooth, deterministic tile value factor in [1 - TILE_VARIATION, 1 + TILE_VARIATION]. */
export function tileVariation(i: number, j: number): number {
  const c = TILE_VARIATION_CELL;
  const gi = Math.floor(i / c);
  const gj = Math.floor(j / c);
  const fx = smooth(i / c - gi);
  const fy = smooth(j / c - gj);
  const a = hash01(gi * 3 + 11, gj * 5 + 7);
  const b = hash01((gi + 1) * 3 + 11, gj * 5 + 7);
  const d = hash01(gi * 3 + 11, (gj + 1) * 5 + 7);
  const e = hash01((gi + 1) * 3 + 11, (gj + 1) * 5 + 7);
  const v = (a * (1 - fx) + b * fx) * (1 - fy) + (d * (1 - fx) + e * fx) * fy;
  return 1 + (v * 2 - 1) * TILE_VARIATION;
}

export interface TileToneInput {
  kind: string;
  /** Visible tile is a not-walkable forest / jungle tile (tree cluster ground). */
  treeGround: boolean;
  i: number;
  j: number;
}

/** Multiplicative value for a visible ground tile (fill, joints and flecks). Lane edges are a separate band. */
export function tileTone({ kind, treeGround, i, j }: TileToneInput): number {
  if (kind === 'path') return LANE_LIFT;
  if (kind === 'bank') return BANK_TONE;
  if (kind === 'town' || kind === 'pale' || kind === 'river') return 1;
  let tone = tileVariation(i, j);
  if (treeGround) tone *= 1 - TREE_GROUND_DARKEN;
  else if (kind === 'grass' || kind === 'blend') tone *= JUNGLE_TONE;
  return tone;
}

/** '#rrggbb' times k, clamped. Non-hex colors pass through. */
export function shadeHex(hex: string, k: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m || k === 1) return hex;
  const v = parseInt(m[1], 16);
  const ch = (s: number) => Math.max(0, Math.min(255, Math.round(((v >> s) & 255) * k)));
  return `#${((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1)}`;
}

// ---- Outline / contrast pixel math (shared by sprites and structures) ----------------------------------------
/** 8 offsets on a circle of radius px (axis + diagonals), for a stamped outline. */
export function outlineOffsets(px: number): [number, number][] {
  const d = px * Math.SQRT1_2;
  return [[px, 0], [-px, 0], [0, px], [0, -px], [d, d], [-d, d], [d, -d], [-d, -d]];
}

/** Contrast stretch of one channel around a pivot, then a light factor; clamped 0..255. */
export function contrastChannel(value: number, pivot: number, contrast: number, light = 1): number {
  return Math.max(0, Math.min(255, Math.round(((value - pivot) * contrast + pivot) * light)));
}

/** Vertical light factor for row y inside a cell of height cellH: top highlight -> foot shade. */
export function cellLight(y: number, cellH: number): number {
  const t = Math.max(0, Math.min(1, (y % cellH) / Math.max(1, cellH - 1)));
  return 1 + CHARACTER_TOP_LIGHT * (1 - t) - CHARACTER_FOOT_SHADE * t;
}

/** Mean luma of the opaque pixels (alpha > 16) of an RGBA buffer; 128 when empty. */
export function meanLuma(data: ArrayLike<number>): number {
  let sum = 0;
  let n = 0;
  for (let p = 0; p < data.length; p += 4) {
    if (data[p + 3] <= 16) continue;
    sum += data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114;
    n++;
  }
  return n ? sum / n : 128;
}

/** In-place contrast (+ optional per-cell vertical light) on an RGBA buffer of width w. */
export function boostContrast(data: Uint8ClampedArray, w: number, contrast: number, cellH = 0): void {
  const pivot = meanLuma(data);
  for (let p = 0; p < data.length; p += 4) {
    if (data[p + 3] === 0) continue;
    const y = Math.floor(p / 4 / w);
    const light = cellH > 0 ? cellLight(y, cellH) : 1;
    data[p] = contrastChannel(data[p], pivot, contrast, light);
    data[p + 1] = contrastChannel(data[p + 1], pivot, contrast, light);
    data[p + 2] = contrastChannel(data[p + 2], pivot, contrast, light);
  }
}

/** In-place silhouette: every pixel becomes the outline ink, alpha kept (hard edge at alpha > 24). */
export function silhouette(data: Uint8ClampedArray, ink: [number, number, number] = [8, 6, 4]): void {
  for (let p = 0; p < data.length; p += 4) {
    const a = data[p + 3];
    data[p] = ink[0];
    data[p + 1] = ink[1];
    data[p + 2] = ink[2];
    data[p + 3] = a > 24 ? 255 : 0;
  }
}
