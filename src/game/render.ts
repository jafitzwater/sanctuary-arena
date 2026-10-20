import { actProps, d2Atlas, heroDrawBox, heroRunDraw, isObeliskBackground, isSheetMatte, mephisto, PATH_OBELISK, pr23Boulders, pr23Cast, type CastSheet, type FrameSheet } from './art/sheets';
import {
  animFrame,
  heroGaitStep,
  heroHoldCompass,
  heroSheetRow,
  RUN_FRAME_MS,
  RUN_FRAMES,
  WALK_FRAME_MS,
  WALK_FRAMES,
} from './gait';
import type { ActDef } from './data/acts/types';
import { projectIso, unprojectIso } from './iso';
import type { Prop } from './landscape';
import { sceneryFor } from './landscape';
import { nearestOnPolyline, type Vec } from './math';
import { player } from './query';
import { GROUND_BASE, groundAt, type GroundKind } from './terrain';
import type { Camera, Sim, Unit } from './types';

export interface DrawOpts {
  mode: 'title' | 'play' | 'end';
  targetId: number | null;
  attack: boolean;
  time: number;
}

const BAKE_HW = 0.85;
const PAD = 64;
/** World units visible across the screen. Larger means a wider, smaller-sprite view. */
const WORLD_ACROSS = 1040;

type Sheet = HTMLImageElement | HTMLCanvasElement;
type ArmorTier = 'light' | 'medium' | 'heavy';

interface Glyph {
  img: Sheet;
  flip: boolean;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  /** Opaque foot inside the cell, in source pixels. */
  foot?: { x: number; y: number };
  /** Hero frames keep native pixels. The draw scale does not depend on the cell. */
  hero?: boolean;
  /** Set for the 12-frame run sheet. Walk and idle stay on the trimmed bottom. */
  runRow?: number;
  runCol?: number;
}

/** Grass side of each blend diamond, in screen space: east, south, west, north. */
const BLEND_GRASS: readonly Vec[] = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
];

function crisp(ctx: CanvasRenderingContext2D): void {
  ctx.imageSmoothingEnabled = false;
}

/** #FF00FF and the near-magenta NPC matte, plus a despill of pixels that touch it. */
/** Frame index while moving. Off unless the page is opened with ?animlog=1. */
const ANIM_LOG =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('animlog') === '1';

function nearMagenta(r: number, g: number, b: number, a: number): boolean {
  if (a < 16) return true;
  if (g > 110) return false;
  const rb = Math.min(r, b);
  return r > 170 && b > 120 && rb - g > 70 && Math.abs(r - b) < 120;
}

function stripMatte(data: ImageData, broad = false): void {
  const px = data.data;
  const w = data.width;
  const h = data.height;
  const kill = new Uint8Array(w * h);
  for (let p = 0; p < kill.length; p++) {
    const i = p * 4;
    const matte = broad
      ? isSheetMatte(px[i], px[i + 1], px[i + 2], px[i + 3])
      : nearMagenta(px[i], px[i + 1], px[i + 2], px[i + 3]);
    if (matte) kill[p] = 1;
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      const i = p * 4;
      if (kill[p]) {
        px[i] = 0;
        px[i + 1] = 0;
        px[i + 2] = 0;
        px[i + 3] = 0;
        continue;
      }
      const edge =
        (x > 0 && kill[p - 1] === 1) ||
        (x + 1 < w && kill[p + 1] === 1) ||
        (y > 0 && kill[p - w] === 1) ||
        (y + 1 < h && kill[p + w] === 1);
      if (!edge) continue;
      const spill = Math.min(px[i], px[i + 2]) - px[i + 1];
      if (spill > 12) {
        px[i] = Math.max(0, px[i] - spill);
        px[i + 2] = Math.max(0, px[i + 2] - spill);
      }
    }
  }
}

function loadImage(src: string): HTMLImageElement {
  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  return img;
}

/**
 * Isometric view of Sanctuary. The ground is baked once. Characters are
 * billboards from one sheet per state, drawn at whole pixels.
 */
export class Renderer {
  camera: Camera = { x: 0, y: 0, viewW: 800, viewH: 500, zoom: 1, cssW: 800, cssH: 500, dpr: 1 };
  private ctx: CanvasRenderingContext2D;
  private mapCanvas: HTMLCanvasElement | null = null;
  private mapKey = '';
  private scenery: Prop[] = [];
  private snapped = false;
  private focusX = 0;
  private focusY = 0;
  private camBakeX = 0;
  private camBakeY = 0;
  private scale = 1;
  private ox = 0;
  private oy = 0;
  private reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private gait = new Map<number, { x: number; y: number; d: number; elapsed: number }>();
  private facingRow = new Map<number, number>();
  private heroCompass = new Map<number, number>();
  private aim = new Map<number, number>();
  private feet = new WeakMap<HTMLImageElement, Map<string, { x: number; y: number }>>();
  private trims = new WeakMap<HTMLImageElement, Map<string, { x: number; y: number; w: number; h: number } | null>>();
  private frameDt = 0;
  private readonly obelisks = new WeakMap<HTMLImageElement, Map<string, Glyph>>();
  private floor: HTMLCanvasElement | null = null;
  private readonly cutouts = new WeakMap<HTMLImageElement, HTMLCanvasElement>();
  private readonly cutSources = new Set<HTMLImageElement>();
  private readonly pr23Sources = new Set<HTMLImageElement>();
  private readonly loaded = new Map<string, HTMLImageElement>();
  private readonly props = {
    tree: actProps.tree.map(loadImage),
    rock: actProps.rock.map(loadImage),
    fence: actProps.fence.map(loadImage),
    stump: actProps.stump.map(loadImage),
    wagon: actProps.wagon.map(loadImage),
    tent: actProps.tent.map(loadImage),
    stone: actProps.stone.map(loadImage),
  };
  private readonly boulders = pr23Boulders.map((src) => this.sheet(src));
  private readonly d2 = {
    light: {
      idle: loadImage(d2Atlas.light.idle),
      walk: loadImage(d2Atlas.light.walk),
      run: loadImage(d2Atlas.light.run),
      attack: loadImage(d2Atlas.light.attack),
    },
    medium: {
      idle: loadImage(d2Atlas.medium.idle),
      walk: loadImage(d2Atlas.medium.walk),
      run: loadImage(d2Atlas.medium.run),
      attack: loadImage(d2Atlas.medium.attack),
    },
    heavy: {
      idle: loadImage(d2Atlas.heavy.idle),
      walk: loadImage(d2Atlas.heavy.walk),
      run: loadImage(d2Atlas.heavy.run),
      attack: loadImage(d2Atlas.heavy.attack),
    },
  };
  private readonly akaraSheet = loadImage(d2Atlas.akara);
  private readonly bannerSheet = loadImage(d2Atlas.banner);
  private readonly ground = loadImage(d2Atlas.ground);

  private sheet(src: string): HTMLImageElement {
    const hit = this.loaded.get(src);
    if (hit) return hit;
    const img = loadImage(src);
    this.loaded.set(src, img);
    this.pr23Sources.add(img);
    return img;
  }

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D is unavailable');
    this.ctx = ctx;
    for (const img of [
      ...this.props.tree,
      ...this.props.rock,
      ...this.props.fence,
      ...this.props.stump,
      ...this.props.wagon,
      ...this.props.tent,
      ...this.props.stone,
      this.akaraSheet,
    ]) this.cutSources.add(img);
    const bump = () => {
      this.mapKey = '';
      this.floor = null;
    };
    this.ground.onload = bump;
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const cssW = Math.max(1, rect.width);
    const cssH = Math.max(1, rect.height);
    const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
    this.canvas.style.imageRendering = 'pixelated';
    const width = Math.round(cssW * dpr);
    const height = Math.round(cssH * dpr);
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.camera.cssW = cssW;
    this.camera.cssH = cssH;
    this.camera.dpr = dpr;
    const hw = cssW / WORLD_ACROSS;
    this.camera.viewW = WORLD_ACROSS;
    this.camera.viewH = cssH / (hw * 0.5);
    this.camera.zoom = hw;
  }

  screenToWorld(sx: number, sy: number): Vec {
    return unprojectIso(
      this.camBakeX + sx / this.scale,
      this.camBakeY + sy / this.scale,
      BAKE_HW,
      this.ox,
      this.oy,
    );
  }

  updateCamera(sim: Sim, mode: DrawOpts['mode'], dt: number, time: number): void {
    this.frameDt = dt;
    const focus = this.focus(sim, mode, time);
    if (!this.snapped) {
      this.focusX = focus.x;
      this.focusY = focus.y;
      this.snapped = true;
    } else {
      const t = 1 - Math.exp(-dt * 6);
      this.focusX += (focus.x - this.focusX) * t;
      this.focusY += (focus.y - this.focusY) * t;
    }
    let fx = this.focusX;
    let fy = this.focusY;
    if (!this.reduceMotion && sim.shake > 0) {
      fx += Math.sin(time * 42) * sim.shake;
      fy += Math.cos(time * 37) * sim.shake * 0.6;
    }
    const hw = BAKE_HW;
    this.ox = sim.map.height * hw + PAD;
    this.oy = PAD;
    const projected = projectIso(fx, fy, hw, this.ox, this.oy);
    this.scale = this.camera.zoom / hw;
    this.camBakeX = projected.x - this.camera.cssW / 2 / this.scale;
    this.camBakeY = projected.y - this.camera.cssH * 0.56 / this.scale;
    this.camera.x = fx - this.camera.viewW / 2;
    this.camera.y = fy - this.camera.viewH / 2;
  }

  draw(sim: Sim, opts: DrawOpts): void {
    this.ensureMap(sim.map);
    const ctx = this.ctx;
    const { dpr, cssW, cssH } = this.camera;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    crisp(ctx);
    ctx.fillStyle = '#1c2410';
    ctx.fillRect(0, 0, cssW, cssH);
    if (this.mapCanvas) {
      const srcX = Math.round(this.camBakeX);
      const srcY = Math.round(this.camBakeY);
      const srcW = Math.max(1, Math.round(cssW / this.scale));
      const srcH = Math.max(1, Math.round(cssH / this.scale));
      ctx.drawImage(this.mapCanvas, srcX, srcY, srcW, srcH, 0, 0, cssW, cssH);
    }

    const u = this.spriteScale();
    // Screen foot-Y is (x + y). Props lose ties so a unit at the same base draws in front.
    const layers: { depth: number; front: number; paint: () => void }[] = [];
    for (const prop of this.scenery) {
      layers.push({
        depth: prop.x + prop.y,
        front: 0,
        paint: () => this.drawScenery(ctx, prop, u),
      });
    }

    const units = sim.units.filter((unit) => unit.alive || unit.corpse > 0 || unit.kind !== 'minion');
    for (const unit of units) {
      layers.push({
        depth: unit.x + unit.y,
        front: 1,
        paint: () => this.drawUnit(ctx, unit, opts, u, this.armorTier(sim), sim.playerId),
      });
    }
    layers.sort((a, b) => a.depth - b.depth || a.front - b.front);
    for (const layer of layers) layer.paint();

    for (const shot of sim.projectiles) {
      const p = this.project(shot.x, shot.y);
      ctx.fillStyle = shot.color;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 4.5, 2.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const fx of sim.fx) this.drawFx(ctx, fx);

    const vignette = ctx.createRadialGradient(cssW / 2, cssH / 2, cssH * 0.2, cssW / 2, cssH / 2, cssH * 0.78);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, cssW, cssH);
    this.drawMinimap(sim, opts.targetId);
  }

  private spriteScale(): number {
    const { cssW, cssH } = this.camera;
    return Math.max(0.58, Math.min(1.15, Math.min(cssW, cssH * 1.85) / 980));
  }

  private project(x: number, y: number): Vec {
    const p = projectIso(x, y, BAKE_HW, this.ox, this.oy);
    return { x: (p.x - this.camBakeX) * this.scale, y: (p.y - this.camBakeY) * this.scale };
  }

  private focus(sim: Sim, mode: DrawOpts['mode'], time: number): Vec {
    if (mode === 'title') {
      const lane = sim.map.lane;
      const u = (time % 48) / 48;
      const idx = u * (lane.length - 1);
      const i = Math.min(lane.length - 2, Math.floor(idx));
      const f = idx - i;
      return {
        x: lane[i].x + (lane[i + 1].x - lane[i].x) * f,
        y: lane[i].y + (lane[i + 1].y - lane[i].y) * f,
      };
    }
    const hero = player(sim);
    return {
      x: hero.x + Math.cos(hero.facing) * 28,
      y: hero.y + Math.sin(hero.facing) * 18,
    };
  }

  private ensureMap(map: ActDef): void {
    const ready = this.ground.complete && this.ground.naturalWidth >= 640;
    const key = `${map.id}:${ready ? this.ground.naturalWidth : 0}`;
    if (this.mapCanvas && this.mapKey === key) return;
    const hw = BAKE_HW;
    const width = Math.ceil((map.width + map.height) * hw + PAD * 2);
    const height = Math.ceil((map.width + map.height) * hw * 0.5 + PAD * 2);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const ox = map.height * hw + PAD;
    const oy = PAD;
    crisp(ctx);
    ctx.fillStyle = '#1c2410';
    ctx.fillRect(0, 0, width, height);
    if (ready) this.stampGround(ctx, map, ox, oy, hw);
    this.scenery = sceneryFor(map);
    this.mapCanvas = canvas;
    this.mapKey = key;
  }

  /** Stamp 160×80 Act I diamonds on the iso grid. Identity transform, so they are not skewed twice. */
  private stampGround(ctx: CanvasRenderingContext2D, map: ActDef, ox: number, oy: number, hw: number): void {
    const step = 80 / hw;
    const rows: Record<GroundKind, number> = {
      grass: 0,
      edge: 1,
      path: 2,
      town: 3,
      pale: 4,
      river: 5,
      bank: 1,
      dark: 5,
      blend: 6,
    };
    const i1 = Math.ceil(map.width / step) + 2;
    const j1 = Math.ceil(map.height / step) + 2;
    for (let j = -2; j <= j1; j++) {
      for (let i = -2; i <= i1; i++) {
        const kind = groundAt(map, i * step, j * step);
        const sx = Math.round((i - j) * 80 + ox);
        const sy = Math.round((i + j) * 40 + oy);
        // Grass under every diamond, then the road or transition. Alpha edges show grass, not a void.
        this.paintDiamond(ctx, rows, GROUND_BASE, floorCol(GROUND_BASE, i, j), sx, sy);
        if (kind !== GROUND_BASE) {
          const col = kind === 'blend' ? this.blendCol(map, i * step, j * step) : floorCol(kind, i, j);
          this.paintDiamond(ctx, rows, kind, col, sx, sy);
        }
      }
    }
  }

  private drawScenery(ctx: CanvasRenderingContext2D, prop: Prop, u: number): void {
    const p = this.project(prop.x, prop.y);
    if (p.x < -180 || p.y < -220 || p.x > this.camera.cssW + 180 || p.y > this.camera.cssH + 40) return;
    const height =
      prop.kind === 'tree' ? 168 :
      prop.kind === 'tent' ? 108 :
      prop.kind === 'fence' ? 110 :
      prop.kind === 'stump' ? 52 :
      prop.kind === 'wagon' ? 78 :
      prop.kind === 'npc' ? 102 :
      prop.kind === 'rock' && prop.variant >= 3 ? 104 :
      72;
    const sheet =
      prop.kind === 'npc' ? this.akaraSheet :
      prop.kind === 'tree' ? this.props.tree[prop.variant % this.props.tree.length] :
      prop.kind === 'rock' ? (prop.variant >= 3 ? this.boulders[(prop.variant - 3) % this.boulders.length] : this.props.rock[prop.variant % this.props.rock.length]) :
      prop.kind === 'fence' ? this.props.fence[prop.variant % this.props.fence.length] :
      prop.kind === 'stump' ? this.props.stump[prop.variant % this.props.stump.length] :
      prop.kind === 'wagon' ? this.props.wagon[prop.variant % this.props.wagon.length] :
      this.props.tent[prop.variant % this.props.tent.length];
    if (sheet.complete && sheet.naturalWidth > 0) this.blit(ctx, sheet, p.x, p.y, height * u, prop.flip);
  }

  private drawUnit(ctx: CanvasRenderingContext2D, unit: Unit, opts: DrawOpts, u: number, tier: ArmorTier, playerId = -1): void {
    const p = this.project(unit.x, unit.y);
    if (p.x < -160 || p.y < -200 || p.x > this.camera.cssW + 160 || p.y > this.camera.cssH + 60) return;
    const gait = this.gaitOf(unit);
    let y = p.y;
    if (unit.leap) {
      const t = Math.min(1, unit.leap.t / unit.leap.dur);
      y -= Math.sin(t * Math.PI) * 48 * u;
    }
    const height = Math.max(1, Math.round(this.unitHeight(unit) * u));
    const footX = Math.round(p.x);
    const footY = Math.round(p.y);
    y = Math.round(y);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(footX, footY, Math.max(4, Math.round(height * 0.16)), Math.max(2, Math.round(height * 0.06)), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    if (!unit.alive) ctx.globalAlpha = 0.55;
    else if ((unit.invuln > 0 || unit.hitFlash > 0) && Math.sin(opts.time * 28) > 0) ctx.globalAlpha = 0.55;
    if (!unit.alive && (unit.kind === 'minion' || unit.kind === 'champion')) {
      ctx.translate(footX, y);
      ctx.scale(1, 0.5);
      ctx.translate(-footX, -y);
    }
    const glyph = this.sheetFor(unit, gait.moving, gait.d, gait.elapsed, gait.walking, tier, unit.id === playerId, opts.time);
    const outlined = unit.kind === 'minion' || unit.kind === 'champion';
    if (glyph?.hero && glyph.runRow != null && glyph.runCol != null) {
      const run = heroRunDraw(footX, y, glyph.sw, glyph.sh, tier, glyph.runRow, glyph.runCol, u);
      // drawX = x - frameWidth/2: the trimmed frame stays centered. The row baseline lifts a raised foot.
      this.blit(ctx, glyph.img, footX, y - run.lift * run.scale, run.frameHeight, glyph.flip, glyph, outlined, run.frameWidth);
    } else if (glyph?.hero) {
      const drawn = heroDrawBox(footX, y, glyph.sw, glyph.sh, tier, u);
      this.blit(ctx, glyph.img, footX, y, drawn.frameHeight, glyph.flip, glyph, outlined, drawn.frameWidth);
    } else if (glyph) {
      this.blit(ctx, glyph.img, footX, y, height, glyph.flip, glyph, outlined);
    }
    if (unit.whirlT > 0) {
      ctx.strokeStyle = 'rgba(240, 220, 170, 0.8)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(p.x, y - height * 0.45, height * 0.55, height * 0.22, opts.time * 6, 0, Math.PI * 1.4);
      ctx.stroke();
    }
    ctx.restore();
    if (unit.buffT > 0 && unit.alive) {
      ctx.strokeStyle = 'rgba(230, 211, 161, 0.75)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, height * 0.34, height * 0.14, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (unit.alive && (unit.kind !== 'minion' || unit.hp < unit.maxHp)) {
      this.drawBar(unit, footX, y, height, opts.targetId);
    }
    if (unit.stun > 0 && unit.alive) {
      ctx.fillStyle = '#f0e2bc';
      ctx.font = '14px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText('✶', p.x, y - height - 8);
    }
  }

  private unitHeight(unit: Unit): number {
    if (unit.objective === 'herald' || unit.objective === 'baron') return 156;
    if (unit.objective === 'dragon') return 148;
    if (unit.defId === 'fallen' && unit.name === 'Bishibosh') return 92;
    switch (unit.defId) {
      case 'barbarian':
        return 108;
      case 'blood-raven':
        return 140;
      case 'fallen':
        return 80;
      case 'zombie':
        return 104;
      case 'quillrat':
        return 72;
      case 'skeleton':
        return 96;
      case 'hungry-dead':
        return 108;
      case 'goatman':
        return 104;
      case 'willowisp':
        return 76;
      case 'mummy':
        return 112;
      case 'demon':
        return 116;
      case 'seal':
        return 120;
      case 'rogue':
      case 'rogue-archer':
        return 100;
      case 'tower':
        return unit.alive ? 128 : 70;
      case 'base-ally':
      case 'base-enemy':
        return unit.alive ? 220 : 120;
      default:
        return 70;
    }
  }

  private sheetFor(
    unit: Unit,
    moving: boolean,
    phase: number,
    elapsed: number,
    walking: boolean,
    tier: ArmorTier,
    logFrames = false,
    time = 0,
  ): Glyph | null {
    if (unit.defId === 'barbarian') {
      const pack = this.d2[tier];
      // Joystick compass, 15° deadband. Changing row does not reset the frame clock.
      const facing = heroSheetRow(this.holdHero(unit.id, unit.facing));
      if (!unit.alive) return this.heroGlyph(pack.idle, 1, 0, facing);
      if (unit.whirlT > 0) return this.heroGlyph(pack.run, RUN_FRAMES, Math.floor(phase / 10) % RUN_FRAMES, facing, true);
      if (unit.leap) return this.heroGlyph(pack.attack, 4, 2, facing);
      if (moving) {
        // Run and walk atlases contain only locomotion cells. Attack, hit, cast, and death stay off this path.
        const frames = walking ? WALK_FRAMES : RUN_FRAMES;
        const frameMs = walking ? WALK_FRAME_MS : RUN_FRAME_MS;
        const col = animFrame(elapsed, frameMs, frames);
        if (ANIM_LOG && logFrames) console.log(walking ? `anim walk ${col}` : `anim ${col}`);
        return this.heroGlyph(walking ? pack.walk : pack.run, frames, col, facing, !walking);
      }
      if (unit.castT > 0) return this.heroGlyph(pack.idle, 1, 0, facing);
      if (unit.swing > 0) {
        const col = Math.min(3, Math.floor((1 - Math.max(0, unit.swing)) * 4));
        return this.heroGlyph(pack.attack, 4, col, facing);
      }
      return this.heroGlyph(pack.idle, 1, 0, facing);
    }
    const delta = this.screenDelta(unit.facing);
    const row = unit.whirlT > 0 ? this.rowOf(delta) : this.heldRow(unit.id, this.smoothAim(unit.id, delta));
    if (unit.kind === 'seal') return this.full(this.props.rock[0], false);
    if (unit.defId === 'base-ally' || unit.defId === 'base-enemy') return this.full(this.bannerSheet, false);
    if (unit.defId === 'tower') return this.towerGlyph(unit, time);
    if (unit.objective === 'herald') return this.mephistoGlyph(moving, elapsed, unit.alive, row);
    if (unit.objective === 'baron') return this.castGlyph(pr23Cast.diablo, moving, elapsed, row);
    if (unit.objective === 'dragon') return this.castGlyph(pr23Cast.duriel, moving, elapsed, row);
    if (unit.defId === 'blood-raven') return this.castGlyph(pr23Cast.andariel, moving, elapsed, row);
    const cast = this.minionCast(unit);
    if (cast) return this.castGlyph(cast, moving, elapsed, row);
    return null;
  }

  /** Art swap only. Team and def id pick the sheet; stats stay on the unit. */
  private minionCast(unit: Unit): CastSheet | null {
    if (unit.team === 'ally') {
      if (unit.defId === 'rogue' || unit.defId === 'rogue-archer') return pr23Cast.rogue;
      if (unit.defId === 'skeleton' || unit.defId === 'hungry-dead') return pr23Cast.valkyrie;
      if (unit.defId === 'goatman' || unit.defId === 'demon' || unit.defId === 'mummy') return pr23Cast.guard;
      return null;
    }
    if (unit.defId === 'fallen' || unit.defId === 'zombie' || unit.defId === 'quillrat') return pr23Cast.fallen;
    if (unit.defId === 'goatman') return pr23Cast.goatman;
    if (unit.defId === 'skeleton' || unit.defId === 'hungry-dead') return pr23Cast.sandraider;
    if (unit.defId === 'willowisp') return pr23Cast.blunderbore;
    if (unit.defId === 'mummy') return pr23Cast.destruction;
    if (unit.defId === 'demon') return pr23Cast.bovine;
    return null;
  }

  private towerGlyph(unit: Unit, time: number): Glyph | null {
    const guardian = /guardian|warden/i.test(unit.name) || unit.radius >= 42;
    const cast = unit.team === 'ally'
      ? guardian ? pr23Cast.heroBase : pr23Cast.heroPath
      : guardian ? pr23Cast.enemyBase : pr23Cast.enemyPath;
    if (!guardian) {
      const pick = unit.team === 'ally' ? PATH_OBELISK.ally : PATH_OBELISK.enemy;
      const pose = pick.pose === 'idle' ? cast.idle : cast.walk;
      return this.obeliskGlyph(pose, pick.col);
    }
    const pose = unit.alive ? cast.walk : cast.idle;
    const col = pose.cols > 1 ? Math.floor(time * 6) % pose.cols : 0;
    return this.frameGlyph(pose, col, 0);
  }

  /** One static obelisk cell, black and red/magenta keyed out, foot on the bottom center. */
  private obeliskGlyph(pose: FrameSheet, col: number): Glyph | null {
    const img = this.sheet(pose.src);
    const glyph = this.atlas(img, pose.cols, col, 0, false, pose.rows);
    if (!glyph) return null;
    return this.keyObelisk(img, glyph);
  }

  private mephistoGlyph(moving: boolean, elapsed: number, alive: boolean, row: number): Glyph | null {
    if (!alive) return this.frameGlyph(mephisto.death, Math.max(0, mephisto.death.cols - 1), row);
    const pose = moving ? mephisto.walk : mephisto.idle;
    const col = moving ? animFrame(elapsed, WALK_FRAME_MS, pose.cols) : 0;
    return this.frameGlyph(pose, col, row);
  }

  private castGlyph(cast: CastSheet, moving: boolean, elapsed: number, row: number): Glyph | null {
    const pose = moving ? cast.walk : cast.idle;
    const col = moving ? animFrame(elapsed, WALK_FRAME_MS, pose.cols) : 0;
    return this.frameGlyph(pose, col, row);
  }

  /** New sheets are packed on the cell's bottom center. The hero trims each frame. */
  private frameGlyph(pose: FrameSheet, col: number, row: number): Glyph | null {
    return this.atlas(this.sheet(pose.src), pose.cols, col, row, false, pose.rows);
  }

  /** Hero facing row. The 15° deadband does not touch the frame clock. */
  private holdHero(id: number, facing: number): number {
    const next = heroHoldCompass(this.heroCompass.get(id) ?? null, facing);
    this.heroCompass.set(id, next);
    return next;
  }

  /**
   * Trim to the opaque box, keeping that box's offset inside the original cell.
   * sw/sh stay the native pixel size. heroDrawBox applies one scale for every state.
   * Run marks the cell so the row baseline, not this frame's trimmed bottom, is the ground.
   */
  private heroGlyph(img: HTMLImageElement, cols: number, col: number, row: number, fixedBaseline = false): Glyph | null {
    const glyph = this.atlas(img, cols, col, row, false);
    if (!glyph) return null;
    const box = this.opaqueBox(img, glyph.sx, glyph.sy, glyph.sw, glyph.sh);
    if (box) {
      glyph.sx += box.x;
      glyph.sy += box.y;
      glyph.sw = box.w;
      glyph.sh = box.h;
    }
    glyph.foot = { x: glyph.sw / 2, y: glyph.sh };
    glyph.hero = true;
    if (fixedBaseline) {
      glyph.runRow = row % 8;
      glyph.runCol = col % cols;
    }
    return glyph;
  }

  /** Exact opaque bounds of one cell. Alpha at or below 24 stays transparent. */
  private opaqueBox(
    img: HTMLImageElement,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
  ): { x: number; y: number; w: number; h: number } | null {
    if (!img.complete || img.naturalWidth === 0) return null;
    let table = this.trims.get(img);
    if (!table) {
      table = new Map();
      this.trims.set(img, table);
    }
    const key = `${sx}:${sy}:${sw}:${sh}`;
    const cached = table.get(key);
    if (cached !== undefined) return cached;
    const w = Math.max(1, Math.round(sw));
    const h = Math.max(1, Math.round(sh));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    crisp(ctx);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    let minX = w;
    let minY = h;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (data[(y * w + x) * 4 + 3] <= 24) continue;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
    const box = maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
    table.set(key, box);
    return box;
  }

  /** Ease the facing angle, then keep the current sheet row until the stick leaves its sector. */
  private smoothAim(id: number, target: number): number {
    const prev = this.aim.get(id);
    const dt = this.frameDt;
    if (prev == null || dt <= 0) {
      this.aim.set(id, target);
      return target;
    }
    let turn = target - prev;
    if (turn > Math.PI) turn -= Math.PI * 2;
    else if (turn < -Math.PI) turn += Math.PI * 2;
    const next = wrapAngle(prev + turn * (1 - Math.exp(-dt * 36)));
    this.aim.set(id, next);
    return next;
  }

  private heldRow(id: number, delta: number): number {
    const prev = this.facingRow.get(id);
    const quant = this.rowOf(delta);
    if (prev == null) {
      this.facingRow.set(id, quant);
      return quant;
    }
    const center = (prev + 0.25) * (Math.PI / 4);
    let gap = delta - center;
    if (gap > Math.PI) gap -= Math.PI * 2;
    else if (gap < -Math.PI) gap += Math.PI * 2;
    if (Math.abs(gap) <= Math.PI / 8 + Math.PI / 18) return prev;
    let step = (quant - prev + 8) % 8;
    if (step > 4) step -= 8;
    const next = step === 0 ? prev : (prev + Math.sign(step) + 8) % 8;
    this.facingRow.set(id, next);
    return next;
  }

  private armorTier(sim: Sim): ArmorTier {
    const id = sim.loadout.armor;
    if (id === 'stu' || id === 'rng') return 'heavy';
    if (id === 'lea') return 'medium';
    return 'light';
  }

  /** Sheet row 0 faces the camera. Later rows turn clockwise, two source rows per step. */
  private screenDelta(facing: number): number {
    const sx = Math.cos(facing) - Math.sin(facing);
    const sy = Math.cos(facing) + Math.sin(facing);
    return wrapAngle(Math.atan2(sy, sx) - Math.PI / 2);
  }

  private rowOf(delta: number): number {
    const index = Math.round(wrapAngle(delta) / (Math.PI / 8)) % 16;
    return Math.floor(index / 2) % 8;
  }

  private full(img: Sheet, flip: boolean): Glyph | null {
    const iw = img instanceof HTMLImageElement ? img.naturalWidth : img.width;
    const ih = img instanceof HTMLImageElement ? img.naturalHeight : img.height;
    if (!iw || !ih) return null;
    return { img, flip, sx: 0, sy: 0, sw: iw, sh: ih };
  }

  private atlas(img: HTMLImageElement, cols: number, col: number, row: number, anchor = false, rows = 8): Glyph | null {
    if (!img.complete || !img.naturalWidth || !img.naturalHeight) return null;
    const sw = img.naturalWidth / cols;
    const sh = img.naturalHeight / Math.max(1, rows);
    const facing = rows === 16 ? (row % 8) * 2 : rows === 8 ? row % 8 : 0;
    const glyph: Glyph = { img, flip: false, sx: (col % cols) * sw, sy: facing * sh, sw, sh };
    if (anchor) {
      const foot = this.footOf(img, glyph.sx, glyph.sy, sw, sh);
      if (foot) glyph.foot = foot;
    }
    return glyph;
  }

  /** Median of the lowest opaque row, so the foot — not the cell box — sits on the ground. */
  private footOf(img: HTMLImageElement, sx: number, sy: number, sw: number, sh: number): { x: number; y: number } | null {
    if (!img.complete || img.naturalWidth === 0) return null;
    let table = this.feet.get(img);
    if (!table) {
      table = new Map();
      this.feet.set(img, table);
    }
    const key = `${sx}:${sy}:${sw}:${sh}`;
    const cached = table.get(key);
    if (cached) return cached;
    const w = Math.max(1, Math.round(sw));
    const h = Math.max(1, Math.round(sh));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    crisp(ctx);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    const rows: number[][] = Array.from({ length: h }, () => []);
    let bottom = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (data[(y * w + x) * 4 + 3] > 24) {
          rows[y].push(x);
          bottom = y;
        }
      }
    }
    let foot = { x: w / 2, y: h - 1 };
    if (bottom >= 0) {
      let y = bottom;
      const limit = Math.max(0, bottom - 40);
      while (y > limit && rows[y].length < 4) y -= 1;
      const cols = rows[y].length ? rows[y] : rows[bottom];
      foot = { x: cols[cols.length >> 1], y };
    }
    table.set(key, foot);
    return foot;
  }


  private gaitOf(unit: Unit): { moving: boolean; d: number; elapsed: number; walking: boolean } {
    const prev = this.gait.get(unit.id);
    const step = prev ? Math.hypot(unit.x - prev.x, unit.y - prev.y) : 0;
    const stepped = heroGaitStep(prev?.elapsed ?? 0, step, this.frameDt);
    const d = (prev?.d ?? 0) + (stepped.moving ? step : 0);
    this.gait.set(unit.id, { x: unit.x, y: unit.y, d, elapsed: stepped.elapsed });
    return { moving: stepped.moving, d, elapsed: stepped.elapsed, walking: stepped.moving && !stepped.running };
  }

  /** One extra pixel on every side so integer diamonds meet with no seam. */
  private paintDiamond(
    ctx: CanvasRenderingContext2D,
    rows: Record<GroundKind, number>,
    kind: GroundKind,
    col: number,
    sx: number,
    sy: number,
  ): void {
    ctx.drawImage(this.floorSheet(), col * 160, rows[kind] * 80, 160, 80, sx - 81, sy - 41, 162, 82);
  }

  /** Column of the grass-to-dirt row whose grass faces away from the lane. */
  private blendCol(map: ActDef, x: number, y: number): number {
    const roads = map.paths?.length ? map.paths.map((path) => path.lane) : [map.lane];
    let best = { x, y };
    let bestD = Infinity;
    for (const lane of roads) {
      const near = nearestOnPolyline({ x, y }, lane);
      if (near.dist < bestD) {
        bestD = near.dist;
        best = near.point;
      }
    }
    const dx = x - best.x;
    const dy = y - best.y;
    return blendIndex(dx - dy, (dx + dy) * 0.5);
  }

  /**
   * Key the obelisk cell. Red and magenta go everywhere. Black goes only where it
   * touches the cell edge, so the rectangle behind the nova disappears and interior shade stays.
   * The trimmed sprite is seated on its bottom center.
   */
  private keyObelisk(img: HTMLImageElement, glyph: Glyph): Glyph | null {
    let table = this.obelisks.get(img);
    if (!table) {
      table = new Map();
      this.obelisks.set(img, table);
    }
    const key = `${glyph.sx}:${glyph.sy}:${glyph.sw}:${glyph.sh}`;
    const cached = table.get(key);
    if (cached) return cached;
    if (!img.complete || img.naturalWidth === 0) return glyph;
    const w = Math.max(1, Math.round(glyph.sw));
    const h = Math.max(1, Math.round(glyph.sh));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return glyph;
    crisp(ctx);
    ctx.drawImage(img, glyph.sx, glyph.sy, glyph.sw, glyph.sh, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h);
    const px = data.data;
    const kill = new Uint8Array(w * h);
    const black = new Uint8Array(w * h);
    for (let p = 0; p < w * h; p++) {
      const i = p * 4;
      const r = px[i];
      const g = px[i + 1];
      const b = px[i + 2];
      const a = px[i + 3];
      if (r < 28 && g < 28 && b < 28 && a > 16) black[p] = 1;
      if (isObeliskBackground(r, g, b, a) && black[p] === 0) kill[p] = 1;
    }
    const stack: number[] = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (x !== 0 && x !== w - 1 && y !== 0 && y !== h - 1) continue;
        const p = y * w + x;
        if (black[p] === 1) stack.push(p);
      }
    }
    for (let n = 0; n < stack.length; n++) {
      const p = stack[n];
      if (kill[p] === 1 || black[p] === 0) continue;
      kill[p] = 1;
      const x = p % w;
      const y = (p - x) / w;
      if (x > 0) stack.push(p - 1);
      if (x + 1 < w) stack.push(p + 1);
      if (y > 0) stack.push(p - w);
      if (y + 1 < h) stack.push(p + w);
    }
    let minX = w;
    let minY = h;
    let maxX = -1;
    let maxY = -1;
    for (let p = 0; p < w * h; p++) {
      const i = p * 4;
      if (kill[p] === 1) {
        px[i] = 0;
        px[i + 1] = 0;
        px[i + 2] = 0;
        px[i + 3] = 0;
        continue;
      }
      if (px[i + 3] <= 16) continue;
      const x = p % w;
      const y = (p - x) / w;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    ctx.putImageData(data, 0, 0);
    if (maxX < 0) return glyph;
    const trimmed = document.createElement('canvas');
    const tw = maxX - minX + 1;
    const th = maxY - minY + 1;
    trimmed.width = tw;
    trimmed.height = th;
    const out = trimmed.getContext('2d');
    if (!out) return glyph;
    crisp(out);
    out.drawImage(canvas, minX, minY, tw, th, 0, 0, tw, th);
    const seated: Glyph = { img: trimmed, flip: false, sx: 0, sy: 0, sw: tw, sh: th, foot: { x: tw / 2, y: th } };
    table.set(key, seated);
    return seated;
  }

  /** Drop the magenta RGB stored in the floor sheet's transparent pixels. */
  private floorSheet(): HTMLCanvasElement | HTMLImageElement {
    if (this.floor) return this.floor;
    const img = this.ground;
    if (!img.complete || img.naturalWidth < 640) return img;
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return img;
    crisp(ctx);
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const px = data.data;
    // Some cells store the diamond shifted, with the overflow wrapped around the cell.
    const src = new Uint8ClampedArray(px);
    const cellW = 160;
    const cellH = 80;
    for (let row = 0; row < FLOOR_SEAT.length; row++) {
      for (let col = 0; col < 4; col++) {
        const shift = FLOOR_SEAT[row][col];
        if (!shift) continue;
        for (let y = 0; y < cellH; y++) {
          const from = ((row * cellH + (y + shift) % cellH) * canvas.width + col * cellW) * 4;
          px.set(src.subarray(from, from + cellW * 4), ((row * cellH + y) * canvas.width + col * cellW) * 4);
        }
      }
    }
    stripMatte(data);
    ctx.putImageData(data, 0, 0);
    this.floor = canvas;
    return canvas;
  }

  private prepare(img: Sheet): Sheet {
    if (!(img instanceof HTMLImageElement)) return img;
    if (this.pr23Sources.has(img)) return this.cutout(img, true);
    if (!this.cutSources.has(img)) return img;
    return this.cutout(img, false);
  }

  /** Clear edge-connected matte on trees, walls, and ruins. Interior shadow stays. */
  private cutout(img: HTMLImageElement, broad = false): Sheet {
    const cached = this.cutouts.get(img);
    if (cached) return cached;
    if (!img.complete || img.naturalWidth === 0) return img;
    const canvas = document.createElement('canvas');
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return img;
    crisp(ctx);
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, w, h);
    stripMatte(data, broad);
    ctx.putImageData(data, 0, 0);
    this.cutouts.set(img, canvas);
    return canvas;
  }

  private blit(
    ctx: CanvasRenderingContext2D,
    img: Sheet,
    x: number,
    y: number,
    height: number,
    flip: boolean,
    src?: Glyph,
    outline = false,
    destW?: number,
  ): void {
    const sheet = this.prepare(img);
    const iw = src ? src.sw : sheet instanceof HTMLImageElement ? sheet.naturalWidth : sheet.width;
    const ih = src ? src.sh : sheet instanceof HTMLImageElement ? sheet.naturalHeight : sheet.height;
    if (!iw || !ih) return;
    const dh = Math.max(1, Math.round(height));
    const dw = Math.max(1, Math.round(destW ?? (iw / ih) * dh));
    ctx.save();
    crisp(ctx);
    ctx.translate(Math.round(x), Math.round(y));
    if (flip) ctx.scale(-1, 1);
    const footX = src?.foot ? (src.foot.x / src.sw) * dw : dw / 2;
    const footY = src?.foot ? (src.foot.y / src.sh) * dh : dh;
    const dx = -Math.round(footX);
    const dy = -Math.round(footY);
    const paint = (ox: number, oy: number) => {
      if (src) ctx.drawImage(sheet, src.sx, src.sy, src.sw, src.sh, dx + ox, dy + oy, dw, dh);
      else ctx.drawImage(sheet, dx + ox, dy + oy, dw, dh);
    };
    if (outline) {
      ctx.save();
      ctx.filter = 'brightness(0)';
      ctx.globalAlpha *= 0.92;
      paint(-1, 0);
      paint(1, 0);
      paint(0, -1);
      paint(0, 1);
      ctx.restore();
    }
    paint(0, 0);
    ctx.restore();
  }

  private drawBar(unit: Unit, x: number, footY: number, height: number, targetId: number | null): void {
    const ctx = this.ctx;
    const w = unit.kind === 'base' ? 74 : unit.kind === 'champion' ? 54 : 34;
    const y = footY - height - (unit.kind === 'minion' ? 6 : 16);
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, 6);
    ctx.fillStyle = unit.team === 'ally' ? '#9a2a22' : '#9a2a22';
    ctx.fillRect(x - w / 2, y, w, 4);
    ctx.fillStyle = unit.team === 'ally' ? '#c6d28a' : unit.team === 'wild' ? '#c49a3a' : '#e4553c';
    ctx.fillRect(x - w / 2, y, w * Math.max(0, Math.min(1, unit.hp / unit.maxHp)), 4);
    if (unit.id === targetId && unit.kind !== 'base') {
      ctx.fillStyle = '#f0e2bc';
      ctx.font = '12px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText(unit.name, x, y - 4);
    }
  }


  private drawFx(ctx: CanvasRenderingContext2D, fx: Sim['fx'][number]): void {
    const alpha = Math.max(0, 1 - fx.t / fx.life);
    const p = this.project(fx.x, fx.y);
    ctx.save();
    ctx.globalAlpha = alpha;
    if (fx.kind === 'text' && fx.text) {
      ctx.fillStyle = fx.color;
      ctx.font = 'bold 16px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText(fx.text, p.x, p.y);
    } else if (fx.kind === 'ring') {
      const edge = this.project(fx.x + fx.r * (0.35 + fx.t / fx.life), fx.y);
      ctx.strokeStyle = fx.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, Math.abs(edge.x - p.x), Math.abs(edge.x - p.x) * 0.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (fx.kind === 'slash') {
      ctx.strokeStyle = fx.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 18, 8, fx.facing ?? 0, 0, Math.PI * 1.2);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawMinimap(sim: Sim, targetId: number | null): void {
    const mini = document.querySelector<HTMLCanvasElement>('#minimap');
    if (!mini) return;
    const rect = mini.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (mini.width !== w || mini.height !== h) {
      mini.width = w;
      mini.height = h;
    }
    const ctx = mini.getContext('2d');
    if (!ctx) return;
    crisp(ctx);
    const map = sim.map;
    const sx = w / map.width;
    const sy = h / map.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#120e0b';
    ctx.fillRect(0, 0, w, h);
    const strokeLane = (points: Vec[], color: string, width: number) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      points.forEach((point, index) => {
        const x = point.x * sx;
        const y = point.y * sy;
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    };
    if (map.river && map.river.length > 1) strokeLane(map.river, '#8a2424', 4);
    const paths = map.paths?.length ? map.paths : null;
    if (paths) {
      for (const path of paths) strokeLane(roadPoints(map, path.lane), path.road, 3);
    } else {
      strokeLane(map.lane, '#6a5340', 3);
    }
    for (const unit of sim.units) {
      if (!unit.alive && unit.kind === 'minion') continue;
      const x = unit.x * sx;
      const y = unit.y * sy;
      ctx.fillStyle = unit.team === 'ally' ? '#e6d3a1' : unit.team === 'wild' ? '#c49a3a' : '#e15a4a';
      const r = unit.kind === 'minion' ? 2 : unit.kind === 'champion' ? 4 : 3;
      ctx.globalAlpha = unit.alive ? 1 : 0.4;
      ctx.fillRect(x - r / 2, y - r / 2, r, r);
      ctx.globalAlpha = 1;
      if (unit.id === targetId) {
        ctx.strokeStyle = '#fff';
        ctx.strokeRect(x - 3, y - 3, 6, 6);
      }
    }
    ctx.strokeStyle = 'rgba(240, 226, 188, 0.55)';
    ctx.lineWidth = 1;
    ctx.strokeRect(this.camera.x * sx, this.camera.y * sy, this.camera.viewW * sx, this.camera.viewH * sy);
  }
}

/** Roll, in pixels, that seats each floor cell on the 160×80 diamond. */
const FLOOR_SEAT: readonly (readonly number[])[] = [
  [12, 12, 12, 12],
  [12, 0, 12, 0],
  [12, 0, 0, 18],
  [0, 0, 0, 0],
  [0, 0, 0, 0],
  [6, 6, 6, 0],
  [0, 0, 0, 0],
];

/** Blend column whose grass side points away from the nearest lane. */
function blendIndex(sx: number, sy: number): number {
  let best = 0;
  let score = -Infinity;
  for (let i = 0; i < BLEND_GRASS.length; i++) {
    const dot = BLEND_GRASS[i].x * sx + BLEND_GRASS[i].y * sy;
    if (dot > score) {
      score = dot;
      best = i;
    }
  }
  return best;
}

function floorCol(kind: GroundKind, i: number, j: number): number {
  if (kind === 'path' || kind === 'town' || kind === 'pale') return 0;
  const cols =
    kind === 'bank' || kind === 'edge' ? [0, 2] :
    kind === 'river' || kind === 'dark' ? [0, 1] :
    [0, 1, 2, 3];
  return cols[Math.abs((i * 3 + j * 5) % cols.length)];
}

function roadPoints(map: ActDef, lane: Vec[]): Vec[] {
  return [map.playerBase, ...lane, map.enemyBase];
}

function wrapAngle(angle: number): number {
  const turn = angle % (Math.PI * 2);
  return turn < 0 ? turn + Math.PI * 2 : turn;
}

