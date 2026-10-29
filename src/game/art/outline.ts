/**
 * Visual readability items 5, 6, 8 [JOSEPH t253u]: cheap dark outlines and local contrast, draw only.
 * Sprite sheets: one contrast-boosted copy and one dark silhouette per loaded image, built once off the frame
 * (idle callback), then a ring+body composite per outline width, so each unit is one drawImage per frame.
 * Procedural towers / bases: one cached outlined stamp per (kind, team, alive, height, device scale).
 * Procedural creatures / bosses: pooled scratch canvases per draw (only the few units without sheets).
 * No art files are read, written or replaced.
 */
import {
  OUTLINE_ALPHA,
  OUTLINE_INK,
  boostContrast,
  outlineOffsets,
  silhouette,
} from '../readability';

interface Prepared {
  body: HTMLCanvasElement;
  sil: HTMLCanvasElement;
}

const prepared = new WeakMap<CanvasImageSource, Prepared | 'pending' | 'failed'>();

function canvasOf(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

function idle(fn: () => void): void {
  const ric = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
  if (ric) ric(fn, { timeout: 400 });
  else setTimeout(fn, 0);
}

function build(image: HTMLImageElement, cellH: number, contrast: number): Prepared | 'failed' {
  try {
    const w = image.naturalWidth;
    const h = image.naturalHeight;
    const body = canvasOf(w, h);
    const g = body.getContext('2d', { willReadFrequently: true });
    if (!g) return 'failed';
    g.drawImage(image, 0, 0);
    const px = g.getImageData(0, 0, w, h);
    boostContrast(px.data, w, contrast, cellH);
    g.putImageData(px, 0, 0);
    const sil = canvasOf(w, h);
    const s = sil.getContext('2d');
    if (!s) return 'failed';
    const dark = new ImageData(new Uint8ClampedArray(px.data), w, h);
    silhouette(dark.data);
    s.putImageData(dark, 0, 0);
    return { body, sil };
  } catch {
    return 'failed';
  }
}

/** Prepared copies of a loaded sheet, or null while they are still being built (caller draws the plain image). */
export function preparedSheet(image: HTMLImageElement, cellH: number, contrast: number): Prepared | null {
  const hit = prepared.get(image);
  if (hit && hit !== 'pending' && hit !== 'failed') return hit;
  if (!hit && typeof document !== 'undefined') {
    prepared.set(image, 'pending');
    idle(() => prepared.set(image, build(image, cellH, contrast)));
  }
  return null;
}

/**
 * One sheet cell with a dark outline of `px` css px and the contrast copy. Faded draws (death fade, invuln flicker)
 * skip the outline so the stacked silhouettes never show through a translucent body.
 */
export function blitOutlinedCell(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  cellH: number,
  contrast: number,
  px: number,
  sx: number, sy: number, sw: number, sh: number,
  dx: number, dy: number, dw: number, dh: number,
): void {
  const prep = preparedSheet(image, cellH, contrast);
  if (!prep) {
    ctx.drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh);
    return;
  }
  if (ctx.globalAlpha >= 0.99 && px > 0) {
    // Ring + body pre-composed per (sheet, cell size, source-px outline width): one blit per unit per frame.
    const srcPx = Math.max(0.5, Math.min(8, Math.round((px * sw) / Math.max(1, dw) * 2) / 2));
    const done = composedSheet(image, prep, sw, sh, srcPx);
    if (done) {
      ctx.drawImage(done, sx, sy, sw, sh, dx, dy, dw, dh);
      return;
    }
    const a = ctx.globalAlpha;
    ctx.globalAlpha = a * OUTLINE_ALPHA;
    for (const [ox, oy] of outlineOffsets(px)) ctx.drawImage(prep.sil, sx, sy, sw, sh, dx + ox, dy + oy, dw, dh);
    ctx.globalAlpha = a;
  }
  ctx.drawImage(prep.body, sx, sy, sw, sh, dx, dy, dw, dh);
}

const composed = new WeakMap<CanvasImageSource, Map<string, HTMLCanvasElement | 'pending' | 'failed'>>();

/** Outline ring (clipped to each cell) + contrast body baked into one sheet copy, built at idle. Null until ready. */
function composedSheet(image: HTMLImageElement, prep: Prepared, cw: number, ch: number, srcPx: number): HTMLCanvasElement | null {
  let byKey = composed.get(image);
  if (!byKey) {
    byKey = new Map();
    composed.set(image, byKey);
  }
  const key = `${cw}x${ch}:${srcPx}`;
  const hit = byKey.get(key);
  if (hit && hit !== 'pending' && hit !== 'failed') return hit;
  if (!hit) {
    byKey.set(key, 'pending');
    const map = byKey;
    idle(() => {
      try {
        const w = prep.body.width;
        const h = prep.body.height;
        const out = canvasOf(w, h);
        const g = out.getContext('2d');
        if (!g) {
          map.set(key, 'failed');
          return;
        }
        g.imageSmoothingEnabled = false;
        const offs = outlineOffsets(srcPx);
        g.globalAlpha = OUTLINE_ALPHA;
        for (let y = 0; y < h; y += ch) {
          for (let x = 0; x < w; x += cw) {
            g.save();
            g.beginPath();
            g.rect(x, y, cw, ch);
            g.clip();
            for (const [ox, oy] of offs) g.drawImage(prep.sil, x, y, cw, ch, x + ox, y + oy, cw, ch);
            g.restore();
          }
        }
        g.globalAlpha = 1;
        g.drawImage(prep.body, 0, 0);
        map.set(key, out);
      } catch {
        map.set(key, 'failed');
      }
    });
  }
  return null;
}

function deviceScale(ctx: CanvasRenderingContext2D): number {
  const t = typeof ctx.getTransform === 'function' ? ctx.getTransform() : null;
  const k = t ? Math.hypot(t.a, t.b) : 1;
  return Math.max(1, Math.min(3, Math.round(k * 4) / 4));
}


/** [TEMP] round-robin scratch slots so consecutive figures never reuse a canvas still queued for the GPU. */
const LIVE_POOL = 12;
const pool: { a: HTMLCanvasElement | null; c: HTMLCanvasElement | null }[] = Array.from({ length: LIVE_POOL }, () => ({ a: null, c: null }));
let poolAt = 0;

function grow(c: HTMLCanvasElement | null, w: number, h: number): HTMLCanvasElement {
  if (!c || c.width < w || c.height < h) return canvasOf(Math.max(w, c?.width ?? 0), Math.max(h, c?.height ?? 0));
  return c;
}

/**
 * Paint a procedural figure through a scratch canvas and outline it. Box is (x - halfW .. x + halfW, y - up .. y + down)
 * in the caller's css coordinates. Faded draws paint directly with no outline.
 * The outline + body are composited off-screen so the main canvas receives a single blit per figure.
 */
export function drawOutlinedLive(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, halfW: number, up: number, down: number,
  px: number,
  paint: (g: CanvasRenderingContext2D) => void,
  under?: () => void,
): void {
  if (ctx.globalAlpha < 0.99 || px <= 0 || typeof document === 'undefined') {
    paint(ctx);
    under?.();
    return;
  }
  const k = deviceScale(ctx);
  const pad = Math.ceil(px + 2);
  const wCss = halfW * 2 + pad * 2;
  const hCss = up + down + pad * 2;
  const w = Math.ceil(wCss * k);
  const h = Math.ceil(hCss * k);
  const slot = pool[poolAt];
  poolAt = (poolAt + 1) % LIVE_POOL;
  slot.a = grow(slot.a, w, h);
  slot.c = grow(slot.c, w, h);
  const ga = slot.a.getContext('2d');
  const gc = slot.c.getContext('2d');
  if (!ga || !gc) {
    paint(ctx);
    under?.();
    return;
  }
  ga.setTransform(1, 0, 0, 1, 0, 0);
  ga.globalCompositeOperation = 'source-over';
  ga.clearRect(0, 0, w, h);
  ga.imageSmoothingEnabled = false;
  ga.setTransform(k, 0, 0, k, (halfW + pad - x) * k, (up + pad - y) * k);
  paint(ga);
  ga.setTransform(1, 0, 0, 1, 0, 0);
  // c = dilated silhouette in ink, then the body on top.
  gc.setTransform(1, 0, 0, 1, 0, 0);
  gc.globalAlpha = 1;
  gc.globalCompositeOperation = 'source-over';
  gc.clearRect(0, 0, w, h);
  for (const [ox, oy] of outlineOffsets(px)) gc.drawImage(slot.a, 0, 0, w, h, ox * k, oy * k, w, h);
  gc.globalCompositeOperation = 'source-in';
  gc.fillStyle = OUTLINE_INK;
  gc.fillRect(0, 0, w, h);
  gc.globalCompositeOperation = 'destination-out';
  gc.drawImage(slot.a, 0, 0, w, h, 0, 0, w, h);
  gc.globalCompositeOperation = 'source-over';
  const left = x - halfW - pad;
  const top = y - up - pad;
  under?.();
  const alpha = ctx.globalAlpha;
  ctx.globalAlpha = alpha * OUTLINE_ALPHA;
  ctx.drawImage(slot.c, 0, 0, w, h, left, top, wCss, hCss);
  ctx.globalAlpha = alpha;
  ctx.drawImage(slot.a, 0, 0, w, h, left, top, wCss, hCss);
}

const stamps = new Map<string, { canvas: HTMLCanvasElement; halfW: number; up: number; pad: number; k: number }>();

/**
 * Cached outlined + contrast-boosted stamp of a static procedural structure (tower, base). Feet at (x, y).
 * The paint callback draws with feet at (0, 0) and must not draw its own ground shadow.
 */
export function drawStructureStamp(
  ctx: CanvasRenderingContext2D,
  key: string,
  x: number, y: number, halfW: number, up: number,
  px: number,
  contrast: number,
  paint: (g: CanvasRenderingContext2D) => void,
): void {
  if (typeof document === 'undefined') return;
  const k = deviceScale(ctx);
  const full = `${key}|${Math.round(halfW)}|${Math.round(up)}|${px}|${k}`;
  let hit = stamps.get(full);
  if (!hit) {
    const pad = Math.ceil(px + 2);
    const wCss = halfW * 2 + pad * 2;
    const hCss = up + pad * 2;
    const w = Math.ceil(wCss * k);
    const h = Math.ceil(hCss * k);
    const body = canvasOf(w, h);
    const g = body.getContext('2d', { willReadFrequently: true });
    const canvas = canvasOf(w, h);
    const out = canvas.getContext('2d');
    if (!g || !out) {
      paint(ctx);
      return;
    }
    g.imageSmoothingEnabled = false;
    g.setTransform(k, 0, 0, k, (halfW + pad) * k, (up + pad) * k);
    paint(g);
    g.setTransform(1, 0, 0, 1, 0, 0);
    const img = g.getImageData(0, 0, w, h);
    boostContrast(img.data, w, contrast);
    g.putImageData(img, 0, 0);
    const sil = new ImageData(new Uint8ClampedArray(img.data), w, h);
    silhouette(sil.data);
    const silCanvas = canvasOf(w, h);
    silCanvas.getContext('2d')?.putImageData(sil, 0, 0);
    out.globalAlpha = OUTLINE_ALPHA;
    for (const [ox, oy] of outlineOffsets(px * k)) out.drawImage(silCanvas, ox, oy);
    out.globalAlpha = 1;
    out.drawImage(body, 0, 0);
    hit = { canvas, halfW, up, pad, k };
    if (stamps.size > 96) stamps.clear();
    stamps.set(full, hit);
  }
  const wCss = hit.canvas.width / hit.k;
  const hCss = hit.canvas.height / hit.k;
  ctx.drawImage(hit.canvas, x - hit.halfW - hit.pad, y - hit.up - hit.pad, wCss, hCss);
}
