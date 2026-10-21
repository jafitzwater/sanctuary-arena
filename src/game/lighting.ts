/**
 * Ambient darkness with soft radial holes. The buffer is half the CSS size
 * and is allocated only when that size changes.
 */

/** Single knob for the night overlay. Lanes outside a light read as night. */
export const AMBIENT_ALPHA = 0.88;
export const AMBIENT_DARKNESS = `rgba(8,10,6,${AMBIENT_ALPHA})`;

export interface LightSource {
  screenX: number;
  screenY: number;
  radius: number;
  intensity: number;
  color?: string;
  flicker?: boolean;
}

/** Half CSS pixels. Smoothing is enabled only while this buffer is blitted. */
const BUFFER_SCALE = 0.5;

export class DarkGothicLighting {
  private buffer: HTMLCanvasElement | null = null;
  private bufW = 0;
  private bufH = 0;
  private disc: HTMLCanvasElement | null = null;
  private readonly tints = new Map<string, HTMLCanvasElement>();
  /** How many times the light canvas was created. Stays flat across frames. */
  allocations = 0;

  ensure(cssW: number, cssH: number): void {
    const w = Math.max(1, Math.round(cssW * BUFFER_SCALE));
    const h = Math.max(1, Math.round(cssH * BUFFER_SCALE));
    if (this.buffer && this.bufW === w && this.bufH === h) return;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    this.buffer = canvas;
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
    if (!buffer) return;
    const g = buffer.getContext('2d');
    if (!g) return;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.clearRect(0, 0, this.bufW, this.bufH);
    g.fillStyle = AMBIENT_DARKNESS;
    g.fillRect(0, 0, this.bufW, this.bufH);
    const disc = this.softDisc();
    g.globalCompositeOperation = 'destination-out';
    for (const src of sources) {
      const flicker = src.flicker ? fireFlicker(time) : 1;
      const radius = Math.max(4, src.radius * flicker) * BUFFER_SCALE;
      const x = src.screenX * BUFFER_SCALE;
      const y = src.screenY * BUFFER_SCALE;
      if (x < -radius || y < -radius || x > this.bufW + radius || y > this.bufH + radius) continue;
      g.globalAlpha = Math.max(0, Math.min(1, src.intensity));
      g.drawImage(disc, x - radius, y - radius, radius * 2, radius * 2);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'screen';
    for (const src of sources) {
      if (!src.color) continue;
      const flicker = src.flicker ? fireFlicker(time) : 1;
      const radius = Math.max(4, src.radius * flicker) * BUFFER_SCALE;
      const x = src.screenX * BUFFER_SCALE;
      const y = src.screenY * BUFFER_SCALE;
      if (x < -radius || y < -radius || x > this.bufW + radius || y > this.bufH + radius) continue;
      g.globalAlpha = Math.max(0, Math.min(0.55, 0.45 * src.intensity));
      g.drawImage(this.tintDisc(src.color), x - radius, y - radius, radius * 2, radius * 2);
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
