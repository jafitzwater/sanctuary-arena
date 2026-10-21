import {
  drawBolt,
  drawFire,
  drawPortal,
  drawPropArt,
  drawRecall,
  drawSlash,
  drawSpark,
  paintBarbarian,
  paintBoss,
  paintCreature,
  paintDecorMark,
  paintSpire,
  paintStronghold,
  paintTileVariation,
  type AttackPose,
  type BossMark,
  type CreatureKind,
} from './art/d2look';
import {
  advanceHeroPhase,
  heroCycleHz,
  heroDrawHeight,
  heroLean,
  smoothFacing,
  type HeroPose,
} from './art/figures';
import { AttackPhase } from './combat/attackCycle';
import { heroGaitStep, heroHoldCompass, readStickMotion } from './gait';
import type { ActDef } from './data/acts/types';
import { projectIso, unprojectIso } from './iso';
import { FLOOR_STEP, GATE_HALF, LANE_CLEAR_HALF, propForm, sceneryFor, type Prop } from './landscape';
import type { Vec } from './math';
import { player } from './query';
import { GROUND_BASE, groundAt, tilePaint, walkable, type GroundKind } from './terrain';
import type { Camera, Sim, Unit } from './types';

export interface DrawOpts {
  mode: 'title' | 'play' | 'end';
  targetId: number | null;
  autoTargetId: number | null;
  attack: boolean;
  time: number;
}

const BAKE_HW = 0.85;
const PAD = 64;
/** World units visible across the screen. Larger means a wider, smaller-sprite view. */
const WORLD_ACROSS = 1040;

type ArmorTier = 'light' | 'medium' | 'heavy';

interface Pose {
  phase: number;
  shown: number;
  compass: number;
  x: number;
  y: number;
  elapsed: number;
  state: HeroPose;
}

interface TokenLook {
  mark: CreatureKind;
  scale: number;
}

const STICK_LOG =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('sticklog') === '1';
const LOOK_LOG =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('looklog') === '1';

interface LookLive {
  recall: boolean;
  recallSec: number;
  recallFill: number;
  slash: boolean;
  spark: boolean;
  flinch: boolean;
}

function crisp(ctx: CanvasRenderingContext2D): void {
  ctx.imageSmoothingEnabled = false;
}

/** Backing store is CSS pixels times devicePixelRatio, capped at 2. CSS size stays put. */
export function applyCanvasBacking(canvas: HTMLCanvasElement): { cssW: number; cssH: number; dpr: number } {
  const rect = canvas.getBoundingClientRect();
  const cssW = Math.max(1, rect.width);
  const cssH = Math.max(1, rect.height);
  const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  canvas.style.imageRendering = 'pixelated';
  const width = Math.max(1, Math.round(cssW * dpr));
  const height = Math.max(1, Math.round(cssH * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  return { cssW, cssH, dpr };
}

export function watchCanvasBacking(canvas: HTMLCanvasElement): void {
  const apply = () => applyCanvasBacking(canvas);
  apply();
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', apply);
  const view = window.visualViewport;
  if (!view) return;
  view.addEventListener('resize', apply);
  view.addEventListener('scroll', apply);
}

function diamond(ctx: CanvasRenderingContext2D, sx: number, sy: number): void {
  ctx.beginPath();
  ctx.moveTo(sx, sy - 41);
  ctx.lineTo(sx + 81, sy);
  ctx.lineTo(sx, sy + 41);
  ctx.lineTo(sx - 81, sy);
  ctx.closePath();
}

function hash(i: number, j: number): number {
  const n = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly camera: Camera = {
    x: 0,
    y: 0,
    viewW: WORLD_ACROSS,
    viewH: 640,
    zoom: 1,
    cssW: 1,
    cssH: 1,
    dpr: 1,
  };
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
  private frameDt = 0;
  private readonly poses = new Map<number, Pose>();
  /** Campfires and braziers. Visual only; they are not collision props. */
  private fires: { x: number; y: number; hell: boolean }[] = [];
  private readonly recallTrack = new Map<number, { max: number; x: number; y: number }>();
  private portals: { x: number; y: number; t: number }[] = [];
  private readonly slashT = new Map<number, number>();
  private readonly slashFace = new Map<number, number>();
  private readonly slashArmed = new Map<number, boolean>();
  private readonly sparkArmed = new Set<number>();
  private look: LookLive = { recall: false, recallSec: 0, recallFill: 0, slash: false, spark: false, flinch: false };
  private seen = { slash: 0, spark: 0, flinch: 0, portal: 0, heroSlash: 0 };
  private shadeCanvas: HTMLCanvasElement | null = null;
  private shadeKey = '';

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D is unavailable');
    this.ctx = ctx;
    if (STICK_LOG) {
      (globalThis as { __geometry?: unknown }).__geometry = {
        floorStep: FLOOR_STEP,
        corridorTiles: (LANE_CLEAR_HALF * 2) / FLOOR_STEP,
        gateTiles: (GATE_HALF * 2) / FLOOR_STEP,
      };
    }
  }

  resize(): void {
    const { cssW, cssH, dpr } = applyCanvasBacking(this.canvas);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    crisp(this.ctx);
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

    this.tickFx();
    this.syncRecall(sim);
    this.look = { recall: false, recallSec: 0, recallFill: 0, slash: false, spark: false, flinch: false };
    const u = this.spriteScale();
    const layers: { depth: number; paint: () => void }[] = [];
    const units = sim.units.filter((unit) => unit.alive || unit.corpse > 0 || unit.kind !== 'minion');
    for (const unit of units) {
      layers.push({
        depth: unit.x + unit.y,
        paint: () => this.drawUnit(ctx, unit, opts, u, this.armorTier(sim), sim.playerId),
      });
    }
    layers.sort((a, b) => a.depth - b.depth);
    for (const layer of layers) layer.paint();

    for (const shot of sim.projectiles) {
      const p = this.project(shot.x, shot.y);
      const owner = sim.units.find((unit) => unit.id === shot.attackerId);
      drawBolt(ctx, p.x, p.y, shot.color, owner?.defId === 'blood-raven');
    }
    for (const fx of sim.fx) this.drawFx(ctx, fx);
    for (const fire of this.fires) {
      const p = this.project(fire.x, fire.y);
      if (p.x < -40 || p.y < -40 || p.x > cssW + 40 || p.y > cssH + 40) continue;
      drawFire(ctx, p.x, p.y, opts.time, fire.hell);
    }
    for (const flash of this.portals) {
      const p = this.project(flash.x, flash.y);
      drawPortal(ctx, p.x, p.y, 1 - flash.t / 0.45);
    }

    const shade = this.shadeOverlay(cssW, cssH);
    ctx.drawImage(shade, 0, 0, cssW, cssH);
    this.publishLook();
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
      const travel = (time % 48) / 48;
      const idx = travel * (lane.length - 1);
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
    const key = map.id;
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
    ctx.fillStyle = tilePaint(GROUND_BASE).fill;
    ctx.fillRect(0, 0, width, height);
    this.scenery = sceneryFor(map);
    this.stampGround(ctx, map, ox, oy, hw);
    this.bakeProps(ctx, map, ox, oy, hw);
    this.fires = [
      { x: map.playerBase.x + 90, y: map.playerBase.y + 36, hell: false },
      { x: map.enemyBase.x - 80, y: map.enemyBase.y - 24, hell: true },
      { x: map.enemyBase.x + 40, y: map.enemyBase.y + 70, hell: true },
    ];
    this.mapCanvas = canvas;
    this.mapKey = key;
  }

  /** Props and camp clutter live in the map canvas, so a frame only redraws units. */
  private bakeProps(ctx: CanvasRenderingContext2D, map: ActDef, ox: number, oy: number, hw: number): void {
    const u = 0.72;
    for (const prop of this.scenery) {
      const p = projectIso(prop.x, prop.y, hw, ox, oy);
      const form = propForm(prop.kind);
      const h =
        (form === 'pillar' ? 78 :
        form === 'posts' ? 54 :
        form === 'tent' ? 48 :
        form === 'cart' ? 36 :
        form === 'figure' ? 44 :
        28) * u;
      const hell = Math.hypot(prop.x - map.enemyBase.x, prop.y - map.enemyBase.y)
        < Math.hypot(prop.x - map.playerBase.x, prop.y - map.playerBase.y);
      drawPropArt(ctx, p.x, p.y, h, form, prop.variant, hell);
      paintDecorMark(ctx, p.x, p.y, prop.variant);
    }
  }

  /** Every grid cell gets an opaque grass diamond, then the lane or camp. */
  private stampGround(ctx: CanvasRenderingContext2D, map: ActDef, ox: number, oy: number, hw: number): void {
    const step = 80 / hw;
    const i1 = Math.ceil(map.width / step) + 2;
    const j1 = Math.ceil(map.height / step) + 2;
    for (let j = -2; j <= j1; j++) {
      for (let i = -2; i <= i1; i++) {
        const wx = i * step;
        const wy = j * step;
        const kind = groundAt(map, wx, wy);
        const sx = Math.round((i - j) * 80 + ox);
        const sy = Math.round((i + j) * 40 + oy);
        const overlay = kind !== GROUND_BASE;
        const wild = kind === 'grass' || kind === 'edge' || kind === 'bank' || kind === 'dark' || kind === 'river';
        const decor = wild && !walkable(map, wx, wy);
        const mud = kind === 'grass' && this.nearPath(map, wx, wy, step);
        this.paintTile(ctx, GROUND_BASE, i, j, sx, sy, !overlay && decor, !overlay && mud);
        if (overlay) this.paintTile(ctx, kind, i, j, sx, sy, false, false);
      }
    }
  }

  private nearPath(map: ActDef, x: number, y: number, step: number): boolean {
    return (
      groundAt(map, x + step, y) === 'path' ||
      groundAt(map, x - step, y) === 'path' ||
      groundAt(map, x, y + step) === 'path' ||
      groundAt(map, x, y - step) === 'path'
    );
  }

  private paintTile(
    ctx: CanvasRenderingContext2D,
    kind: GroundKind,
    i: number,
    j: number,
    sx: number,
    sy: number,
    decor: boolean,
    mud: boolean,
  ): void {
    const paint = tilePaint(kind);
    diamond(ctx, sx, sy);
    ctx.fillStyle = paint.fill;
    ctx.fill();
    ctx.strokeStyle = paint.fill;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.save();
    diamond(ctx, sx, sy);
    ctx.clip();
    ctx.strokeStyle = paint.joint;
    ctx.globalAlpha = kind === 'path' || kind === 'town' || kind === 'pale' ? 0.55 : 0.35;
    ctx.lineWidth = 1;
    const rows = kind === 'grass' ? 3 : 2;
    for (let row = 0; row < rows; row++) {
      const y = sy - 24 + row * 16;
      ctx.beginPath();
      ctx.moveTo(sx - 70 + (row % 2) * 18, y);
      ctx.lineTo(sx + 70, y + 8);
      ctx.stroke();
    }
    ctx.fillStyle = paint.fleck;
    ctx.globalAlpha = 0.7;
    const n = 2 + Math.floor(hash(i, j) * 3);
    for (let k = 0; k < n; k++) {
      const fx = sx - 40 + hash(i + k, j) * 80;
      const fy = sy - 16 + hash(j + k, i) * 32;
      ctx.fillRect(fx, fy, kind === 'pale' ? 3 : 2, 2);
    }
    ctx.globalAlpha = 1;
    paintTileVariation(ctx, kind, i, j, sx, sy, decor, mud);
    ctx.restore();
  }

  private drawUnit(
    ctx: CanvasRenderingContext2D,
    unit: Unit,
    opts: DrawOpts,
    u: number,
    tier: ArmorTier,
    playerId: number,
  ): void {
    const pose = this.poseOf(unit, playerId);
    const p = this.project(unit.x, unit.y);
    if (p.x < -180 || p.y < -220 || p.x > this.camera.cssW + 180 || p.y > this.camera.cssH + 80) return;
    let footY = p.y;
    if (unit.leap) {
      const t = Math.min(1, unit.leap.t / unit.leap.dur);
      footY -= Math.sin(t * Math.PI) * 48 * u;
    }
    const footX = p.x;
    const ahead = this.project(unit.x + Math.cos(pose.shown) * 24, unit.y + Math.sin(pose.shown) * 24);
    const screen = Math.atan2(ahead.y - p.y, ahead.x - p.x);
    const swing = Math.sin(pose.phase * Math.PI * 2);
    const attack = attackPose(unit);
    const hero = unit.defId === 'barbarian';
    const boss = bossLook(unit);
    const height = (hero ? heroDrawHeight(pose.state) : this.unitHeight(unit)) * u;
    const bob = swing * (pose.state === 'idle' ? 1.5 : pose.state === 'run' ? 5 : 3.5) * u;
    const melee = !unit.ranged && unit.defId !== 'tower' && unit.kind !== 'base' && unit.kind !== 'seal';
    this.armSlash(unit, melee && (attack === 'swing' || unit.swing > 0.82), screen, playerId);
    this.noteHit(unit);
    const body = unit.kind === 'minion' || unit.kind === 'champion';
    const mag = body && unit.hitFlash > 0 ? 3 * Math.min(1, unit.hitFlash / 0.12) : 0;
    const flinchX = -Math.cos(screen) * mag;
    const flinchY = -Math.sin(screen) * mag;
    const dx = footX + flinchX;
    const dy = footY + flinchY;
    ctx.save();
    if (!unit.alive) ctx.globalAlpha = 0.55;
    else if ((unit.invuln > 0 || unit.hitFlash > 0) && Math.sin(opts.time * 28) > 0) ctx.globalAlpha = 0.45;
    if (!unit.alive && body) {
      ctx.translate(dx, dy);
      ctx.scale(1, 0.45);
      ctx.translate(-dx, -dy);
    }
    if (hero) {
      drawBarbarian(ctx, dx, dy, height, swing, heroLean(pose.state), screen, tier, bob, attack, unit.team === 'ally');
    } else if (unit.defId === 'tower') {
      drawSpire(ctx, dx, dy, height, unit.team === 'ally', unit.alive);
      if (unit.alive && unit.id === opts.targetId) this.rangeRing(ctx, unit, unit.team === 'ally' ? '#6aa7ff' : '#e4553c');
    } else if (unit.defId === 'base-ally' || unit.defId === 'base-enemy') {
      drawStronghold(ctx, dx, dy, height, unit.defId === 'base-ally', unit.alive);
    } else if (unit.kind === 'seal') {
      drawProp(ctx, dx, dy, height * 0.45, 'rock', 1);
    } else if (boss) {
      drawBoss(ctx, dx, dy - bob, height, boss, swing, unit.team === 'ally', attack, opts.time);
    } else {
      const look = tokenLook(unit);
      drawToken(ctx, dx, dy - bob, height * look.scale, look, swing, unit.team === 'ally', attack);
    }
    if (unit.whirlT > 0) {
      ctx.strokeStyle = 'rgba(240, 220, 170, 0.8)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(dx, dy - height * 0.45, height * 0.42, height * 0.16, opts.time * 6, 0, Math.PI * 1.5);
      ctx.stroke();
    }
    ctx.restore();
    const slash = this.slashT.get(unit.id) ?? 0;
    if (slash > 0) {
      this.look.slash = true;
      drawSlash(ctx, footX, footY, height, this.slashFace.get(unit.id) ?? screen, slash / 0.16);
    }
    if (unit.hitFlash > 0.02 && unit.alive) drawSpark(ctx, dx, dy, height, Math.min(1, unit.hitFlash / 0.12));
    if (unit.recall > 0 && unit.alive) {
      const max = this.recallTrack.get(unit.id)?.max ?? unit.recall;
      drawRecall(ctx, footX, footY, height, unit.recall, max, opts.time);
      if (unit.id === playerId || !this.look.recall) {
        this.look.recall = true;
        this.look.recallSec = Math.max(0, Math.ceil(unit.recall - 1e-4));
        this.look.recallFill = Math.max(0, Math.min(1, 1 - unit.recall / max));
      }
    }
    if (unit.buffT > 0 && unit.alive) {
      ctx.strokeStyle = 'rgba(230, 211, 161, 0.75)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(footX, footY, height * 0.34, height * 0.14, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (unit.alive && opts.autoTargetId != null && unit.id === opts.autoTargetId) {
      ctx.save();
      ctx.strokeStyle = 'rgba(230, 211, 161, 0.72)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(footX, footY + 2, Math.max(14, height * 0.22), Math.max(6, height * 0.08), 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    if (unit.alive && (boss || unit.kind !== 'minion' || unit.hp < unit.maxHp)) {
      this.drawBar(unit, footX, footY, height, opts.targetId);
    }
    if (unit.stun > 0 && unit.alive) {
      ctx.fillStyle = '#f0e2bc';
      ctx.font = '14px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText('✶', footX, footY - height - 8);
    }
  }

  private tickFx(): void {
    const dt = Math.min(0.05, this.frameDt);
    for (const [id, t] of this.slashT) {
      const next = t - dt;
      if (next <= 0) this.slashT.delete(id);
      else this.slashT.set(id, next);
    }
    for (const flash of this.portals) flash.t += dt;
    if (this.portals.length) this.portals = this.portals.filter((flash) => flash.t < 0.45);
  }

  private syncRecall(sim: Sim): void {
    const present = new Set<number>();
    for (const unit of sim.units) {
      present.add(unit.id);
      const prev = this.recallTrack.get(unit.id);
      if (unit.recall > 0) {
        if (!prev) this.recallTrack.set(unit.id, { max: Math.max(unit.recall, 0.01), x: unit.x, y: unit.y });
      } else if (prev) {
        if (Math.hypot(unit.x - prev.x, unit.y - prev.y) > 40) {
          this.portals.push({ x: prev.x, y: prev.y, t: 0 }, { x: unit.x, y: unit.y, t: 0 });
          this.seen.portal += 1;
        }
        this.recallTrack.delete(unit.id);
      }
    }
    for (const id of this.recallTrack.keys()) {
      if (!present.has(id)) this.recallTrack.delete(id);
    }
  }

  private armSlash(unit: Unit, punching: boolean, screen: number, playerId: number): void {
    const armed = this.slashArmed.get(unit.id) ?? false;
    if (punching && !armed) {
      this.slashArmed.set(unit.id, true);
      this.slashT.set(unit.id, 0.16);
      this.slashFace.set(unit.id, screen);
      this.seen.slash += 1;
      if (unit.id === playerId) this.seen.heroSlash += 1;
    } else if (!punching && (this.slashT.get(unit.id) ?? 0) <= 0) {
      this.slashArmed.set(unit.id, false);
    }
  }

  private noteHit(unit: Unit): void {
    if (unit.hitFlash > 0.02) {
      this.look.spark = true;
      if (unit.kind === 'minion' || unit.kind === 'champion') this.look.flinch = true;
      if (!this.sparkArmed.has(unit.id)) {
        this.sparkArmed.add(unit.id);
        this.seen.spark += 1;
        if (unit.kind === 'minion' || unit.kind === 'champion') this.seen.flinch += 1;
      }
    } else this.sparkArmed.delete(unit.id);
  }

  /** One cached fullscreen tint. Rebuilt only when the CSS size changes. */
  private shadeOverlay(cssW: number, cssH: number): HTMLCanvasElement {
    const key = `${Math.round(cssW)}x${Math.round(cssH)}`;
    if (this.shadeCanvas && this.shadeKey === key) return this.shadeCanvas;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(cssW));
    canvas.height = Math.max(1, Math.round(cssH));
    const g = canvas.getContext('2d');
    if (!g) return canvas;
    const tint = g.createLinearGradient(0, 0, 0, cssH);
    tint.addColorStop(0, 'rgba(16, 24, 38, 0.18)');
    tint.addColorStop(0.55, 'rgba(0,0,0,0)');
    tint.addColorStop(1, 'rgba(48, 24, 10, 0.16)');
    g.fillStyle = tint;
    g.fillRect(0, 0, cssW, cssH);
    const vignette = g.createRadialGradient(cssW / 2, cssH / 2, cssH * 0.2, cssW / 2, cssH / 2, cssH * 0.78);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.62)');
    g.fillStyle = vignette;
    g.fillRect(0, 0, cssW, cssH);
    this.shadeCanvas = canvas;
    this.shadeKey = key;
    return canvas;
  }

  private publishLook(): void {
    if (!LOOK_LOG) return;
    const g = globalThis as { __look?: unknown };
    g.__look = {
      recall: this.look.recall,
      recallSec: this.look.recallSec,
      recallFill: this.look.recallFill,
      slash: this.look.slash,
      spark: this.look.spark,
      flinch: this.look.flinch,
      portal: this.portals.length > 0,
      seen: { ...this.seen },
    };
  }

  /** One dt drives the sine. Facing eases toward the compass and never resets the phase. */
  private poseOf(unit: Unit, playerId: number): Pose {
    const prev = this.poses.get(unit.id);
    const step = prev ? Math.hypot(unit.x - prev.x, unit.y - prev.y) : 0;
    const motion = unit.id === playerId ? readStickMotion() : null;
    const directed = motion?.directing === true;
    let state: HeroPose;
    let elapsed: number;
    if (directed && motion) {
      state = motion.gait === 'run' ? 'run' : motion.gait === 'walk' ? 'walk' : 'idle';
      const moving = state !== 'idle';
      elapsed = (prev?.elapsed ?? 0) + (moving && this.frameDt > 0 ? this.frameDt * 1000 : 0);
    } else {
      const stepped = heroGaitStep(prev?.elapsed ?? 0, step, this.frameDt);
      elapsed = stepped.elapsed;
      state = !stepped.moving ? 'idle' : stepped.running ? 'run' : 'walk';
    }
    const phase = advanceHeroPhase(prev?.phase ?? 0, state, this.frameDt);
    const compass = heroHoldCompass(prev?.compass ?? null, unit.facing);
    const target = compass * (Math.PI / 4);
    const shown = prev ? smoothFacing(prev.shown, target, this.frameDt) : target;
    const pose: Pose = { phase, shown, compass, x: unit.x, y: unit.y, elapsed, state };
    this.poses.set(unit.id, pose);
    if (STICK_LOG && unit.id === playerId) {
      const speed = this.frameDt > 0 ? step / this.frameDt : 0;
      const trace = globalThis as { __locoLog?: { state: string; frame: number; speed: number; x: number; y: number; dt: number; heroHeight: number; hz: number }[] };
      if (!trace.__locoLog) trace.__locoLog = [];
      trace.__locoLog.push({
        state: state === 'idle' ? 'IDLE' : state === 'walk' ? 'WALK' : 'RUN',
        frame: state === 'idle' ? 0 : Math.floor(phase * (state === 'run' ? 12 : 8)) % (state === 'run' ? 12 : 8),
        speed,
        x: unit.x,
        y: unit.y,
        dt: this.frameDt,
        heroHeight: heroDrawHeight(state),
        hz: heroCycleHz(state),
      });
      if (trace.__locoLog.length > 400) trace.__locoLog.shift();
    }
    return pose;
  }

  private unitHeight(unit: Unit): number {
    if (bossLook(unit)) return bossLook(unit)?.height ?? 150;
    if (unit.defId === 'fallen' && unit.name === 'Bishibosh') return 92;
    switch (unit.defId) {
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

  private armorTier(sim: Sim): ArmorTier {
    const id = sim.loadout.armor;
    if (id === 'stu' || id === 'rng') return 'heavy';
    if (id === 'lea') return 'medium';
    return 'light';
  }

  private rangeRing(ctx: CanvasRenderingContext2D, unit: Unit, color: string): void {
    const p = this.project(unit.x, unit.y);
    const edge = this.project(unit.x + unit.attackRange, unit.y);
    const rx = Math.max(8, Math.abs(edge.x - p.x));
    ctx.save();
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, rx, rx * 0.5, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private drawBar(unit: Unit, x: number, footY: number, height: number, targetId: number | null): void {
    const ctx = this.ctx;
    const w = unit.kind === 'base' ? 74 : unit.kind === 'champion' ? 54 : 34;
    const y = footY - height - (unit.kind === 'minion' ? 6 : 16);
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, 6);
    ctx.fillStyle = '#9a2a22';
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

function roadPoints(map: ActDef, lane: Vec[]): Vec[] {
  return [map.playerBase, ...lane, map.enemyBase];
}


/** Weapon pose for the committed swing. Canceled attacks leave this at none. */
function attackPose(unit: Unit): AttackPose {
  if (unit.attackCycle.phase === AttackPhase.Windup) return 'raise';
  if (unit.attackCycle.phase !== AttackPhase.Backswing) return 'none';
  return unit.swing > 0.82 ? 'swing' : 'follow';
}

/** Layered barbarian. Feet sit on (x, y). Body height is the constant scale. */
function drawBarbarian(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  height: number,
  swing: number,
  lean: number,
  screen: number,
  tier: ArmorTier,
  bob: number,
  attack: AttackPose = 'none',
  ally = true,
): void {
  paintBarbarian(ctx, x, y, height, swing, lean, screen, tier, bob, attack, ally);
}

function drawToken(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  height: number,
  look: TokenLook,
  swing: number,
  ally: boolean,
  attack: AttackPose = 'none',
): void {
  paintCreature(ctx, look.mark, x, y, height, swing, ally, attack);
}

interface BossLook {
  mark: BossMark;
  height: number;
}

function bossLook(unit: Unit): BossLook | null {
  if (unit.objective === 'baron') return { mark: 'diablo', height: 188 };
  if (unit.objective === 'herald') return { mark: 'mephisto', height: 180 };
  if (unit.objective === 'dragon') return { mark: 'duriel', height: 176 };
  if (unit.defId === 'blood-raven') return { mark: 'raven', height: 172 };
  return null;
}

function drawBoss(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  height: number,
  look: BossLook,
  swing: number,
  ally: boolean,
  attack: AttackPose = 'none',
  time = 0,
): void {
  paintBoss(ctx, x, y, height, look.mark, swing, ally, attack, time);
}

function tokenLook(unit: Unit): TokenLook {
  const ally = unit.team === 'ally';
  if (unit.defId === 'rogue' || unit.defId === 'rogue-archer') return { mark: 'rogue', scale: 1 };
  if (ally && (unit.defId === 'skeleton' || unit.defId === 'hungry-dead')) return { mark: 'valkyrie', scale: 1.08 };
  if (ally && (unit.defId === 'goatman' || unit.defId === 'demon' || unit.defId === 'mummy')) return { mark: 'guard', scale: 1.05 };
  switch (unit.defId) {
    case 'fallen':
      return { mark: 'fallen', scale: 0.92 };
    case 'zombie':
      return { mark: 'raider', scale: 1 };
    case 'quillrat':
      return { mark: 'quill', scale: 0.9 };
    case 'goatman':
      return { mark: 'goatman', scale: 1.08 };
    case 'demon':
      return { mark: 'bovine', scale: 1.22 };
    case 'willowisp':
      return { mark: 'wisp', scale: 0.85 };
    case 'mummy':
      return { mark: 'mummy', scale: 1.05 };
    case 'skeleton':
      return { mark: 'destruction', scale: 1.28 };
    case 'hungry-dead':
      return { mark: 'blunder', scale: 1.2 };
    default:
      return { mark: 'raider', scale: 1 };
  }
}

/** Isometric spire. The foot is the bottom center of the masonry. */
function drawSpire(ctx: CanvasRenderingContext2D, x: number, y: number, height: number, ally: boolean, alive: boolean): void {
  paintSpire(ctx, x, y, height, ally, alive);
}

function drawStronghold(ctx: CanvasRenderingContext2D, x: number, y: number, height: number, ally: boolean, alive: boolean): void {
  paintStronghold(ctx, x, y, height, ally, alive);
}

function drawProp(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  height: number,
  form: ReturnType<typeof propForm>,
  variant: number,
  hell = false,
): void {
  drawPropArt(ctx, x, y, height, form, variant, hell);
}
