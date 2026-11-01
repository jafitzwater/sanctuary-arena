import { HERO_ART, HERO_EFFECTS, HERO_SPOTS, heroLooks, type HeroEffect, type HeroLook, type HeroSpot } from './heroSelect';

/**
 * Hero select overlay (t373u-t375u, t378u): a canvas over the backdrop, redrawn from scratch every frame
 * from `heroLooks(selected)` (no per-hero state survives a frame). Heroes standing back are darkened to a
 * common level (the backdrop was captured with the Sorceress lit, so she gets the most shade); the selected
 * one is a lifted, brightened copy of the art with a glow pulse, a sway/bob, a cast circle and its class
 * effect (Sorceress lightning, Barbarian rage, Paladin holy light, Necromancer soul wisps, Amazon sparks and
 * wind, Assassin / Druid a subtle cold glow). No new art: everything is drawn from the backdrop.
 */

/** Sorceress staff tip and raised hand in reference px (refine by eye: NEEDS JOSEPH). */
const STAFF_TIP = { x: 607.5, y: 152 };
const RAISED_HAND = { x: 656.5, y: 146 };

type Rgb = [number, number, number];

function hash(n: number): number {
  const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}

const rgba = ([r, g, b]: Rgb, a: number): string => `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, a))})`;

export class HeroSelectFx {
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly lift = document.createElement('canvas');
  private w = 0;
  private h = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly art: HTMLImageElement,
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
    const t = still ? 0 : time;
    const looks = heroLooks(selected);
    const lit = looks.find((look) => look.lit);
    const litSpot = lit ? HERO_SPOTS.find((spot) => spot.id === lit.id) : undefined;
    const litFx = lit ? HERO_EFFECTS[lit.id] : undefined;
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.6);
    const dx = lit?.sway && !still ? Math.sin(t * 1.25) * 0.7 : 0;
    const dy = lit?.sway && !still ? -Math.abs(Math.sin(t * 1.9)) * 1.3 : 0;
    // 1) the lit hero's lifted copy, 2) everyone else's shade on top (so a neighbour caught in the lifted
    // box is still shaded), 3) the lit hero's glow, cast circle and effect.
    if (lit && litSpot) this.liftHero(ctx, litSpot, dx, dy, k, lit.lift);
    for (const look of looks) {
      const spot = HERO_SPOTS.find((entry) => entry.id === look.id);
      if (spot && !look.lit) this.standBack(ctx, spot, look);
    }
    if (lit && litSpot && litFx) this.highlight(ctx, litSpot, litFx, lit, t, pulse, dx, dy, still);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  /** Darken a hero standing back to the common level: black at (1 - gain) is a multiply by gain. */
  private standBack(ctx: CanvasRenderingContext2D, spot: HeroSpot, look: HeroLook): void {
    const a = 1 - look.gain;
    if (a <= 0) return;
    const cy = (spot.top + spot.feet) / 2;
    this.shadeEllipse(ctx, spot.x, cy, spot.w * 0.86, (spot.feet - spot.top) * 0.68, a);
    for (const extra of spot.bakedGlow ?? []) this.shadeEllipse(ctx, extra.x, extra.y, extra.rx, extra.ry, a * 0.6, true);
  }

  private shadeEllipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, a: number, soft = false): void {
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.translate(x, y);
    ctx.scale(rx / ry, 1);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, ry);
    g.addColorStop(0, `rgba(4, 3, 2, ${a})`);
    g.addColorStop(soft ? 0.45 : 0.75, `rgba(4, 3, 2, ${a * (soft ? 0.6 : 0.92)})`);
    g.addColorStop(1, 'rgba(4, 3, 2, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, ry, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private highlight(
    ctx: CanvasRenderingContext2D,
    spot: HeroSpot,
    effect: HeroEffect,
    look: HeroLook,
    t: number,
    pulse: number,
    dx: number,
    dy: number,
    still: boolean,
  ): void {
    const s = look.glow;
    const cy = (spot.top + spot.feet) / 2;
    const height = spot.feet - spot.top;
    // Barbarian rage beats harder and faster than the others' glow.
    const beat = effect.fx === 'rage' ? Math.pow(0.5 + 0.5 * Math.sin(t * 5.2), 3) : pulse;
    const haloA = effect.fx === 'rage' ? 0.12 + 0.2 * beat : 0.1 + 0.08 * beat;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(spot.x + dx, cy + dy);
    ctx.scale((spot.w * 1.1) / (height * 0.7), 1);
    const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, height * 0.7);
    halo.addColorStop(0, rgba(effect.glow, haloA * s));
    halo.addColorStop(0.6, rgba(effect.glow, haloA * 0.5 * s));
    halo.addColorStop(1, rgba(effect.glow, 0));
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, height * 0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    this.castCircle(ctx, spot, effect.glow, t, pulse, s);

    ctx.save();
    ctx.translate(dx, dy);
    ctx.globalCompositeOperation = 'lighter';
    if (!still || effect.fx === 'lightning') this.classFx(ctx, spot, effect, t, s);
    ctx.restore();
  }

  private castCircle(ctx: CanvasRenderingContext2D, spot: HeroSpot, [r, g, b]: Rgb, t: number, pulse: number, s: number): void {
    const rx = spot.w * 0.82;
    const ry = spot.w * 0.17;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(spot.x, spot.feet - 2);
    ctx.scale(1, ry / rx);
    const pool = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    pool.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${(0.16 + 0.1 * pulse) * s})`);
    pool.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
    ctx.fillStyle = pool;
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 1.1;
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${(0.35 + 0.25 * pulse) * s})`;
    ctx.beginPath();
    ctx.arc(0, 0, rx * 0.8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.rotate(t * 0.6);
    ctx.lineWidth = 0.9;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(0, 0, rx * 0.95, a, a + 0.22);
      ctx.stroke();
    }
    ctx.restore();
  }

  private liftHero(ctx: CanvasRenderingContext2D, spot: HeroSpot, dx: number, dy: number, k: number, gain: number): void {
    const art = this.art;
    if (!art.complete || !art.naturalWidth) return;
    const sx = art.naturalWidth / HERO_ART.width;
    const boxW = spot.w * 1.45;
    const boxH = spot.feet - spot.top + 26;
    const x0 = spot.x - boxW / 2;
    const y0 = spot.top - 16;
    const pw = Math.max(1, Math.round(boxW * k));
    const ph = Math.max(1, Math.round(boxH * k));
    const lift = this.lift;
    if (lift.width !== pw || lift.height !== ph) {
      lift.width = pw;
      lift.height = ph;
    }
    const lc = lift.getContext('2d');
    if (!lc) return;
    lc.globalCompositeOperation = 'source-over';
    lc.clearRect(0, 0, pw, ph);
    lc.drawImage(art, x0 * sx, y0 * sx, boxW * sx, boxH * sx, 0, 0, pw, ph);
    // Feathered ellipse so the moving copy melts into the backdrop.
    lc.globalCompositeOperation = 'destination-in';
    lc.save();
    lc.translate(pw / 2, ph / 2);
    lc.scale(pw / ph, 1);
    const fade = lc.createRadialGradient(0, 0, 0, 0, 0, ph / 2);
    fade.addColorStop(0, 'rgba(0,0,0,1)');
    fade.addColorStop(0.62, 'rgba(0,0,0,1)');
    fade.addColorStop(1, 'rgba(0,0,0,0)');
    lc.fillStyle = fade;
    lc.fillRect(-ph / 2, -ph / 2, ph, ph);
    lc.restore();
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(lift, x0 + dx, y0 + dy, boxW, boxH);
    // gain = 1 + extra: 'lighter' adds the copy onto itself (one full pass doubles it).
    ctx.globalCompositeOperation = 'lighter';
    for (let extra = gain - 1; extra > 0.001; extra -= 1) {
      ctx.globalAlpha = Math.min(1, extra);
      ctx.drawImage(lift, x0 + dx, y0 + dy, boxW, boxH);
    }
    ctx.restore();
  }

  private classFx(ctx: CanvasRenderingContext2D, spot: HeroSpot, effect: HeroEffect, t: number, s: number): void {
    switch (effect.fx) {
      case 'lightning':
        this.lightning(ctx, t);
        break;
      case 'rage':
        this.motes(ctx, spot, t, 'rise', 16, effect.glow, 1.0, s);
        this.motes(ctx, spot, t * 1.3 + 4, 'rise', 8, effect.accent, 0.7, s);
        break;
      case 'holy':
        this.rays(ctx, spot, t, effect.accent, s);
        this.motes(ctx, spot, t, 'fall', 10, effect.glow, 0.7, s);
        break;
      case 'souls':
        this.wisps(ctx, spot, t, effect.glow, effect.accent, s);
        break;
      case 'sparks':
        this.windStreaks(ctx, spot, t, effect.accent, s);
        this.motes(ctx, spot, t, 'orbit', 8, effect.glow, 0.7, s);
        this.motes(ctx, spot, t * 1.4 + 2, 'drift', 6, effect.accent, 0.6, s);
        break;
      case 'cold':
        this.motes(ctx, spot, t * 0.6, 'drift', 7, effect.accent, 0.9, s);
        break;
    }
  }

  /** Necromancer: soul wisps (alternating green and violet) circling him with short trails. */
  private wisps(ctx: CanvasRenderingContext2D, spot: HeroSpot, t: number, green: Rgb, violet: Rgb, s: number): void {
    const height = spot.feet - spot.top;
    const cy = (spot.top + spot.feet) / 2;
    for (let i = 0; i < 6; i++) {
      const colour = i % 2 ? violet : green;
      const speed = 0.35 + 0.15 * hash(i * 3.7);
      const base = hash(i * 1.9) * Math.PI * 2;
      for (let j = 0; j < 5; j++) {
        const a = base + (t - j * 0.05) * speed * Math.PI * 2;
        const x = spot.x + Math.cos(a) * spot.w * 0.6;
        const y = cy + (hash(i * 5.3) - 0.5) * height * 0.7 + Math.sin(a) * 5 - Math.sin(t * 1.3 + i) * 4;
        const rad = (2.6 - j * 0.4) * (0.8 + 0.4 * hash(i));
        const alpha = (0.7 - j * 0.13) * (0.55 + 0.45 * Math.sin(a * 0.5 + i) ** 2) * s;
        const glow = ctx.createRadialGradient(x, y, 0, x, y, rad * 2.2);
        glow.addColorStop(0, rgba(colour, alpha));
        glow.addColorStop(1, rgba(colour, 0));
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, rad * 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /** Amazon: light wind streaks sweeping past her, every so often. */
  private windStreaks(ctx: CanvasRenderingContext2D, spot: HeroSpot, t: number, colour: Rgb, s: number): void {
    const height = spot.feet - spot.top;
    for (let i = 0; i < 3; i++) {
      const cycle = (t / 2.4 + i * 0.33) % 1;
      if (cycle > 0.5) continue;
      const p = cycle / 0.5;
      const y = spot.top + height * (0.3 + 0.2 * i) + Math.sin(t + i) * 2;
      const x = spot.x - spot.w * 0.9 + p * spot.w * 1.8;
      const len = 22;
      const grad = ctx.createLinearGradient(x - len, y, x, y);
      grad.addColorStop(0, rgba(colour, 0));
      grad.addColorStop(1, rgba(colour, 0.55 * Math.sin(p * Math.PI) * s));
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.1;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x - len, y + 3);
      ctx.quadraticCurveTo(x - len / 2, y - 2, x, y);
      ctx.stroke();
    }
  }

  /** Small glowing particles; positions are a pure function of time (no per-frame state). */
  private motes(
    ctx: CanvasRenderingContext2D,
    spot: HeroSpot,
    t: number,
    mode: 'rise' | 'fall' | 'orbit' | 'drift',
    count: number,
    [r, g, b]: Rgb,
    size: number,
    s = 1,
  ): void {
    const height = spot.feet - spot.top;
    const cy = (spot.top + spot.feet) / 2;
    for (let i = 0; i < count; i++) {
      const seed = hash(i + spot.x);
      const speed = 0.25 + 0.25 * hash(i * 7.1 + spot.x);
      const phase = (t * speed + seed) % 1;
      let x = spot.x;
      let y = cy;
      if (mode === 'rise' || mode === 'fall') {
        x = spot.x + (seed - 0.5) * spot.w * 1.1 + Math.sin(t * 2 + i) * 2;
        y = mode === 'rise' ? spot.feet - phase * height * 1.05 : spot.top - 10 + phase * height;
      } else if (mode === 'orbit') {
        const a = phase * Math.PI * 2;
        x = spot.x + Math.cos(a) * spot.w * 0.62;
        y = cy + (seed - 0.5) * height * 0.8 + Math.sin(a) * 4;
      } else {
        x = spot.x + (seed - 0.5) * spot.w * 1.3 + Math.sin(t * 0.7 + i) * 4;
        y = spot.feet - 8 - phase * height * 0.45;
      }
      const alpha = Math.sin(phase * Math.PI) * 0.8 * s;
      const rad = size * (1.6 + seed);
      const glow = ctx.createRadialGradient(x, y, 0, x, y, rad * 2.4);
      glow.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha})`);
      glow.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, rad * 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** Paladin: soft golden beams of light falling on him. */
  private rays(ctx: CanvasRenderingContext2D, spot: HeroSpot, t: number, colour: Rgb, s: number): void {
    for (let i = 0; i < 3; i++) {
      const x = spot.x + (i - 1) * spot.w * 0.28;
      const a = (0.08 + 0.05 * Math.sin(t * 1.7 + i * 2.1)) * s;
      const beam = ctx.createLinearGradient(x, spot.top - 60, x, spot.feet);
      beam.addColorStop(0, rgba(colour, 0));
      beam.addColorStop(0.4, rgba(colour, a));
      beam.addColorStop(1, rgba(colour, 0));
      ctx.fillStyle = beam;
      ctx.fillRect(x - 5, spot.top - 60, 10, spot.feet - spot.top + 60);
    }
  }

  /** Sorceress: a jagged arc between staff tip and raised hand, re-rolled ~16 times a second. */
  private lightning(ctx: CanvasRenderingContext2D, t: number): void {
    const seed = Math.floor(t * 16);
    const flicker = 0.7 + 0.3 * hash(seed * 3.3);
    const a = STAFF_TIP;
    const b = RAISED_HAND;
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
