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
import { GROUND_BASE, groundAt, tilePaint, type GroundKind } from './terrain';
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
  body: string;
  trim: string;
  weapon: 'sword' | 'bow' | 'spear' | 'club' | 'staff' | 'horns' | 'quills' | 'orb' | 'wraps';
  scale: number;
}

const STICK_LOG =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('sticklog') === '1';

function crisp(ctx: CanvasRenderingContext2D): void {
  ctx.imageSmoothingEnabled = false;
}

/** Backing store is CSS pixels times devicePixelRatio, capped at 3. CSS size stays put. */
export function applyCanvasBacking(canvas: HTMLCanvasElement): { cssW: number; cssH: number; dpr: number } {
  const rect = canvas.getBoundingClientRect();
  const cssW = Math.max(1, rect.width);
  const cssH = Math.max(1, rect.height);
  const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
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

    const u = this.spriteScale();
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
    this.stampGround(ctx, map, ox, oy, hw);
    this.scenery = sceneryFor(map);
    this.mapCanvas = canvas;
    this.mapKey = key;
  }

  /** Every grid cell gets an opaque grass diamond, then the lane or camp. */
  private stampGround(ctx: CanvasRenderingContext2D, map: ActDef, ox: number, oy: number, hw: number): void {
    const step = 80 / hw;
    const i1 = Math.ceil(map.width / step) + 2;
    const j1 = Math.ceil(map.height / step) + 2;
    for (let j = -2; j <= j1; j++) {
      for (let i = -2; i <= i1; i++) {
        const kind = groundAt(map, i * step, j * step);
        const sx = Math.round((i - j) * 80 + ox);
        const sy = Math.round((i + j) * 40 + oy);
        this.paintTile(ctx, GROUND_BASE, i, j, sx, sy);
        if (kind !== GROUND_BASE) this.paintTile(ctx, kind, i, j, sx, sy);
      }
    }
  }

  private paintTile(ctx: CanvasRenderingContext2D, kind: GroundKind, i: number, j: number, sx: number, sy: number): void {
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
    ctx.restore();
  }

  private drawScenery(ctx: CanvasRenderingContext2D, prop: Prop, u: number): void {
    const p = this.project(prop.x, prop.y);
    if (p.x < -120 || p.y < -180 || p.x > this.camera.cssW + 120 || p.y > this.camera.cssH + 40) return;
    const form = propForm(prop.kind);
    const h =
      form === 'pillar' ? 78 :
      form === 'posts' ? 54 :
      form === 'tent' ? 48 :
      form === 'cart' ? 36 :
      form === 'figure' ? 44 :
      28;
    drawProp(ctx, p.x, p.y, h * u, form, prop.variant);
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
    const hero = unit.defId === 'barbarian';
    const height = (hero ? heroDrawHeight(pose.state) : this.unitHeight(unit)) * u;
    const bob = swing * (pose.state === 'idle' ? 1.5 : pose.state === 'run' ? 5 : 3.5) * u;
    ctx.save();
    if (!unit.alive) ctx.globalAlpha = 0.55;
    else if ((unit.invuln > 0 || unit.hitFlash > 0) && Math.sin(opts.time * 28) > 0) ctx.globalAlpha = 0.45;
    if (!unit.alive && (unit.kind === 'minion' || unit.kind === 'champion')) {
      ctx.translate(footX, footY);
      ctx.scale(1, 0.45);
      ctx.translate(-footX, -footY);
    }
    if (hero) {
      drawBarbarian(ctx, footX, footY, height, swing, heroLean(pose.state), screen, tier, bob, attackPose(unit));
    } else if (unit.defId === 'tower') {
      drawSpire(ctx, footX, footY, height, unit.team === 'ally', unit.alive);
      if (unit.alive && unit.id === opts.targetId) this.rangeRing(ctx, unit, unit.team === 'ally' ? '#6aa7ff' : '#e4553c');
    } else if (unit.defId === 'base-ally' || unit.defId === 'base-enemy') {
      drawStronghold(ctx, footX, footY, height, unit.defId === 'base-ally', unit.alive);
    } else if (unit.kind === 'seal') {
      drawProp(ctx, footX, footY, height * 0.45, 'rock', 1);
    } else if (bossLook(unit)) {
      drawBoss(ctx, footX, footY - bob, height, bossLook(unit) as BossLook, swing, unit.team === 'ally');
    } else {
      const look = tokenLook(unit);
      drawToken(ctx, footX, footY - bob, height * look.scale, look, swing, unit.team === 'ally');
    }
    if (unit.whirlT > 0) {
      ctx.strokeStyle = 'rgba(240, 220, 170, 0.8)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(footX, footY - height * 0.45, height * 0.42, height * 0.16, opts.time * 6, 0, Math.PI * 1.5);
      ctx.stroke();
    }
    ctx.restore();
    if (unit.buffT > 0 && unit.alive) {
      ctx.strokeStyle = 'rgba(230, 211, 161, 0.75)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(footX, footY, height * 0.34, height * 0.14, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (unit.alive && (unit.kind !== 'minion' || unit.hp < unit.maxHp)) {
      this.drawBar(unit, footX, footY, height, opts.targetId);
    }
    if (unit.stun > 0 && unit.alive) {
      ctx.fillStyle = '#f0e2bc';
      ctx.font = '14px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText('✶', footX, footY - height - 8);
    }
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

function shadow(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(x, y, w, h, 0, 0, Math.PI * 2);
  ctx.fill();
}

const ARMOR: Record<ArmorTier, { cloth: string; metal: string; skin: string; leather: string }> = {
  light: { cloth: '#6e2a22', metal: '#c8b496', skin: '#c48a62', leather: '#8a5a32' },
  medium: { cloth: '#5c2420', metal: '#d5dbe4', skin: '#c48a62', leather: '#6a4030' },
  heavy: { cloth: '#3a2428', metal: '#e6ebf2', skin: '#c48a62', leather: '#4a4038' },
};

/** Weapon pose for the committed swing. Canceled attacks leave this at none. */
function attackPose(unit: Unit): 'none' | 'raise' | 'swing' | 'follow' {
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
  attack: 'none' | 'raise' | 'swing' | 'follow' = 'none',
): void {
  const colors = ARMOR[tier];
  const h = height;
  const fwdX = Math.cos(screen);
  const fwdY = Math.sin(screen);
  const sideX = -fwdY;
  const sideY = fwdX;
  const step = swing * h * (lean > 0.3 ? 0.16 : lean > 0 ? 0.11 : 0.02);
  shadow(ctx, x, y, h * 0.22, h * 0.08);
  ctx.save();
  ctx.translate(x, y + bob);
  const hipY = -h * 0.42;
  const leanX = fwdX * lean * h * 0.28;
  const leanY = fwdY * lean * h * 0.28;
  const leg = (sign: number) => {
    ctx.strokeStyle = colors.leather;
    ctx.lineWidth = Math.max(2, h * 0.06);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(leanX * 0.3, hipY);
    ctx.lineTo(sideX * step * sign, sideY * step * sign - h * 0.02);
    ctx.stroke();
  };
  leg(1);
  leg(-1);
  ctx.translate(leanX, leanY);
  ctx.fillStyle = colors.cloth;
  ctx.beginPath();
  ctx.moveTo(-h * 0.16, hipY);
  ctx.lineTo(h * 0.16, hipY);
  ctx.lineTo(h * 0.12, -h * 0.72);
  ctx.lineTo(-h * 0.12, -h * 0.72);
  ctx.closePath();
  ctx.fill();
  if (tier !== 'light') {
    ctx.fillStyle = colors.metal;
    ctx.fillRect(-h * 0.1, -h * 0.68, h * 0.2, h * 0.16);
  }
  if (tier === 'heavy') {
    ctx.fillStyle = colors.metal;
    ctx.fillRect(-h * 0.18, -h * 0.58, h * 0.08, h * 0.12);
    ctx.fillRect(h * 0.1, -h * 0.58, h * 0.08, h * 0.12);
  }
  ctx.fillStyle = colors.skin;
  ctx.beginPath();
  ctx.arc(0, -h * 0.82, h * 0.11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = colors.leather;
  ctx.fillRect(-h * 0.12, -h * 0.9, h * 0.24, h * 0.06);
  const arm = (sign: number, weapon: 'sword' | 'axe') => {
    const raised = attack === 'raise' ? -h * 0.2 : 0;
    const ax = sideX * h * 0.2 * sign + (attack === 'none' ? sideX * -step * sign * 0.8 : 0);
    const ay = -h * 0.62 + raised + (attack === 'none' ? sideY * -step * sign * 0.35 : 0);
    ctx.strokeStyle = colors.skin;
    ctx.lineWidth = Math.max(2, h * 0.045);
    ctx.beginPath();
    ctx.moveTo(0, -h * 0.66);
    ctx.lineTo(ax, ay);
    ctx.stroke();
    ctx.save();
    ctx.translate(ax, ay);
    const pose =
      attack === 'raise' ? -1.15 : attack === 'swing' ? 1.2 : attack === 'follow' ? 0.45 : swing * 0.6;
    ctx.rotate(screen + pose * sign);
    ctx.fillStyle = colors.metal;
    if (weapon === 'sword') {
      ctx.fillRect(-h * 0.02, -h * 0.28, h * 0.04, h * 0.28);
      ctx.fillStyle = colors.leather;
      ctx.fillRect(-h * 0.05, -h * 0.04, h * 0.1, h * 0.035);
    } else {
      ctx.beginPath();
      ctx.moveTo(0, -h * 0.22);
      ctx.lineTo(h * 0.1, -h * 0.08);
      ctx.lineTo(0, -h * 0.02);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(-h * 0.015, -h * 0.02, h * 0.03, h * 0.12);
    }
    ctx.restore();
  };
  arm(-1, 'sword');
  arm(1, 'axe');
  ctx.fillStyle = '#f0e2bc';
  ctx.beginPath();
  ctx.moveTo(fwdX * h * 0.2, -h * 0.82 + fwdY * h * 0.2);
  ctx.lineTo(fwdX * h * 0.34, -h * 0.82 + fwdY * h * 0.34);
  ctx.lineTo(fwdX * h * 0.16 + sideX * h * 0.08, -h * 0.82 + fwdY * h * 0.16 + sideY * h * 0.08);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawToken(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  height: number,
  look: TokenLook,
  swing: number,
  ally: boolean,
): void {
  const h = height;
  shadow(ctx, x, y, h * 0.28, h * 0.1);
  ctx.strokeStyle = ally ? '#6aa7ff' : '#e4553c';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(x, y, h * 0.34, h * 0.13, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = look.body;
  ctx.beginPath();
  ctx.moveTo(x, y - h);
  ctx.lineTo(x + h * 0.22, y - h * 0.15);
  ctx.lineTo(x, y - h * 0.28);
  ctx.lineTo(x - h * 0.22, y - h * 0.15);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = look.trim;
  ctx.fillRect(x - h * 0.08, y - h * 0.72, h * 0.16, h * 0.12);
  drawWeapon(ctx, x + h * 0.18, y - h * 0.45 + swing * h * 0.06, h, look.weapon, swing);
}

function drawWeapon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  h: number,
  weapon: TokenLook['weapon'],
  swing: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(swing * 0.4);
  ctx.fillStyle = '#e6d3a1';
  ctx.strokeStyle = '#e6d3a1';
  ctx.lineWidth = Math.max(1.5, h * 0.04);
  if (weapon === 'bow') {
    ctx.beginPath();
    ctx.arc(0, 0, h * 0.16, -1.2, 1.2);
    ctx.stroke();
  } else if (weapon === 'spear') {
    ctx.beginPath();
    ctx.moveTo(0, h * 0.12);
    ctx.lineTo(0, -h * 0.28);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -h * 0.32);
    ctx.lineTo(h * 0.05, -h * 0.2);
    ctx.lineTo(-h * 0.05, -h * 0.2);
    ctx.fill();
  } else if (weapon === 'club') {
    ctx.fillRect(-h * 0.04, -h * 0.05, h * 0.08, h * 0.22);
    ctx.beginPath();
    ctx.arc(0, -h * 0.08, h * 0.08, 0, Math.PI * 2);
    ctx.fill();
  } else if (weapon === 'staff') {
    ctx.beginPath();
    ctx.moveTo(0, h * 0.16);
    ctx.lineTo(0, -h * 0.28);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, -h * 0.32, h * 0.06, 0, Math.PI * 2);
    ctx.fill();
  } else if (weapon === 'horns') {
    ctx.beginPath();
    ctx.moveTo(-h * 0.16, -h * 0.2);
    ctx.lineTo(-h * 0.28, -h * 0.42);
    ctx.lineTo(-h * 0.08, -h * 0.22);
    ctx.moveTo(h * 0.16, -h * 0.2);
    ctx.lineTo(h * 0.28, -h * 0.42);
    ctx.lineTo(h * 0.08, -h * 0.22);
    ctx.fill();
  } else if (weapon === 'quills') {
    for (const sign of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(sign * h * 0.04, 0);
      ctx.lineTo(sign * h * 0.2, -h * 0.16);
      ctx.lineTo(sign * h * 0.06, -h * 0.02);
      ctx.fill();
    }
  } else if (weapon === 'orb') {
    ctx.beginPath();
    ctx.arc(0, -h * 0.1, h * 0.1, 0, Math.PI * 2);
    ctx.fill();
  } else if (weapon === 'wraps') {
    ctx.strokeStyle = '#e6dcc4';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(-h * 0.12, -h * 0.05 + i * h * 0.06);
      ctx.lineTo(h * 0.12, -h * 0.08 + i * h * 0.06);
      ctx.stroke();
    }
  } else {
    ctx.fillRect(-h * 0.02, -h * 0.26, h * 0.04, h * 0.26);
  }
  ctx.restore();
}

interface BossLook {
  body: string;
  trim: string;
  mark: string;
  height: number;
}

function bossLook(unit: Unit): BossLook | null {
  if (unit.objective === 'baron') return { body: '#8a1a14', trim: '#f0c14a', mark: 'diablo', height: 168 };
  if (unit.objective === 'herald') return { body: '#c45520', trim: '#f2d2a2', mark: 'mephisto', height: 160 };
  if (unit.objective === 'dragon') return { body: '#6a8a32', trim: '#d7e2a4', mark: 'duriel', height: 156 };
  if (unit.defId === 'blood-raven') return { body: '#5a8a28', trim: '#e7d48a', mark: 'andariel', height: 150 };
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
): void {
  const h = height;
  shadow(ctx, x, y, h * 0.36, h * 0.12);
  ctx.strokeStyle = ally ? '#6aa7ff' : '#e4553c';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(x, y, h * 0.4, h * 0.15, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = look.body;
  ctx.beginPath();
  ctx.moveTo(x, y - h);
  ctx.lineTo(x + h * 0.32, y - h * 0.2);
  ctx.lineTo(x, y - h * 0.08);
  ctx.lineTo(x - h * 0.32, y - h * 0.2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = look.trim;
  if (look.mark === 'diablo') {
    ctx.beginPath();
    ctx.moveTo(x - h * 0.16, y - h * 0.82);
    ctx.lineTo(x - h * 0.28, y - h);
    ctx.lineTo(x - h * 0.04, y - h * 0.78);
    ctx.moveTo(x + h * 0.16, y - h * 0.82);
    ctx.lineTo(x + h * 0.28, y - h);
    ctx.lineTo(x + h * 0.04, y - h * 0.78);
    ctx.fill();
  } else if (look.mark === 'duriel') {
    ctx.beginPath();
    ctx.ellipse(x, y - h * 0.55, h * 0.22, h * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (look.mark === 'andariel') {
    for (const sign of [-1, 0, 1]) {
      ctx.beginPath();
      ctx.moveTo(x + sign * h * 0.1, y - h * 0.7);
      ctx.lineTo(x + sign * h * 0.16, y - h * 0.95);
      ctx.lineTo(x + sign * h * 0.04, y - h * 0.7);
      ctx.fill();
    }
  } else {
    ctx.fillRect(x - h * 0.18, y - h * 0.78, h * 0.36, h * 0.08);
  }
  drawWeapon(ctx, x + h * 0.22, y - h * 0.4 + swing * 4, h * 0.7, look.mark === 'andariel' ? 'bow' : 'club', swing);
}

function tokenLook(unit: Unit): TokenLook {
  const ally = unit.team === 'ally';
  if (unit.defId === 'rogue' || unit.defId === 'rogue-archer') {
    return { body: '#2f6a3a', trim: '#d7c48a', weapon: 'bow', scale: 1 };
  }
  if (ally && (unit.defId === 'skeleton' || unit.defId === 'hungry-dead')) {
    return { body: '#d9c27a', trim: '#f4ecd2', weapon: 'spear', scale: 1.05 };
  }
  if (ally && (unit.defId === 'goatman' || unit.defId === 'demon' || unit.defId === 'mummy')) {
    return { body: '#8a93a0', trim: '#e6ebf2', weapon: 'spear', scale: 1.05 };
  }
  switch (unit.defId) {
    case 'fallen':
      return { body: '#c4492a', trim: '#f0c14a', weapon: 'sword', scale: 0.9 };
    case 'zombie':
      return { body: '#6a8a55', trim: '#c9d2b0', weapon: 'club', scale: 1 };
    case 'quillrat':
      return { body: '#a67c4e', trim: '#e6d3a1', weapon: 'quills', scale: 0.85 };
    case 'goatman':
      return { body: '#8a5a28', trim: '#e6d3a1', weapon: 'horns', scale: 1.05 };
    case 'demon':
      return { body: '#c4a06a', trim: '#6a3a28', weapon: 'club', scale: 1.15 };
    case 'willowisp':
      return { body: '#7ec8e3', trim: '#e8fbff', weapon: 'orb', scale: 0.8 };
    case 'mummy':
      return { body: '#d9c7a2', trim: '#8a7048', weapon: 'wraps', scale: 1.05 };
    case 'skeleton':
      return { body: '#e6dcc8', trim: '#8a8070', weapon: 'sword', scale: 1 };
    case 'hungry-dead':
      return { body: '#6b5a48', trim: '#c4b49a', weapon: 'club', scale: 1 };
    default:
      return { body: unit.color || '#888', trim: unit.accent || '#eee', weapon: 'sword', scale: 1 };
  }
}

/** Isometric spire. The foot is the bottom center of the masonry. */
function drawSpire(ctx: CanvasRenderingContext2D, x: number, y: number, height: number, ally: boolean, alive: boolean): void {
  const h = alive ? height : height * 0.55;
  shadow(ctx, x, y, h * 0.28, h * 0.1);
  const core = ally ? '#6aa7ff' : '#e4553c';
  ctx.fillStyle = '#6e6458';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + h * 0.28, y - h * 0.12);
  ctx.lineTo(x, y - h * 0.24);
  ctx.lineTo(x - h * 0.28, y - h * 0.12);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#8a7d6c';
  ctx.beginPath();
  ctx.moveTo(x, y - h * 0.18);
  ctx.lineTo(x + h * 0.18, y - h * 0.42);
  ctx.lineTo(x, y - h * 0.5);
  ctx.lineTo(x - h * 0.18, y - h * 0.42);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#4e463c';
  ctx.beginPath();
  ctx.moveTo(x, y - h * 0.46);
  ctx.lineTo(x + h * 0.08, y - h * 0.78);
  ctx.lineTo(x, y - h);
  ctx.lineTo(x - h * 0.08, y - h * 0.78);
  ctx.closePath();
  ctx.fill();
  if (!alive) return;
  const glow = ctx.createRadialGradient(x, y - h * 0.55, 1, x, y - h * 0.55, h * 0.16);
  glow.addColorStop(0, '#fff6d8');
  glow.addColorStop(0.45, core);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y - h * 0.55, h * 0.16, 0, Math.PI * 2);
  ctx.fill();
}

function drawStronghold(ctx: CanvasRenderingContext2D, x: number, y: number, height: number, ally: boolean, alive: boolean): void {
  const h = alive ? height : height * 0.55;
  shadow(ctx, x, y, h * 0.34, h * 0.12);
  ctx.fillStyle = ally ? '#8d7b62' : '#3a3144';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + h * 0.42, y - h * 0.16);
  ctx.lineTo(x, y - h * 0.32);
  ctx.lineTo(x - h * 0.42, y - h * 0.16);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = ally ? '#c9b89a' : '#2c2636';
  ctx.fillRect(x - h * 0.16, y - h * 0.72, h * 0.32, h * 0.42);
  ctx.fillStyle = ally ? '#6aa7ff' : '#e4553c';
  ctx.beginPath();
  ctx.moveTo(x, y - h * 0.78);
  ctx.lineTo(x, y - h);
  ctx.lineTo(x + h * 0.16, y - h * 0.9);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = ally ? '#e6d3a1' : '#7a4ea8';
  ctx.lineWidth = 2;
  ctx.strokeRect(x - h * 0.16, y - h * 0.72, h * 0.32, h * 0.42);
}

function drawProp(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  height: number,
  form: ReturnType<typeof propForm>,
  variant: number,
): void {
  const h = height;
  shadow(ctx, x, y, h * 0.28, h * 0.1);
  if (form === 'pillar') {
    ctx.fillStyle = variant % 2 === 0 ? '#5c564c' : '#3e4a34';
    ctx.fillRect(x - h * 0.08, y - h, h * 0.16, h);
    ctx.fillStyle = '#7a7264';
    ctx.fillRect(x - h * 0.14, y - h, h * 0.28, h * 0.08);
  } else if (form === 'posts') {
    ctx.fillStyle = '#6a5038';
    for (const ox of [-0.22, 0, 0.22]) ctx.fillRect(x + ox * h - 2, y - h, 4, h);
    ctx.fillRect(x - h * 0.24, y - h * 0.62, h * 0.48, 3);
  } else if (form === 'tent') {
    ctx.fillStyle = '#c4b494';
    ctx.beginPath();
    ctx.moveTo(x, y - h);
    ctx.lineTo(x + h * 0.36, y);
    ctx.lineTo(x - h * 0.36, y);
    ctx.fill();
    ctx.fillStyle = '#8d7b62';
    ctx.fillRect(x - 2, y - h, 4, h);
  } else if (form === 'cart') {
    ctx.fillStyle = '#6a5038';
    ctx.fillRect(x - h * 0.28, y - h * 0.55, h * 0.56, h * 0.28);
    ctx.fillStyle = '#3a342c';
    ctx.beginPath();
    ctx.arc(x - h * 0.16, y - h * 0.12, h * 0.1, 0, Math.PI * 2);
    ctx.arc(x + h * 0.16, y - h * 0.12, h * 0.1, 0, Math.PI * 2);
    ctx.fill();
  } else if (form === 'figure') {
    ctx.fillStyle = '#6e3a55';
    ctx.fillRect(x - h * 0.12, y - h * 0.7, h * 0.24, h * 0.55);
    ctx.fillStyle = '#e6c8a8';
    ctx.beginPath();
    ctx.arc(x, y - h * 0.82, h * 0.12, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = variant % 2 === 0 ? '#6a6458' : '#4e463c';
    ctx.beginPath();
    ctx.ellipse(x, y - h * 0.28, h * 0.32, h * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8a8174';
    ctx.beginPath();
    ctx.ellipse(x - h * 0.08, y - h * 0.42, h * 0.16, h * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}
