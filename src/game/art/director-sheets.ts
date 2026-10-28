/**
 * Draws the Sprite Director full 8-direction class and wave-mob sheets (manifest "Full 8-direction sheets").
 * Implements: blit of one cell, feet at (x, y) (anchor 32,64), scaled so the figure matches the caller's body height.
 * Derived frames in these sheets are [TEMP/art direction] (see sheet-frames.ts).
 * Excluded: any frame the manifest does not list. Callers fall back to the existing Flare/procedural art
 * only while a sheet image is still loading.
 */
import { CLASS_SHEET, MOB_SHEET } from './sheet-frames';

const images = new Map<string, HTMLImageElement>();

function imageOf(path: string): HTMLImageElement | null {
  let image = images.get(path);
  if (!image) {
    image = new Image();
    image.decoding = 'async';
    image.src = `${import.meta.env.BASE_URL}sprites/${path}`;
    images.set(path, image);
  }
  return image.complete && image.naturalWidth > 0 ? image : null;
}

export function classSheetReady(classId: string): boolean {
  return !!imageOf(`classes/${classId}-full-sheet-64.png`);
}

/** Columns in the loaded class sheet (0 while loading). Lets the barbarian fall back to the old columns. */
export function classSheetCols(classId: string): number {
  const image = imageOf(`classes/${classId}-full-sheet-64.png`);
  return image ? Math.floor(image.naturalWidth / CLASS_SHEET.cell) : 0;
}

export function mobSheetReady(sheetId: string): boolean {
  return !!imageOf(`mobs/${sheetId}-full-sheet-64.png`);
}

export function drawClassSheet(
  ctx: CanvasRenderingContext2D, classId: string, row: number, col: number, x: number, y: number, height: number,
): boolean {
  const image = imageOf(`classes/${classId}-full-sheet-64.png`);
  if (!image) return false;
  const s = CLASS_SHEET;
  const scale = height / s.body;
  ctx.drawImage(image, col * s.cell, row * s.cell, s.cell, s.cell, x - s.footX * scale, y - s.footY * scale, s.cell * scale, s.cell * scale);
  return true;
}

export function drawMobSheet(
  ctx: CanvasRenderingContext2D, sheetId: string, row: number, col: number, x: number, y: number, height: number,
): boolean {
  const image = imageOf(`mobs/${sheetId}-full-sheet-64.png`);
  if (!image) return false;
  const s = MOB_SHEET;
  const scale = height / s.body;
  // Full sheets carry all 8 directions (w/sw/nw pre-mirrored in the sheet), so no runtime flip.
  ctx.drawImage(image, col * s.cell, row * s.cell, s.cell, s.cell, x - s.footX * scale, y - s.footY * scale, s.cell * scale, s.cell * scale);
  return true;
}

/**
 * WILD RIFT VIEW minimap portrait: head-and-shoulders crop of the idle, south-facing class cell
 * (row 4 = 's', col 0 = idle), clipped to a circle. False while the sheet is still loading.
 */
export function drawClassPortrait(ctx: CanvasRenderingContext2D, classId: string, cx: number, cy: number, r: number): boolean {
  const image = imageOf(`classes/${classId}-full-sheet-64.png`);
  if (!image) return false;
  const s = CLASS_SHEET;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  // [TEMP/art direction] crop 28x28 px around the head (cell x 18-46, y 6-34).
  ctx.drawImage(image, 18, 4 * s.cell + 6, 28, 28, cx - r, cy - r, r * 2, r * 2);
  ctx.restore();
  return true;
}
