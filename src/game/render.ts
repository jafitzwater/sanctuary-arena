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
import { damageColor } from './combat';
import { attackSheetFrame, cycleFrame } from './art/flare-frames';
import { drawFlare, flareFrameCount, flareReady, type FlareAnim } from './art/flare';
import { classSheetReady, drawClassSheet, drawMobSheet, mobSheetReady } from './art/director-sheets';
import {
  CLASS_SHEET,
  MOB_ROWS,
  classSheetCol,
  classSheetRow,
  hasClassSheet,
  mobFacesLeft,
  mobSheetId,
  type MobAnim,
} from './art/sheet-frames';
import { stampBloodPool } from './decals';
import { heroGaitStep, heroHoldCompass, readStickMotion } from './gait';
import type { ActDef } from './data/acts/types';
import { projectIso, unprojectIso } from './iso';
import { TEAM_GLOW, baseFloorReady, onBaseFloor, paintBaseFloor, paintTeamGlow } from './art/base-ground';
import { drawItemBeam, drawItemNameplate, ITEM_LABEL_CLASS, type GroundDrop } from './itemBeam';
import { FLOOR_STEP, GATE_HALF, LANE_CLEAR_HALF, mirroredBases, propForm, sceneryFor, type Prop } from './landscape';
import { AMBIENT_ALPHA, DarkGothicLighting, type LightSource } from './lighting';
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
const ATMOS_LOG =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('atmoslog') === '1';

export interface AtmosphereProbe {
  lightAlloc: number;
  ambientAlpha: number;
  blood: number;
  drops: number;
  hero: { x: number; y: number; h: number } | null;
}

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
  /** Item 7: the CC0 stone floor is loaded and paints both base yards. */
  private floorArt = false;
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
  private fires: { x: number; y: number; hell: boolean; blue?: boolean }[] = [];
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
  private mapCtx: CanvasRenderingContext2D | null = null;
  private readonly lighting = new DarkGothicLighting();
  private readonly lights: LightSource[] = [];
  private readonly hudPaint: (() => void)[] = [];
  private mistCanvas: HTMLCanvasElement | null = null;
  private mistPattern: CanvasPattern | null = null;
  private mistOffset = 0;
  private flashCanvas: HTMLCanvasElement | null = null;
  private readonly aliveWas = new Set<number>();
  private bloodReady = false;
  private bloodStamps = 0;
  private heroScreen: { x: number; y: number; h: number } | null = null;
  private heroLevel = 1;
  private simTime = 0;
  private miniStatic: HTMLCanvasElement | null = null;
  private miniStaticKey = '';
  private miniW = 0;
  private miniH = 0;
  private miniView = '';
  /** Empty until a future drop system fills it. Rendering only. */
  private readonly groundDrops: GroundDrop[] = [];

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
    const view = `${cssW}x${cssH}`;
    if (this.miniView !== view) {
      this.miniView = view;
      this.miniW = 0;
      this.miniH = 0;
      this.miniStatic = null;
    }
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
    this.observeBlood(sim);
    if (this.mapCanvas) {
      const srcX = Math.round(this.camBakeX);
      const srcY = Math.round(this.camBakeY);
      const srcW = Math.max(1, Math.round(cssW / this.scale));
      const srcH = Math.max(1, Math.round(cssH / this.scale));
      ctx.drawImage(this.mapCanvas, srcX, srcY, srcW, srcH, 0, 0, cssW, cssH);
    }
    this.drawMist(sim, cssW, cssH);
    this.drawOrbs(sim);
    this.drawGrass(sim);

    this.tickFx();
    this.syncRecall(sim);
    this.look = { recall: false, recallSec: 0, recallFill: 0, slash: false, spark: false, flinch: false };
    this.lights.length = 0;
    this.hudPaint.length = 0;
    this.heroScreen = null;
    this.heroLevel = sim.level;
    this.simTime = sim.time;
    const u = this.spriteScale();
    const layers: { depth: number; paint: () => void }[] = [];
    const myTeam = sim.units.find((unit) => unit.id === sim.playerId)?.team;
    // Item 17: enemies hidden in grass are not drawn.
    const units = sim.units.filter(
      (unit) => (unit.alive || unit.corpse > 0 || unit.kind !== 'minion') && !(unit.alive && unit.hidden && unit.team !== myTeam),
    );
    for (const unit of units) {
      layers.push({
        depth: unit.x + unit.y,
        paint: () => {
          // Item 17: own side's hidden units are drawn faded so the player can tell they are in grass.
          if (unit.hidden) ctx.globalAlpha = 0.6;
          this.drawUnit(ctx, unit, opts, u, this.armorTier(sim), sim.playerId);
          ctx.globalAlpha = 1;
        },
      });
    }
    layers.sort((a, b) => a.depth - b.depth);
    for (const layer of layers) layer.paint();

    for (const shot of sim.projectiles) {
      const p = this.project(shot.x, shot.y);
      const owner = sim.units.find((unit) => unit.id === shot.attackerId);
      drawBolt(ctx, p.x, p.y, shot.color, owner?.defId === 'blood-raven');
      this.lights.push({ screenX: p.x, screenY: p.y, radius: 40, intensity: 0.85, color: shot.color });
    }
    for (const fx of sim.fx) {
      if (fx.kind === 'text') continue;
      this.drawFx(ctx, fx);
      if (fx.kind === 'ring') {
        const p = this.project(fx.x, fx.y);
        this.lights.push({
          screenX: p.x,
          screenY: p.y,
          radius: Math.max(28, Math.min(72, fx.r * this.camera.zoom)),
          intensity: 0.7,
          color: fx.color,
        });
      }
    }
    for (const fire of this.fires) {
      const p = this.project(fire.x, fire.y);
      if (p.x < -40 || p.y < -40 || p.x > cssW + 40 || p.y > cssH + 40) continue;
      drawFire(ctx, p.x, p.y, opts.time, fire.hell, fire.blue);
      this.lights.push({
        screenX: p.x,
        screenY: p.y - 10,
        radius: fire.hell ? 90 : 100,
        intensity: fire.hell ? 0.75 : 0.9,
        color: fire.blue ? TEAM_GLOW.ally : fire.hell ? TEAM_GLOW.enemy : 'rgb(255, 148, 48)',
        flicker: !this.reduceMotion,
      });
    }
    for (const flash of this.portals) {
      const p = this.project(flash.x, flash.y);
      drawPortal(ctx, p.x, p.y, 1 - flash.t / 0.45);
      this.lights.push({ screenX: p.x, screenY: p.y, radius: 80, intensity: 0.8, color: 'rgb(90, 160, 255)' });
    }
    for (const drop of this.groundDrops) {
      const p = this.project(drop.x, drop.y);
      drawItemBeam(ctx, p.x, p.y, drop.tier, opts.time);
      if (drop.tier === 'rare' || drop.tier === 'unique' || drop.tier === 'set') {
        this.lights.push({ screenX: p.x, screenY: p.y, radius: 54, intensity: 0.65, color: 'rgb(255, 214, 96)' });
      }
    }

    const shade = this.shadeOverlay(cssW, cssH);
    ctx.drawImage(shade, 0, 0, cssW, cssH);
    this.lighting.draw(ctx, cssW, cssH, this.lights, opts.time);
    crisp(ctx);
    for (const paint of this.hudPaint) paint();
    for (const fx of sim.fx) {
      if (fx.kind === 'text') this.drawFx(ctx, fx, sim);
    }
    for (const drop of this.groundDrops) {
      const p = this.project(drop.x, drop.y);
      drawItemNameplate(ctx, p.x, p.y - 16, drop.name, drop.tier);
    }
    this.syncItemTags();
    this.publishLook();
    this.publishAtmos();
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
    const mirrored = mirroredBases(map);
    const floor = mirrored && baseFloorReady();
    const key = `${map.id}${floor ? ':floor' : ''}`;
    if (this.mapCanvas && this.mapKey === key) return;
    if (mirrored && !floor) onBaseFloor(() => { this.mapKey = ''; });
    this.floorArt = floor;
    const hw = BAKE_HW;
    const width = Math.ceil((map.width + map.height) * hw + PAD * 2);
    const height = Math.ceil((map.width + map.height) * hw * 0.5 + PAD * 2);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    this.mapCtx = ctx;
    const ox = map.height * hw + PAD;
    const oy = PAD;
    crisp(ctx);
    ctx.fillStyle = tilePaint(GROUND_BASE).fill;
    ctx.fillRect(0, 0, width, height);
    this.scenery = sceneryFor(map);
    this.stampGround(ctx, map, ox, oy, hw);
    if (mirrored) {
      // Item 7: red and blue primary glow over each yard (doc: "Red is one side's primary glow. Blue is the other.").
      const r = map.fountainRadius * hw * Math.SQRT2 * 1.15;
      for (const [base, color] of [[map.playerBase, TEAM_GLOW.ally], [map.enemyBase, TEAM_GLOW.enemy]] as const) {
        const c = projectIso(base.x, base.y, hw, ox, oy);
        paintTeamGlow(ctx, c.x, c.y, r, r * 0.5, color);
      }
    }
    this.bakeProps(ctx, map, ox, oy, hw);
    this.fires = mirrored
      ? [
          // Item 7: the same brazier on each side, mirrored, burning in the side's color.
          { x: map.playerBase.x + 90, y: map.playerBase.y + 36, hell: false, blue: true },
          { x: map.enemyBase.x - 90, y: map.enemyBase.y - 36, hell: true },
        ]
      : [
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
      const hell = !mirroredBases(map) && Math.hypot(prop.x - map.enemyBase.x, prop.y - map.enemyBase.y)
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
    if (kind === 'town' && this.floorArt) {
      ctx.save();
      diamond(ctx, sx, sy);
      ctx.lineWidth = 2;
      ctx.clip();
      const drew = paintBaseFloor(ctx, sx, sy, Math.floor(hash(i, j) * 16));
      ctx.restore();
      if (drew) return;
    }
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
    const lean = hero ? heroLean(pose.state) : 0;
    const paintBody = (target: CanvasRenderingContext2D) => {
      if (this.paintSprite(target, unit, pose, attack, dx, dy, height, opts)) return;
      this.paintFigure(target, unit, opts, tier, dx, dy, height, swing, screen, bob, attack, lean, hero, boss);
    };
    if (unit.alive && unit.hitFlash >= 0.07) this.blitHitFlash(ctx, dx, dy, paintBody);
    else paintBody(ctx);
    if (unit.id === playerId) this.heroScreen = { x: dx, y: dy, h: height };
    const slash = this.slashT.get(unit.id) ?? 0;
    if (slash > 0) {
      this.look.slash = true;
      drawSlash(ctx, footX, footY, height, this.slashFace.get(unit.id) ?? screen, slash / 0.16);
    }
    if (unit.hitFlash > 0.02 && unit.alive) {
      drawSpark(ctx, dx, dy, height, Math.min(1, unit.hitFlash / 0.12));
      this.lights.push({
        screenX: dx,
        screenY: dy - height * 0.45,
        radius: 36,
        intensity: 0.8,
        color: 'rgb(255, 220, 180)',
      });
    }
    this.collectUnitLight(unit, playerId, footX, footY);
    if (unit.buffT > 0 && unit.alive) {
      ctx.strokeStyle = 'rgba(230, 211, 161, 0.75)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(footX, footY, height * 0.34, height * 0.14, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    this.hudPaint.push(() => {
      if (unit.defId === 'tower' && unit.alive && unit.id === opts.targetId) {
        this.rangeRing(ctx, unit, unit.team === 'ally' ? '#6aa7ff' : '#e4553c');
      }
      if (unit.recall > 0 && unit.alive) {
        const max = this.recallTrack.get(unit.id)?.max ?? unit.recall;
        drawRecall(ctx, footX, footY, height, unit.recall, max, opts.time);
        if (unit.id === playerId || !this.look.recall) {
          this.look.recall = true;
          this.look.recallSec = Math.max(0, Math.ceil(unit.recall - 1e-4));
          this.look.recallFill = Math.max(0, Math.min(1, 1 - unit.recall / max));
        }
      }
      if (unit.alive && opts.autoTargetId != null && unit.id === opts.autoTargetId) {
        ctx.save();
        ctx.strokeStyle = 'rgba(230, 211, 161, 0.9)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(footX, footY + 2, Math.max(14, height * 0.22), Math.max(6, height * 0.08), 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      if (unit.alive && (boss || unit.kind !== 'minion' || unit.hp < unit.maxHp)) {
        this.drawBar(unit, footX, footY, height, opts.targetId, playerId);
      }
      if (unit.stun > 0 && unit.alive) {
        ctx.fillStyle = '#c7b377';
        ctx.font = '700 14px "Cinzel Decorative", serif';
        ctx.textAlign = 'center';
        ctx.fillText('✶', footX, footY - height - 8);
      }
    });
  }

  private paintSprite(
    ctx: CanvasRenderingContext2D,
    unit: Unit,
    pose: Pose,
    attack: AttackPose,
    dx: number,
    dy: number,
    height: number,
    opts: DrawOpts,
  ): boolean {
    const anim: FlareAnim = !unit.alive
      ? 'die'
      : attack !== 'none'
        ? 'attack'
        : pose.state === 'run'
          ? 'run'
          : pose.state === 'walk'
            ? 'walk'
            : 'idle';
    const sheet = this.sheetFrame(unit, anim, pose);
    const cols = sheet ? 0 : flareFrameCount(unit.defId, anim);
    if (!sheet && (cols <= 0 || !flareReady(unit.defId, anim))) return false;
    let frame = sheet ? 0 : cycleFrame(pose.phase, cols);
    if (!sheet && anim === 'attack') {
      const phase = unit.attackCycle.phase === AttackPhase.Windup ? 'Windup' : 'Backswing';
      frame = attackSheetFrame(phase, unit.attackCycle.phaseElapsedMs, unit.attackInterval, cols);
    } else if (!sheet && anim === 'die') {
      const elapsed = Math.max(0, this.simTime - unit.diedAt);
      frame = Math.min(cols - 1, Math.floor(Math.min(0.999, elapsed / 0.8) * cols));
    }
    ctx.save();
    if (!unit.alive) {
      const fade = unit.corpse > 0 ? Math.max(0.05, (unit.corpse / 4.5) * 0.55) : 0.55;
      ctx.globalAlpha = fade;
    } else if (unit.invuln > 0 && Math.sin(opts.time * 28) > 0) ctx.globalAlpha = 0.45;
    groundShadow(ctx, dx, dy, height);
    groundRing(ctx, dx, dy, height, unit.team === 'ally');
    const drew = sheet
      ? sheet.kind === 'class'
        ? drawClassSheet(ctx, sheet.id, sheet.row, sheet.col, dx, dy, height)
        : drawMobSheet(ctx, sheet.id, sheet.row, sheet.col, sheet.left, dx, dy, height)
      : drawFlare(ctx, unit.defId, anim, pose.compass, frame, dx, dy, height);
    if (unit.whirlT > 0) {
      ctx.strokeStyle = 'rgba(240, 220, 170, 0.8)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(dx, dy - height * 0.45, height * 0.42, height * 0.16, opts.time * 6, 0, Math.PI * 1.5);
      ctx.stroke();
    }
    ctx.restore();
    return drew;
  }

  /**
   * Batch 3 item a: pick a Sprite Director sheet cell, or null to keep the Flare/procedural art.
   * Class sheets have idle and move only (manifest: no attack, cast or death frames). The Barbarian keeps
   * its Flare attack and death; other class looks hold the stand pose for those [TEMP, NEEDS JOSEPH].
   */
  private sheetFrame(
    unit: Unit,
    anim: FlareAnim,
    pose: Pose,
  ): { kind: 'class' | 'mob'; id: string; row: number; col: number; left: boolean } | null {
    if (unit.defId === 'barbarian') {
      const id = unit.look ?? 'barbarian';
      if (!hasClassSheet(id) || !classSheetReady(id)) return null;
      const moving = anim === 'walk' || anim === 'run';
      if (!moving && anim !== 'idle' && id === 'barbarian') return null;
      const col = classSheetCol(moving, cycleFrame(pose.phase, CLASS_SHEET.moveFrames));
      return { kind: 'class', id, row: classSheetRow(pose.compass), col, left: false };
    }
    const id = mobSheetId(unit.defId);
    if (!id || !mobSheetReady(id)) return null;
    const mob: MobAnim = anim === 'die' ? 'death' : anim === 'attack' ? 'attack' : anim === 'idle' ? 'idle' : 'move';
    const { row, frames } = MOB_ROWS[mob];
    let col = cycleFrame(pose.phase, frames);
    if (mob === 'attack') {
      const phase = unit.attackCycle.phase === AttackPhase.Windup ? 'Windup' : 'Backswing';
      col = attackSheetFrame(phase, unit.attackCycle.phaseElapsedMs, unit.attackInterval, frames);
    } else if (mob === 'death') {
      const elapsed = Math.max(0, this.simTime - unit.diedAt);
      col = Math.min(frames - 1, Math.floor(Math.min(0.999, elapsed / 0.8) * frames));
    }
    return { kind: 'mob', id, row, col, left: mobFacesLeft(pose.compass) };
  }

  private paintFigure(
    ctx: CanvasRenderingContext2D,
    unit: Unit,
    opts: DrawOpts,
    tier: ArmorTier,
    dx: number,
    dy: number,
    height: number,
    swing: number,
    screen: number,
    bob: number,
    attack: AttackPose,
    lean: number,
    hero: boolean,
    boss: BossLook | null,
  ): void {
    const body = unit.kind === 'minion' || unit.kind === 'champion';
    ctx.save();
    if (!unit.alive) {
      const fade = unit.corpse > 0 ? Math.max(0.05, (unit.corpse / 4.5) * 0.55) : 0.55;
      ctx.globalAlpha = fade;
    } else if (unit.invuln > 0 && Math.sin(opts.time * 28) > 0) ctx.globalAlpha = 0.45;
    if (!unit.alive && body) {
      ctx.translate(dx, dy);
      ctx.scale(1, 0.45);
      ctx.translate(-dx, -dy);
    }
    if (hero) {
      drawBarbarian(ctx, dx, dy, height, swing, lean, screen, tier, bob, attack, unit.team === 'ally');
    } else if (unit.defId === 'tower') {
      drawSpire(ctx, dx, dy, height, unit.team === 'ally', unit.alive);
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

  private blitHitFlash(
    ctx: CanvasRenderingContext2D,
    dx: number,
    dy: number,
    paint: (target: CanvasRenderingContext2D) => void,
  ): void {
    const width = 420;
    const height = 560;
    const ox = 210;
    const oy = 340;
    if (!this.flashCanvas) {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      this.flashCanvas = canvas;
    }
    const g = this.flashCanvas.getContext('2d');
    if (!g) {
      paint(ctx);
      return;
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, width, height);
    g.save();
    g.translate(ox - dx, oy - dy);
    paint(g);
    g.restore();
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = 'rgba(255, 228, 214, 0.88)';
    g.fillRect(0, 0, width, height);
    g.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.flashCanvas, dx - ox, dy - oy);
  }

  /** Hero is the main pool. Allies, fires, and the recall portal add the rest. */
  private collectUnitLight(unit: Unit, playerId: number, x: number, y: number): void {
    if (!unit.alive) return;
    if (unit.id === playerId) {
      this.lights.push({ screenX: x, screenY: y - 36, radius: 220, intensity: 1 });
      if (unit.recall > 0) {
        this.lights.push({ screenX: x, screenY: y, radius: 80, intensity: 0.85, color: 'rgb(90, 160, 255)' });
      }
      return;
    }
    if (unit.team !== 'ally') return;
    if (unit.kind === 'champion') {
      this.lights.push({ screenX: x, screenY: y - 24, radius: 120, intensity: 0.7 });
    } else if (unit.defId === 'tower' || unit.defId === 'base-ally') {
      this.lights.push({ screenX: x, screenY: y - 40, radius: 160, intensity: 0.85 });
    }
    if (unit.recall > 0) {
      this.lights.push({ screenX: x, screenY: y, radius: 70, intensity: 0.75, color: 'rgb(90, 160, 255)' });
    }
  }

  private observeBlood(sim: Sim): void {
    const ctx = this.mapCtx;
    if (!ctx) return;
    if (!this.bloodReady) {
      for (const unit of sim.units) {
        if (unit.alive) this.aliveWas.add(unit.id);
      }
      this.bloodReady = true;
      return;
    }
    for (const unit of sim.units) {
      const wasAlive = this.aliveWas.has(unit.id);
      const bleeds = unit.kind === 'minion' || unit.kind === 'champion';
      if (wasAlive && !unit.alive && bleeds) {
        this.stampAt(ctx, unit, unit.kind === 'champion' ? 26 : 18);
        this.bloodStamps += 1;
      }
      if (unit.alive) this.aliveWas.add(unit.id);
      else this.aliveWas.delete(unit.id);
    }
  }

  private stampAt(ctx: CanvasRenderingContext2D, unit: Unit, radius: number): void {
    const p = projectIso(unit.x, unit.y, BAKE_HW, this.ox, this.oy);
    stampBloodPool(ctx, p.x, p.y, radius, bleedsIchor(unit));
  }

  /** Item 16: ready health orbs (red) and pools (red-blue); consumed ones are hidden until refill. */
  private drawOrbs(sim: Sim): void {
    const ctx = this.ctx;
    for (const orb of sim.orbs ?? []) {
      if (orb.refill > 0) continue;
      const p = this.project(orb.x, orb.y);
      const edge = this.project(orb.x + (orb.kind === 'pool' ? 70 : 16), orb.y);
      const r = Math.max(3, Math.hypot(edge.x - p.x, edge.y - p.y));
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, r, r * 0.5, 0, 0, Math.PI * 2);
      ctx.fillStyle = orb.kind === 'pool' ? 'rgba(90, 60, 150, 0.45)' : 'rgba(200, 30, 30, 0.85)';
      ctx.fill();
      ctx.strokeStyle = orb.kind === 'pool' ? 'rgba(200, 60, 60, 0.8)' : 'rgba(255, 170, 150, 0.9)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      this.lights.push({ screenX: p.x, screenY: p.y, radius: orb.kind === 'pool' ? 60 : 30, intensity: 0.6, color: '#c03030' });
    }
  }

  /** Item 17: hiding grass patches, drawn as dark tufted ground. */
  private drawGrass(sim: Sim): void {
    const ctx = this.ctx;
    for (const patch of sim.grass ?? []) {
      const p = this.project(patch.x, patch.y);
      const edge = this.project(patch.x + patch.r, patch.y);
      const r = Math.max(4, Math.hypot(edge.x - p.x, edge.y - p.y));
      if (p.x < -r || p.y < -r || p.x > this.camera.cssW + r || p.y > this.camera.cssH + r) continue;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, r, r * 0.5, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(28, 52, 18, 0.75)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(70, 104, 38, 0.8)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 18; i++) {
        const a = (i * 2.399) % (Math.PI * 2);
        const d = ((i * 37) % 17) / 17;
        const tx = p.x + Math.cos(a) * r * 0.85 * d;
        const ty = p.y + Math.sin(a) * r * 0.42 * d;
        ctx.beginPath();
        ctx.moveTo(tx - 2, ty);
        ctx.lineTo(tx, ty - 6);
        ctx.lineTo(tx + 2, ty);
        ctx.stroke();
      }
    }
  }

  private drawMist(sim: Sim, cssW: number, cssH: number): void {
    const pattern = this.ensureMistPattern();
    if (!pattern) return;
    const drift = (this.mistOffset + Math.min(0.05, this.frameDt) * 13.5) % 256;
    this.mistOffset = drift;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = this.mistAlpha(sim);
    ctx.translate(drift, (drift * 0.35) % 256);
    ctx.fillStyle = pattern;
    ctx.fillRect(-256, -256, cssW + 512, cssH + 512);
    ctx.restore();
  }

  private mistAlpha(sim: Sim): number {
    const kind = groundAt(sim.map, this.focusX, this.focusY);
    const camp =
      Math.hypot(this.focusX - sim.map.playerBase.x, this.focusY - sim.map.playerBase.y) < 260 ||
      Math.hypot(this.focusX - sim.map.enemyBase.x, this.focusY - sim.map.enemyBase.y) < 260;
    if (kind === 'town' || camp) return 0.07;
    if (kind === 'grass' || kind === 'edge' || kind === 'bank' || kind === 'dark' || kind === 'river') return 0.15;
    return 0.12;
  }

  private ensureMistPattern(): CanvasPattern | null {
    if (this.mistPattern) return this.mistPattern;
    const tile = this.ensureMist();
    if (!tile) return null;
    this.mistPattern = this.ctx.createPattern(tile, 'repeat');
    return this.mistPattern;
  }

  private ensureMist(): HTMLCanvasElement | null {
    if (this.mistCanvas) return this.mistCanvas;
    {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const g = canvas.getContext('2d');
      if (!g) return null;
      for (let i = 0; i < 16; i++) {
        const x = (i * 67) % 256;
        const y = (i * 43) % 256;
        const radius = 26 + (i % 5) * 12;
        for (const ox of [-256, 0, 256]) {
          for (const oy of [-256, 0, 256]) {
            const cx = x + ox;
            const cy = y + oy;
            const blob = g.createRadialGradient(cx, cy, 0, cx, cy, radius);
            blob.addColorStop(0, 'rgba(214, 220, 206, 0.62)');
            blob.addColorStop(1, 'rgba(214, 220, 206, 0)');
            g.fillStyle = blob;
            g.beginPath();
            g.arc(cx, cy, radius, 0, Math.PI * 2);
            g.fill();
          }
        }
      }
      this.mistCanvas = canvas;
    }
    return this.mistCanvas;
  }

  private syncItemTags(): void {
    const host = document.getElementById('item-tags');
    if (!host) return;
    if (this.groundDrops.length === 0) {
      if (host.childElementCount) host.replaceChildren();
      return;
    }
    host.replaceChildren();
    for (const drop of this.groundDrops) {
      const p = this.project(drop.x, drop.y);
      const tag = document.createElement('div');
      tag.className = ITEM_LABEL_CLASS;
      tag.textContent = drop.name;
      tag.style.color = drop.tier === 'magic' ? 'rgb(112, 112, 255)' : drop.tier === 'rare' ? 'rgb(255, 236, 96)' : drop.tier === 'unique' ? 'rgb(207, 176, 96)' : drop.tier === 'set' ? 'rgb(88, 196, 96)' : 'rgb(244, 244, 244)';
      tag.style.left = `${p.x}px`;
      tag.style.top = `${p.y - 18}px`;
      host.appendChild(tag);
    }
  }

  private publishAtmos(): void {
    if (!ATMOS_LOG) return;
    const g = globalThis as { __atmos?: AtmosphereProbe };
    g.__atmos = this.debugAtmosphere();
  }

  debugAtmosphere(): AtmosphereProbe {
    return {
      lightAlloc: this.lighting.allocations,
      ambientAlpha: AMBIENT_ALPHA,
      blood: this.bloodStamps,
      drops: this.groundDrops.length,
      hero: this.heroScreen ? { ...this.heroScreen } : null,
    };
  }

  sampleMap(worldX: number, worldY: number): [number, number, number, number] | null {
    if (!this.mapCanvas || !this.mapCtx) return null;
    const p = projectIso(worldX, worldY, BAKE_HW, this.ox, this.oy);
    const x = Math.round(p.x);
    const y = Math.round(p.y);
    if (x < 0 || y < 0 || x >= this.mapCanvas.width || y >= this.mapCanvas.height) return null;
    const px = this.mapCtx.getImageData(x, y, 1, 1).data;
    return [px[0], px[1], px[2], px[3]];
  }

  sampleView(cssX: number, cssY: number): [number, number, number, number] | null {
    const x = Math.round(cssX * this.camera.dpr);
    const y = Math.round(cssY * this.camera.dpr);
    if (x < 0 || y < 0 || x >= this.canvas.width || y >= this.canvas.height) return null;
    const px = this.ctx.getImageData(x, y, 1, 1).data;
    return [px[0], px[1], px[2], px[3]];
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
      case 'valkyrie':
      case 'act2-mercenary':
      case 'act3-mercenary':
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

  private drawBar(unit: Unit, x: number, footY: number, height: number, targetId: number | null, playerId: number): void {
    const ctx = this.ctx;
    const w = unit.kind === 'base' ? 74 : unit.kind === 'champion' ? 54 : 34;
    const barH = 5;
    const y = footY - height - (unit.kind === 'minion' ? 10 : 18);
    const pct = Math.max(0, Math.min(1, unit.hp / Math.max(1, unit.maxHp)));
    const mine = unit.id === playerId;
    if (mine || unit.kind === 'champion') {
      const badge = 13;
      const bx = x - w / 2 - badge - 1;
      const by = y + barH / 2;
      const border = unit.team === 'enemy' ? '#e4553c' : '#c7b377';
      ctx.beginPath();
      ctx.arc(bx, by, badge / 2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(8, 6, 4, 0.88)';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = border;
      ctx.stroke();
      const level = mine ? this.heroLevel : unit.level || 1;
      ctx.save();
      ctx.fillStyle = '#c7b377';
      ctx.font = '700 8px "Cinzel Decorative", serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(level), bx, by + 0.5);
      ctx.restore();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.78)';
    ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, barH + 2);
    ctx.fillStyle = unit.team === 'ally' ? '#2a2218' : '#2a1210';
    ctx.fillRect(x - w / 2, y, w, barH);
    ctx.fillStyle = unit.team === 'ally' ? '#c6d28a' : unit.team === 'wild' ? '#c49a3a' : '#e4553c';
    ctx.fillRect(x - w / 2, y, w * pct, barH);
    const step = pipStep(unit.maxHp, w);
    ctx.fillStyle = 'rgba(0,0,0,0.9)';
    for (let mark = step; mark < unit.maxHp - 0.5; mark += step) {
      const tx = Math.round(x - w / 2 + (mark / unit.maxHp) * w);
      ctx.fillRect(tx, y, 1, barH);
    }
    if (mine && unit.maxMana > 0) {
      const my = y + barH + 2;
      const mana = Math.max(0, Math.min(1, unit.mana / unit.maxMana));
      ctx.fillStyle = 'rgba(0,0,0,0.78)';
      ctx.fillRect(x - w / 2 - 1, my - 1, w + 2, 4);
      ctx.fillStyle = '#071422';
      ctx.fillRect(x - w / 2, my, w, 2);
      ctx.fillStyle = '#3ec0ff';
      ctx.fillRect(x - w / 2, my, w * mana, 2);
    }
    if (unit.id === targetId && unit.kind !== 'base') {
      ctx.fillStyle = '#f0e2bc';
      ctx.font = '12px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(unit.name, x, y - 4);
    }
  }

  private drawFx(ctx: CanvasRenderingContext2D, fx: Sim['fx'][number], sim?: Sim): void {
    const alpha = Math.max(0, 1 - fx.t / fx.life);
    const p = this.project(fx.x, fx.y);
    ctx.save();
    ctx.globalAlpha = alpha;
    if (fx.kind === 'text' && fx.text) {
      const numeric = /^-?\d+$/.test(fx.text);
      const damage = fx.color === '#f4efe4' && numeric;
      const gothic = fx.text.startsWith('Level') || numeric;
      ctx.font = gothic ? '700 16px "Cinzel Decorative", serif' : 'bold 16px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = '#000';
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 1;
      ctx.fillStyle = damage && sim ? damageInk(fx, sim) : gothic ? '#c7b377' : fx.color;
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
    const toggle = mini.closest('#minimap-toggle');
    if (toggle?.classList.contains('off')) return;
    let w = this.miniW;
    let h = this.miniH;
    if (w < 2 || h < 2) {
      const rect = mini.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = Math.max(1, Math.round(rect.width * dpr));
      h = Math.max(1, Math.round(rect.height * dpr));
      if (w < 2 || h < 2) return;
      this.miniW = w;
      this.miniH = h;
    }
    if (mini.width !== w || mini.height !== h) {
      mini.width = w;
      mini.height = h;
      this.miniStatic = null;
    }
    const ctx = mini.getContext('2d');
    if (!ctx) return;
    crisp(ctx);
    const map = sim.map;
    const plate = this.ensureMiniStatic(map, w, h);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (plate) ctx.drawImage(plate, 0, 0);
    else {
      ctx.fillStyle = '#120e0b';
      ctx.fillRect(0, 0, w, h);
    }
    const sx = w / map.width;
    const sy = h / map.height;
    const myTeam = sim.units.find((unit) => unit.id === sim.playerId)?.team;
    for (const unit of sim.units) {
      if (!unit.alive && unit.kind === 'minion') continue;
      if (unit.alive && unit.hidden && unit.team !== myTeam) continue; // Item 17
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
    ctx.strokeStyle = 'rgba(240, 226, 188, 0.85)';
    ctx.lineWidth = 1;
    ctx.strokeRect(this.camera.x * sx, this.camera.y * sy, this.camera.viewW * sx, this.camera.viewH * sy);
  }

  /** Lanes, camps, and Worldstones. Rebuilt only when the map card changes size. */
  private ensureMiniStatic(map: Sim['map'], w: number, h: number): HTMLCanvasElement | null {
    const key = `${map.id}:${w}x${h}`;
    if (this.miniStatic && this.miniStaticKey === key) return this.miniStatic;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const sx = w / map.width;
    const sy = h / map.height;
    ctx.fillStyle = '#120e0b';
    ctx.fillRect(0, 0, w, h);
    const strokeLane = (points: Vec[], color: string, width: number) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      points.forEach((point, index) => {
        const x = point.x * sx;
        const y = point.y * sy;
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    };
    if (map.river && map.river.length > 1) strokeLane(map.river, '#c44a3a', 4);
    const paths = map.paths?.length ? map.paths : null;
    const roads = paths ? paths.map((path) => roadPoints(map, path.lane)) : [map.lane];
    for (const road of roads) strokeLane(road, '#3a2c22', 5);
    for (const road of roads) strokeLane(road, '#e6d3a1', 2);
    const diamond = (x: number, y: number, r: number, fill: string, stroke: string) => {
      ctx.beginPath();
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r, y);
      ctx.lineTo(x, y + r);
      ctx.lineTo(x - r, y);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      ctx.stroke();
    };
    for (const den of map.dens ?? []) diamond(den.x * sx, den.y * sy, 3.5, '#c49a3a', '#1a120c');
    diamond(map.playerBase.x * sx, map.playerBase.y * sy, 5, '#e6d3a1', '#1a120c');
    diamond(map.enemyBase.x * sx, map.enemyBase.y * sy, 5, '#e4553c', '#1a120c');
    this.miniStatic = canvas;
    this.miniStaticKey = key;
    return canvas;
  }
}

function groundShadow(ctx: CanvasRenderingContext2D, x: number, y: number, height: number): void {
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.ellipse(x, y, height * 0.26, height * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();
}

function groundRing(ctx: CanvasRenderingContext2D, x: number, y: number, height: number, ally: boolean): void {
  ctx.save();
  ctx.globalAlpha = 0.4;
  ctx.strokeStyle = ally ? '#6aa7ff' : '#e4553c';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(x, y, height * 0.2, height * 0.075, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function roadPoints(map: ActDef, lane: Vec[]): Vec[] {
  return [map.playerBase, ...lane, map.enemyBase];
}

/** 100 HP per tick, or 250 when 100 would pack the marks closer than 4px. */
function pipStep(maxHp: number, width: number): number {
  const gap = width / Math.max(1, maxHp / 100);
  return gap >= 4 ? 100 : 250;
}

/** Tagged hits use their school. Untagged numbers keep the old proximity colors. */
function damageInk(fx: Sim['fx'][number], sim: Sim): string {
  if (fx.school === 'physical' || fx.school === 'magic') return damageColor(fx.school, fx.taken === true);
  let best = 72;
  let onPlayer = false;
  for (const unit of sim.units) {
    const d = Math.hypot(unit.x - fx.x, unit.y - fx.y);
    if (d < best) {
      best = d;
      onPlayer = unit.id === sim.playerId;
    }
  }
  return onPlayer ? '#e23b3b' : '#e07a32';
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

function bleedsIchor(unit: Unit): boolean {
  if (bossLook(unit)?.mark === 'mephisto') return true;
  if (unit.defId === 'demon') return true;
  return unit.defId === 'skeleton' && unit.team !== 'ally';
}

function tokenLook(unit: Unit): TokenLook {
  const ally = unit.team === 'ally';
  if (unit.defId === 'rogue' || unit.defId === 'rogue-archer') return { mark: 'rogue', scale: 1 };
  // Item 6 wave mobs use the existing procedural marks until the sprite sheets are wired in.
  if (unit.defId === 'valkyrie') return { mark: 'valkyrie', scale: 1.08 };
  if (unit.defId === 'act2-mercenary' || unit.defId === 'act3-mercenary') return { mark: 'guard', scale: 1.05 };
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
