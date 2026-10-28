/**
 * Ambient darkness with soft radial holes. The buffer is a quarter of the CSS
 * size and is allocated only when that size changes. Light sprites are baked
 * once; a frame stamps them and composites the buffer a single time.
 */

/**
 * WORK ORDER "Wild Rift pass 2 (Code engineer)", item 4 [JOSEPH]: "Lighting: raise ambient brightness; reduce or
 * remove the heavy vignette/spotlight; keep the Diablo 2 tone but readable on a phone."
 * All values [TEMP]; mirrored in /workspace/sanctuary-canon/wild-rift-view-spec.md.
 *   ambientAlpha    0.55 -> 0.30   night overlay outside any light (lower = brighter world)
 *   heroLight       radius 220 -> 340 css px, intensity 1 (wider, softer pool: no hard spotlight edge)
 *   vignette        edge alpha 0.62 -> 0.22, clear radius 0.20 -> 0.50 of screen height, fade-out 0.78 -> 1.05
 *   top/bottom tint unchanged (cold top 0.18, warm bottom 0.16): the D2 tone stays.
 */
export const LIGHTING = {
  ambientAlpha: 0.3,
  heroLightRadius: 340,
  heroLightIntensity: 1,
  vignetteAlpha: 0.22,
  vignetteInner: 0.5,
  vignetteOuter: 1.05,
} as const;

/** Single knob for the night overlay (LIGHTING.ambientAlpha). */
export const AMBIENT_ALPHA = LIGHTING.ambientAlpha;
export const AMBIENT_DARKNESS = `rgba(8,10,6,${AMBIENT_ALPHA})`;

export interface LightSource {
  screenX: number;
  screenY: number;
  radius: number;
  intensity: number;
  color?: string;
  flicker?: boolean;
}

/** Quarter of the CSS pixel size. Smoothing is on only for the upscale blit. */
const BUFFER_SCALE = 0.25;

export class DarkGothicLighting {
  private buffer: HTMLCanvasElement | null = null;
  private mask: HTMLCanvasElement | null = null;
  private bufCtx: CanvasRenderingContext2D | null = null;
  private maskCtx: CanvasRenderingContext2D | null = null;
  private bufW = 0;
  private bufH = 0;
  private disc: HTMLCanvasElement | null = null;
  private readonly tints = new Map<string, HTMLCanvasElement>();
  /** How many times the light canvas was created. Stays flat across frames. */
  allocations = 0;

  ensure(cssW: number, cssH: number): void {
    const w = Math.max(1, Math.round(cssW * BUFFER_SCALE));
    const h = Math.max(1, Math.round(cssH * BUFFER_SCALE));
    if (this.buffer && this.mask && this.bufW === w && this.bufH === h && this.bufCtx && this.maskCtx) return;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const mask = document.createElement('canvas');
    mask.width = w;
    mask.height = h;
    const bufCtx = canvas.getContext('2d');
    const maskCtx = mask.getContext('2d');
    if (!bufCtx || !maskCtx) return;
    bufCtx.imageSmoothingEnabled = true;
    maskCtx.imageSmoothingEnabled = true;
    this.buffer = canvas;
    this.mask = mask;
    this.bufCtx = bufCtx;
    this.maskCtx = maskCtx;
    this.bufW = w;
    this.bufH = h;
    this.allocations += 1;
  }

  draw(
    ctx: CanvasRenderingContext2D,
    cssW: number,
    cssH: number,
    sources: readonly LightSource[],
    time: number,
  ): void {
    this.ensure(cssW, cssH);
    const buffer = this.buffer;
    const mask = this.mask;
    const g = this.bufCtx;
    const m = this.maskCtx;
    if (!buffer || !mask || !g || !m) return;
    const disc = this.softDisc();
    const width = this.bufW;
    const height = this.bufH;

    m.setTransform(1, 0, 0, 1, 0, 0);
    m.globalCompositeOperation = 'source-over';
    m.globalAlpha = 1;
    m.clearRect(0, 0, width, height);
    m.globalCompositeOperation = 'lighter';
    for (let i = 0; i < sources.length; i++) {
      const src = sources[i];
      const placed = placeLight(src, time, width, height);
      if (!placed) continue;
      m.globalAlpha = placed.alpha;
      m.drawImage(disc, placed.x, placed.y, placed.size, placed.size);
    }

    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.fillStyle = AMBIENT_DARKNESS;
    g.fillRect(0, 0, width, height);
    g.globalCompositeOperation = 'destination-out';
    g.drawImage(mask, 0, 0);
    g.globalCompositeOperation = 'screen';
    for (let i = 0; i < sources.length; i++) {
      const src = sources[i];
      if (!src.color) continue;
      const placed = placeLight(src, time, width, height);
      if (!placed) continue;
      g.globalAlpha = Math.min(0.65, 0.58 * src.intensity);
      g.drawImage(this.tintDisc(src.color), placed.x, placed.y, placed.size, placed.size);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';

    const smoothing = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(buffer, 0, 0, cssW, cssH);
    ctx.imageSmoothingEnabled = smoothing;
  }

  /** One soft circle. Lights are stamped from it instead of building a gradient per source. */
  private softDisc(): HTMLCanvasElement {
    if (this.disc) return this.disc;
    this.disc = radialDisc('0, 0, 0');
    return this.disc;
  }

  private tintDisc(color: string): HTMLCanvasElement {
    const key = rgbChannels(color);
    const hit = this.tints.get(key);
    if (hit) return hit;
    const canvas = radialDisc(key);
    this.tints.set(key, canvas);
    return canvas;
  }
}

function placeLight(
  src: LightSource,
  time: number,
  width: number,
  height: number,
): { x: number; y: number; size: number; alpha: number } | null {
  const flicker = src.flicker ? fireFlicker(time) : 1;
  const radius = Math.max(4, src.radius * flicker) * BUFFER_SCALE;
  const cx = src.screenX * BUFFER_SCALE;
  const cy = src.screenY * BUFFER_SCALE;
  if (cx < -radius || cy < -radius || cx > width + radius || cy > height + radius) return null;
  return {
    x: cx - radius,
    y: cy - radius,
    size: radius * 2,
    alpha: Math.max(0, Math.min(1, src.intensity)),
  };
}

function radialDisc(rgb: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  if (!g) return canvas;
  const grad = g.createRadialGradient(64, 64, 64 * 0.45, 64, 64, 64);
  grad.addColorStop(0, `rgba(${rgb}, 1)`);
  grad.addColorStop(1, `rgba(${rgb}, 0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return canvas;
}

/** 8 Hz and 19 Hz so a brazier does not pulse in one clean cycle. */
function fireFlicker(time: number): number {
  return 1 + 0.06 * Math.sin(time * 8 * Math.PI * 2) + 0.04 * Math.sin(time * 19 * Math.PI * 2);
}

function rgbChannels(color: string): string {
  if (color.startsWith('#')) {
    let hex = color.slice(1);
    if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
    const value = Number.parseInt(hex, 16);
    if (Number.isNaN(value)) return '255, 176, 64';
    return `${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}`;
  }
  const match = color.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (match) return `${match[1]}, ${match[2]}, ${match[3]}`;
  return '255, 176, 64';
}
