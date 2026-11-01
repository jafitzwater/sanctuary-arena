/**
 * t345u "Put Rakanishu in the game": draws Rakanishu from the trimmed atlas (scripts/rakanishu-atlas.py) and his
 * spark sheet. Atlas frames are the Sprite Director's 128 px cells cropped to their opaque pixels, so a frame is
 * placed at its crop offset from the cell's foot point (64, 128) and drawn at the heroes' px/m (same scale as
 * the class sheets), so his size next to the heroes matches the approved mock-up.
 * Look kept identical to the other sheets: the same contrast stretch (pivot = the full sheet's mean luma), the
 * same per-cell top light / foot shade (rows measured from each frame's own cell), and the same 1 px dark ring.
 * The ring needs no per-cell clip because the atlas leaves a 4 px transparent gutter between frames.
 * Loaded async; callers draw the procedural token until it is ready.
 */
import atlas from './rakanishu-atlas.json';
import { CHARACTER_CONTRAST, CHARACTER_OUTLINE_PX, OUTLINE_ALPHA, cellLight, contrastChannel, outlineOffsets, silhouette } from '../readability';

/** Sheet px from the feet to the top of the horns in the idle cells; the drawn "height" of his body. */
export const RAK_BODY_PX = 85;
/** Hero body px in the class sheets (CLASS_SHEET.body): Rakanishu shares their px/m. */
const HERO_BODY_PX = 56;
/** His draw height for a hero draw height h (same px/m as the heroes). */
export function rakanishuHeight(heroHeight: number): number {
  return (heroHeight * RAK_BODY_PX) / HERO_BODY_PX;
}

export const SPARK_FRAMES = 8;
export const SPARK_CELL = 96;

type Frame = [row: number, col: number, x: number, y: number, w: number, h: number, ox: number, oy: number];
const frames = new Map<number, Frame>();
for (const f of atlas.frames as Frame[]) frames.set(f[0] * 100 + f[1], f);

export function rakanishuFrame(row: number, col: number): Frame | undefined {
  return frames.get(row * 100 + col);
}

let image: HTMLImageElement | null = null;
let spark: HTMLImageElement | null = null;
let body: HTMLCanvasElement | null | 'pending' | 'failed' = null;
const ringed = new Map<number, HTMLCanvasElement | 'pending' | 'failed'>();

function load(path: string): HTMLImageElement {
  const im = new Image();
  im.decoding = 'async';
  im.src = `${import.meta.env.BASE_URL}sprites/bosses/${path}`;
  return im;
}

function ready(im: HTMLImageElement | null): im is HTMLImageElement {
  return !!im && im.complete && im.naturalWidth > 0;
}

function idle(fn: () => void): void {
  const ric = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
  if (ric) ric(fn, { timeout: 400 });
  else setTimeout(fn, 0);
}

function canvasOf(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Contrast + per-cell light, frame by frame, on a copy of the atlas. */
function buildBody(im: HTMLImageElement): HTMLCanvasElement | 'failed' {
  try {
    const out = canvasOf(im.naturalWidth, im.naturalHeight);
    const g = out.getContext('2d', { willReadFrequently: true });
    if (!g) return 'failed';
    g.drawImage(im, 0, 0);
    for (const [, , x, y, w, h, , oy] of frames.values()) {
      const px = g.getImageData(x, y, w, h);
      const d = px.data;
      for (let p = 0; p < d.length; p += 4) {
        if (d[p + 3] === 0) continue;
        const light = cellLight(oy + Math.floor(p / 4 / w), atlas.cell);
        d[p] = contrastChannel(d[p], atlas.pivot, CHARACTER_CONTRAST, light);
        d[p + 1] = contrastChannel(d[p + 1], atlas.pivot, CHARACTER_CONTRAST, light);
        d[p + 2] = contrastChannel(d[p + 2], atlas.pivot, CHARACTER_CONTRAST, light);
      }
      g.putImageData(px, x, y);
    }
    return out;
  } catch {
    return 'failed';
  }
}

/** Body + dark ring of srcPx atlas px, baked once per ring width. */
function buildRinged(bodyCanvas: HTMLCanvasElement, srcPx: number): HTMLCanvasElement | 'failed' {
  try {
    const w = bodyCanvas.width;
    const h = bodyCanvas.height;
    const sil = canvasOf(w, h);
    const s = sil.getContext('2d', { willReadFrequently: true });
    const out = canvasOf(w, h);
    const g = out.getContext('2d');
    if (!s || !g) return 'failed';
    s.drawImage(bodyCanvas, 0, 0);
    const px = s.getImageData(0, 0, w, h);
    silhouette(px.data);
    s.putImageData(px, 0, 0);
    g.imageSmoothingEnabled = false;
    g.globalAlpha = OUTLINE_ALPHA;
    for (const [ox, oy] of outlineOffsets(srcPx)) g.drawImage(sil, ox, oy);
    g.globalAlpha = 1;
    g.drawImage(bodyCanvas, 0, 0);
    return out;
  } catch {
    return 'failed';
  }
}

/** True once the atlas has decoded (starts the async load on first call). */
export function rakanishuReady(): boolean {
  if (typeof document === 'undefined') return false;
  if (!image) image = load('rakanishu-atlas.webp');
  return ready(image);
}

export function sparkReady(): boolean {
  if (typeof document === 'undefined') return false;
  if (!spark) spark = load('rakanishu-spark.png');
  return ready(spark);
}

/**
 * One Rakanishu frame with its feet at (x, y), `height` css px from the feet to the horn tips. False while the
 * atlas is loading or the frame is missing (caller falls back).
 */
export function drawRakanishu(ctx: CanvasRenderingContext2D, row: number, col: number, x: number, y: number, height: number): boolean {
  if (!rakanishuReady() || !image) return false;
  const f = rakanishuFrame(row, col);
  if (!f) return false;
  const [, , sx, sy, w, h, ox, oy] = f;
  const scale = height / RAK_BODY_PX;
  const dx = x + (ox - atlas.footX) * scale;
  const dy = y + (oy - atlas.footY) * scale;
  if (body === null) {
    body = 'pending';
    const im = image;
    idle(() => {
      body = buildBody(im);
    });
  }
  let src: CanvasImageSource = image;
  if (body instanceof HTMLCanvasElement) {
    src = body;
    if (ctx.globalAlpha >= 0.99) {
      const srcPx = Math.max(0.5, Math.min(3, Math.round((CHARACTER_OUTLINE_PX / scale) * 2) / 2));
      const hit = ringed.get(srcPx);
      if (hit instanceof HTMLCanvasElement) src = hit;
      else if (!hit) {
        ringed.set(srcPx, 'pending');
        const b = body;
        idle(() => ringed.set(srcPx, buildRinged(b, srcPx)));
      }
    }
  }
  // The ring reaches up to 3 px outside the crop; the gutter is 4 px, so take 3 px of margin.
  const m = 3;
  ctx.drawImage(src, sx - m, sy - m, w + m * 2, h + m * 2, dx - m * scale, dy - m * scale, (w + m * 2) * scale, (h + m * 2) * scale);
  return true;
}

/** One spark-sheet frame (0-7) centred at (x, y), `size` css px square, with additive blend. */
export function drawSparkFrame(ctx: CanvasRenderingContext2D, frame: number, x: number, y: number, size: number, alpha = 1): boolean {
  if (!sparkReady() || !spark) return false;
  const f = Math.max(0, Math.min(SPARK_FRAMES - 1, Math.floor(frame)));
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(spark, f * SPARK_CELL, 0, SPARK_CELL, SPARK_CELL, x - size / 2, y - size / 2, size, size);
  ctx.restore();
  return true;
}

/** Decoded bytes of the shipped atlas (RGBA). */
export const RAK_ATLAS_BYTES = atlas.w * atlas.h * 4;
