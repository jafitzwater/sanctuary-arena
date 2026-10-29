/**
 * Hook in tower bitmaps [JOSEPH t263u] + addendum [JOSEPH t266u]: the guard tower (defId `tower`, every tier)
 * and the two Worldstone bases are drawn from the Sprite Director bitmaps in public/sprites/structures/ (PR #88)
 * instead of the code-drawn paintSpire / paintStronghold.
 * Manifest: sanctuary-canon/tower-art-manifest.md. Anchor = bottom-centre pixel at the unit foot.
 * Scale: tower s = 128·u / 120, base s = 220·1.1·u / 216 (#87's +10% base scale kept). The SAME s is used for
 * the destroyed sprite, so the ruin covers the alive footprint.
 * Rendering only: no collision, stats, ranges, minimap or HP bar change.
 * While an image is loading or if it fails, callers fall back to the existing code-drawn art.
 */
import { BASE_VISUAL_SCALE } from '../readability';

/**
 * Contrast stretch for the bitmap stamps: 1 = none. #87's STRUCTURE_CONTRAST (1.22) is skipped because the
 * bitmaps already carry their own contrast, 1 px inner dark edge and painted glow (manifest guidance).
 */
export const BITMAP_CONTRAST = 1;

export type StructureKind = 'tower' | 'base';

/** Drawn alive heights in the old code path (render.ts unitHeight, times u). */
export const TOWER_DRAW_H = 128;
export const BASE_DRAW_H = 220;
/** Alive bitmap heights (manifest). */
export const TOWER_BITMAP_H = 120;
export const BASE_BITMAP_H = 216;

export interface StructureBitmap {
  /** Path under public/sprites/. */
  path: string;
  w: number;
  h: number;
  /** Anchor pixel (manifest): bottom-centre, where the structure's foot sits. */
  ax: number;
  ay: number;
}

/** All structure files, keyed `kind:team:state` (manifest table). */
export const STRUCTURE_BITMAPS: Readonly<Record<string, StructureBitmap>> = {
  'tower:ally:alive': { path: 'structures/tower-ally.png', w: 67, h: 120, ax: 33, ay: 119 },
  'tower:enemy:alive': { path: 'structures/tower-enemy.png', w: 67, h: 120, ax: 33, ay: 119 },
  'tower:ally:destroyed': { path: 'structures/tower-ally-destroyed.png', w: 67, h: 44, ax: 33, ay: 43 },
  'tower:enemy:destroyed': { path: 'structures/tower-enemy-destroyed.png', w: 67, h: 44, ax: 33, ay: 43 },
  'base:ally:alive': { path: 'structures/base-ally.png', w: 131, h: 216, ax: 65, ay: 215 },
  'base:enemy:alive': { path: 'structures/base-enemy.png', w: 134, h: 216, ax: 67, ay: 215 },
  'base:ally:destroyed': { path: 'structures/base-ally-destroyed.png', w: 131, h: 88, ax: 65, ay: 87 },
  'base:enemy:destroyed': { path: 'structures/base-enemy-destroyed.png', w: 133, h: 89, ax: 66, ay: 88 },
};

export function structureBitmapKey(kind: StructureKind, ally: boolean, alive: boolean): string {
  return `${kind}:${ally ? 'ally' : 'enemy'}:${alive ? 'alive' : 'destroyed'}`;
}

/** Manifest scale for u = characterScale(cssH): tower 128·u/120, base 220·1.1·u/216. Same for alive and destroyed. */
export function structureBitmapScale(kind: StructureKind, u: number): number {
  return kind === 'tower' ? (TOWER_DRAW_H * u) / TOWER_BITMAP_H : (BASE_DRAW_H * BASE_VISUAL_SCALE * u) / BASE_BITMAP_H;
}

/** Destination rect (css px): the anchor pixel's bottom-centre lands exactly on the foot (x, y). */
export function bitmapRect(b: StructureBitmap, x: number, y: number, s: number): { dx: number; dy: number; dw: number; dh: number } {
  return { dx: x - (b.ax + 0.5) * s, dy: y - (b.ay + 1) * s, dw: b.w * s, dh: b.h * s };
}

const images = new Map<string, HTMLImageElement>();
const failed = new Set<string>();

function imageOf(path: string): HTMLImageElement | null {
  if (typeof Image === 'undefined' || failed.has(path)) return null;
  let image = images.get(path);
  if (!image) {
    image = new Image();
    image.decoding = 'async';
    image.onerror = () => failed.add(path);
    image.src = `${import.meta.env.BASE_URL}sprites/${path}`;
    images.set(path, image);
  }
  return image.complete && image.naturalWidth > 0 ? image : null;
}

/** Bitmap preload list: start every structure image loading at renderer start (no-op outside the browser). */
export function preloadStructureBitmaps(): void {
  for (const b of Object.values(STRUCTURE_BITMAPS)) imageOf(b.path);
}

/** Ready image for this structure state, or null (loading / missing / no DOM) so the caller falls back. */
export function structureBitmap(
  kind: StructureKind, ally: boolean, alive: boolean,
): { image: HTMLImageElement; def: StructureBitmap } | null {
  const def = STRUCTURE_BITMAPS[structureBitmapKey(kind, ally, alive)];
  if (!def) return null;
  const image = imageOf(def.path);
  return image ? { image, def } : null;
}
