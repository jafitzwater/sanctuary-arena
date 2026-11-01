import { HERO_ART, HERO_SPOTS, type HeroSpot } from './heroSelect';

/**
 * Hero select overlay (t373u-t375u): a canvas over the backdrop. Unselected heroes get a soft
 * shadow; the selected one is lifted (feathered copy of the art) with a glow pulse, a gentle
 * sway/bob, a cast circle at the feet, and a class effect. The Sorceress gets a live lightning
 * arc between her staff and raised hand. No new art: everything is drawn from the backdrop.
 */

/** Sorceress staff tip and raised hand in reference px (refine by eye: NEEDS JOSEPH). */
const STAFF_TIP = { x: 607.5, y: 152 };
const RAISED_HAND = { x: 656.5, y: 146 };

function hash(n: number): number {
  const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}

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
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, bw, bh);
    const k = bw / HERO_ART.width;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    const t = still ? 0 : time;
    for (const spot of HERO_SPOTS) if (spot.id !== selected) this.shade(ctx, spot);
    const spot = HERO_SPOTS.find((entry) => entry.id === selected);
    if (spot) this.highlight(ctx, spot, t, k, still);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  /** Soft vignette over an unselected hero. */
  private shade(ctx: CanvasRenderingContext2D, spot: HeroSpot): void {
    const cy = (spot.top + spot.feet) / 2;
    const ry = (spot.feet - spot.top) * 0.62;
    const rx = spot.w * 0.78;
    ctx.save();
    ctx.translate(spot.x, cy);
    ctx.scale(rx / ry, 1);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, ry);
    g.addColorStop(0, 'rgba(6, 4, 3, 0.5)');
    g.addColorStop(0.65, 'rgba(6, 4, 3, 0.36)');
    g.addColorStop(1, 'rgba(6, 4, 3, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, ry, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private highlight(ctx: CanvasRenderingContext2D, spot: HeroSpot, t: number, k: number, still: boolean): void {
    const [r, g, b] = spot.glow;
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.6);
    const dx = still ? 0 : Math.sin(t * 1.25) * 0.7;
    const dy = still ? 0 : -Math.abs(Math.sin(t * 1.9)) * 1.3;
    const cy = (spot.top + spot.feet) / 2;
    const height = spot.feet - spot.top;

    // Glow halo around the hero.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(spot.x, cy);
    ctx.scale((spot.w * 1.1) / (height * 0.7), 1);
    const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, height * 0.7);
    halo.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${0.1 + 0.08 * pulse})`);
    halo.addColorStop(0.6, `rgba(${r}, ${g}, ${b}, ${0.05 + 0.04 * pulse})`);
    halo.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, height * 0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Cast circle at the feet.
    this.castCircle(ctx, spot, t, pulse);

    // Lifted, brightened copy of the hero (sway/bob).
    this.liftHero(ctx, spot, dx, dy, k, 0.16 + 0.1 * pulse);

    ctx.save();
    ctx.translate(dx, dy);
    ctx.globalCompositeOperation = 'lighter';
    if (!still || spot.fx === 'lightning') this.classFx(ctx, spot, t);
    ctx.restore();
  }

  private castCircle(ctx: CanvasRenderingContext2D, spot: HeroSpot, t: number, pulse: number): void {
    const [r, g, b] = spot.glow;
    const rx = spot.w * 0.82;
    const ry = spot.w * 0.17;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(spot.x, spot.feet - 2);
    ctx.scale(1, ry / rx);
    const pool = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    pool.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${0.16 + 0.1 * pulse})`);
    pool.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
    ctx.fillStyle = pool;
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 1.1;
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${0.35 + 0.25 * pulse})`;
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

  private liftHero(ctx: CanvasRenderingContext2D, spot: HeroSpot, dx: number, dy: number, k: number, bright: number): void {
    const art = this.art;
    if (!art.complete || !art.naturalWidth) return;
    const sx = art.naturalWidth / HERO_ART.width;
    const boxW = spot.w * 1.7;
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
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = bright;
    ctx.drawImage(lift, x0 + dx, y0 + dy, boxW, boxH);
    ctx.restore();
  }

  private classFx(ctx: CanvasRenderingContext2D, spot: HeroSpot, t: number): void {
    switch (spot.fx) {
      case 'lightning':
        this.lightning(ctx, t);
        break;
      case 'fury':
        this.motes(ctx, spot, t, 'rise', 14, [255, 120, 50], 0.9);
        break;
      case 'holy':
        this.rays(ctx, spot, t);
        this.motes(ctx, spot, t, 'fall', 10, [255, 236, 170], 0.7);
        break;
      case 'bone':
        this.motes(ctx, spot, t, 'orbit', 9, [140, 255, 180], 1.1);
        break;
      case 'arrow':
        this.arrowStreak(ctx, spot, t);
        this.motes(ctx, spot, t, 'orbit', 7, [255, 206, 120], 0.7);
        break;
      case 'shadow':
        this.motes(ctx, spot, t, 'drift', 10, [170, 110, 255], 1.6);
        break;
      case 'nature':
        this.motes(ctx, spot, t, 'orbit', 10, [150, 230, 110], 1.0);
        break;
    }
  }

  /** Small glowing particles; positions are a pure function of time (no per-frame state). */
  private motes(
    ctx: CanvasRenderingContext2D,
    spot: HeroSpot,
    t: number,
    mode: 'rise' | 'fall' | 'orbit' | 'drift',
    count: number,
    [r, g, b]: [number, number, number],
    size: number,
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
      const alpha = Math.sin(phase * Math.PI) * 0.8;
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

  /** Paladin: soft beams of light falling on him. */
  private rays(ctx: CanvasRenderingContext2D, spot: HeroSpot, t: number): void {
    for (let i = 0; i < 3; i++) {
      const x = spot.x + (i - 1) * spot.w * 0.28;
      const a = 0.07 + 0.05 * Math.sin(t * 1.7 + i * 2.1);
      const beam = ctx.createLinearGradient(x, spot.top - 60, x, spot.feet);
      beam.addColorStop(0, 'rgba(255, 236, 170, 0)');
      beam.addColorStop(0.4, `rgba(255, 236, 170, ${a})`);
      beam.addColorStop(1, 'rgba(255, 236, 170, 0)');
      ctx.fillStyle = beam;
      ctx.fillRect(x - 5, spot.top - 60, 10, spot.feet - spot.top + 60);
    }
  }

  /** Amazon: a glowing arrow streak loosed every couple of seconds. */
  private arrowStreak(ctx: CanvasRenderingContext2D, spot: HeroSpot, t: number): void {
    const cycle = (t / 2.2) % 1;
    if (cycle > 0.35) return;
    const p = cycle / 0.35;
    const sx = spot.x - 6;
    const sy = spot.top + 40;
    const x = sx - p * 150;
    const y = sy - p * 26;
    const tail = ctx.createLinearGradient(x, y, x + 34, y + 6);
    tail.addColorStop(0, `rgba(255, 230, 160, ${0.9 * (1 - p)})`);
    tail.addColorStop(1, 'rgba(255, 200, 100, 0)');
    ctx.strokeStyle = tail;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 34, y + 6);
    ctx.stroke();
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
