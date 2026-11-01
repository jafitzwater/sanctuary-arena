import { HERO_ART, STAND_BACK_GAIN, forwardPoint, forwardRect, heroLooks, plateRect } from './heroSelect';

/**
 * Hero select overlay (t373u-t378u, t389u): a canvas over the backdrop, redrawn from scratch every frame
 * from `heroLooks(selected)` (no per-hero state survives a frame). The backdrop carries the approved
 * standing-back base (every hero shaded and still). When a hero steps forward, the whole scene behind it is
 * multiplied by STAND_BACK_GAIN (x0.42, as in the approved mock-ups), so the six standing back read clearly shaded.
 * The selected hero steps forward: a clean plate hides its standing figure and its forward-pose layer is
 * drawn scaled 1.22 about the feet and lowered (forwardRect), lit and held still. The Sorceress keeps her
 * live canvas lightning between staff and raised hand; no other hero gets an effect.
 */

/** Sorceress staff orb and raised fingertips in her forward cutout's own px (hero-forward/sorceress.webp). */
export const SORC_STAFF_TIP = { x: 29, y: 52 } as const;
export const SORC_RAISED_HAND = { x: 166, y: 42 } as const;

type Point = { x: number; y: number };

/** The forward cutout and clean plate of one hero (loaded lazily by the HUD). */
export interface HeroLayerImages {
  forward: HTMLImageElement;
  plate: HTMLImageElement;
}

function hash(n: number): number {
  const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}

const ready = (img: HTMLImageElement | undefined): img is HTMLImageElement => !!img && img.complete && img.naturalWidth > 0;

export class HeroSelectFx {
  private readonly ctx: CanvasRenderingContext2D | null;
  private w = 0;
  private h = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly layers: Readonly<Record<string, HeroLayerImages | undefined>>,
  ) {
    this.ctx = canvas.getContext('2d');
  }

  draw(time: number, selected: string, still: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const cssW = this.canvas.clientWidth;
    const cssH = this.canvas.clientHeight;
    if (!cssW || !cssH) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const bw = Math.round(cssW * dpr);
    const bh = Math.round(cssH * dpr);
    if (bw !== this.w || bh !== this.h) {
      this.canvas.width = this.w = bw;
      this.canvas.height = this.h = bh;
    }
    // Full reset every frame: transform, composite, alpha and pixels.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, bw, bh);
    const k = bw / HERO_ART.width;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.imageSmoothingEnabled = true;
    const looks = heroLooks(selected);
    const lit = looks.find((look) => look.lit);
    const layer = lit ? this.layers[lit.id] : undefined;
    const forward = lit && layer && ready(layer.forward) && ready(layer.plate) ? lit : undefined;
    // 1) the lit hero's clean plate over its standing figure, 2) the stand-back veil over the whole scene (plate
    // included, as in the mock-ups), 3) the forward pose, unshaded on top, 4) the Sorceress's lightning.
    // Plate, veil and forward pose go together: until the forward layer loads, the scene shows as is.
    if (forward && layer) {
      this.image(ctx, layer.plate, plateRect(forward.id));
      this.standBack(ctx);
      this.image(ctx, layer.forward, forwardRect(forward.id));
      if (forward.fx === 'lightning') {
        const a = forwardPoint(forward.id, SORC_STAFF_TIP.x, SORC_STAFF_TIP.y);
        const b = forwardPoint(forward.id, SORC_RAISED_HAND.x, SORC_RAISED_HAND.y);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        if (a && b) this.lightning(ctx, still ? 0 : time, a, b);
        ctx.restore();
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  private image(ctx: CanvasRenderingContext2D, img: HTMLImageElement, r: { x: number; y: number; w: number; h: number } | null): void {
    if (!r) return;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.drawImage(img, r.x, r.y, r.w, r.h);
  }

  /** The scene standing back: black at (1 - STAND_BACK_GAIN) over the frame is a multiply by STAND_BACK_GAIN. */
  private standBack(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = `rgba(0, 0, 0, ${1 - STAND_BACK_GAIN})`;
    ctx.beginPath();
    ctx.rect(0, 0, HERO_ART.width, HERO_ART.height);
    ctx.fill();
    ctx.restore();
  }

  /** Sorceress: a flickering arc from the staff orb to the raised hand, re-rolled 16 times a second. */
  private lightning(ctx: CanvasRenderingContext2D, t: number, a: Point, b: Point): void {
    const seed = Math.floor(t * 16);
    const flicker = 0.7 + 0.3 * hash(seed * 3.3);
    const c = { x: (a.x + b.x) / 2 - 2, y: Math.min(a.y, b.y) - 22 - 4 * hash(seed) };
    const pts: Array<{ x: number; y: number }> = [];
    const segs = 16;
    for (let i = 0; i <= segs; i++) {
      const u = i / segs;
      const x = (1 - u) * (1 - u) * a.x + 2 * (1 - u) * u * c.x + u * u * b.x;
      const y = (1 - u) * (1 - u) * a.y + 2 * (1 - u) * u * c.y + u * u * b.y;
      const j = i === 0 || i === segs ? 0 : (hash(seed * 31 + i) - 0.5) * 6;
      pts.push({ x: x + j * 0.4, y: y + j });
    }
    const branchAt = 4 + Math.floor(hash(seed + 9) * 8);
    const branch: Array<{ x: number; y: number }> = [pts[branchAt]];
    for (let i = 1; i <= 4; i++) {
      const p = branch[i - 1];
      branch.push({ x: p.x + (hash(seed * 5 + i) - 0.3) * 6, y: p.y - 3 - hash(seed * 7 + i) * 3 });
    }
    const stroke = (line: Array<{ x: number; y: number }>, width: number, style: string) => {
      ctx.strokeStyle = style;
      ctx.lineWidth = width;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(line[0].x, line[0].y);
      for (const p of line.slice(1)) ctx.lineTo(p.x, p.y);
      ctx.stroke();
    };
    stroke(pts, 5, `rgba(90, 130, 255, ${0.22 * flicker})`);
    stroke(pts, 2.2, `rgba(150, 185, 255, ${0.65 * flicker})`);
    stroke(pts, 0.8, `rgba(245, 248, 255, ${flicker})`);
    stroke(branch, 1.6, `rgba(150, 185, 255, ${0.45 * flicker})`);
    stroke(branch, 0.5, `rgba(245, 248, 255, ${0.8 * flicker})`);
    for (const end of [a, b]) {
      const glow = ctx.createRadialGradient(end.x, end.y, 0, end.x, end.y, 9);
      glow.addColorStop(0, `rgba(200, 220, 255, ${0.75 * flicker})`);
      glow.addColorStop(1, 'rgba(90, 130, 255, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(end.x, end.y, 9, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
