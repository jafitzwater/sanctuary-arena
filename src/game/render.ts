import moorUrl from '../assets/art/moor.png';
import { barbarianSheets, monsterSheets, propSheets, TWO_HAND_WCLASS } from './art/sheets';
import type { ActDef } from './data/acts/types';
import { projectIso, unprojectIso } from './iso';
import { distToPolyline, Rng, type Vec } from './math';
import { player } from './query';
import type { Camera, Sim, Unit } from './types';

interface Scenery {
  kind: 'tree' | 'dead' | 'tent' | 'wall';
  x: number;
  y: number;
  s: number;
  flip: boolean;
}

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

function loadImage(src: string): HTMLImageElement {
  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  return img;
}

/**
 * Isometric view of the Blood Moor. The ground is baked once; characters are
 * original generated sprites drawn as billboards so they are not skewed.
 */
export class Renderer {
  camera: Camera = { x: 0, y: 0, viewW: 800, viewH: 500, zoom: 1, cssW: 800, cssH: 500, dpr: 1 };
  private ctx: CanvasRenderingContext2D;
  private mapCanvas: HTMLCanvasElement | null = null;
  private mapKey = '';
  private scenery: Scenery[] = [];
  private snapped = false;
  private focusX = 0;
  private focusY = 0;
  private camBakeX = 0;
  private camBakeY = 0;
  private scale = 1;
  private ox = 0;
  private oy = 0;
  private reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private gait = new Map<number, { x: number; y: number; d: number }>();
  private archer: HTMLCanvasElement | null = null;

  private mapRef: ActDef | null = null;
  private readonly moor = loadImage(moorUrl);
  private readonly art = {
    idle: loadImage(barbarianSheets.NU),
    north: loadImage(barbarianSheets.north),
    walk1: loadImage(barbarianSheets.WL[0]),
    walk2: loadImage(barbarianSheets.WL[1]),
    run1: loadImage(barbarianSheets.RN[0]),
    run2: loadImage(barbarianSheets.RN[1]),
    atk1: loadImage(barbarianSheets.A1),
    atk2: loadImage(barbarianSheets.A2),
    cast: loadImage(barbarianSheets.S1),
    gethit: loadImage(barbarianSheets.GH),
    death: loadImage(barbarianSheets.DD),
    whirl: loadImage(barbarianSheets.whirl),
    leap: loadImage(barbarianSheets.leap),
    fallen: loadImage(monsterSheets.fallen),
    fallenWalk: loadImage(monsterSheets.fallenWalk),
    zombie: loadImage(monsterSheets.zombie),
    zombieWalk: loadImage(monsterSheets.zombieWalk),
    raven: loadImage(monsterSheets.raven),
    rogue: loadImage(monsterSheets.rogue),
    quill: loadImage(monsterSheets.quill),
    tent: loadImage(propSheets.tent),
    fire: loadImage(propSheets.fire),
    wall: loadImage(propSheets.wall),
    tower: loadImage(propSheets.tower),
    altar: loadImage(propSheets.altar),
  };

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D is unavailable');
    this.ctx = ctx;
    const bump = () => {
      this.mapKey = '';
    };
    this.moor.onload = bump;
    for (const img of Object.values(this.art)) img.onload = bump;
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const cssW = Math.max(1, rect.width);
    const cssH = Math.max(1, rect.height);
    const dpr = Math.min(window.devicePixelRatio || 1, cssW < 1100 ? 1.5 : 2);
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
    this.mapRef = sim.map;
    this.ensureMap(sim.map);
    this.ensureArcher();
    const ctx = this.ctx;
    const { dpr, cssW, cssH } = this.camera;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.fillStyle = '#070605';
    ctx.fillRect(0, 0, cssW, cssH);
    if (this.mapCanvas) {
      const srcW = cssW / this.scale;
      const srcH = cssH / this.scale;
      ctx.drawImage(this.mapCanvas, this.camBakeX, this.camBakeY, srcW, srcH, 0, 0, cssW, cssH);
    }

    const u = this.spriteScale();
    const layers: { depth: number; paint: () => void }[] = [];
    for (const prop of this.scenery) {
      layers.push({
        depth: prop.x + prop.y,
        paint: () => this.drawScenery(ctx, prop, u),
      });
    }
    const camp = sim.map.playerBase;
    const lair = sim.map.enemyBase;
    const flicker = 0.82 + Math.sin(opts.time * 11) * 0.18;
    layers.push({
      depth: camp.x + 70 + camp.y + 24,
      paint: () => this.drawFire(ctx, camp.x + 70, camp.y + 24, 54 * u * flicker),
    });
    layers.push({
      depth: lair.x - 90 + lair.y + 30,
      paint: () => this.drawFire(ctx, lair.x - 90, lair.y + 30, 48 * u * flicker),
    });

    const hero = player(sim);
    const units = sim.units.filter((unit) => unit.alive || unit.corpse > 0 || unit.kind !== 'minion');
    for (const unit of units) {
      layers.push({
        depth: unit.x + unit.y + (unit.kind === 'base' ? -8 : 0),
        paint: () => this.drawUnit(ctx, unit, opts, u),
      });
    }
    layers.sort((a, b) => a.depth - b.depth);
    for (const layer of layers) layer.paint();

    for (const shot of sim.projectiles) {
      const p = this.project(shot.x, shot.y);
      ctx.fillStyle = shot.color;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 4.5, 2.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const fx of sim.fx) this.drawFx(ctx, fx);

    if (opts.attack && hero.alive && opts.mode === 'play') {
      this.strokeEllipse(hero.x, hero.y, hero.attackRange, 'rgba(230, 211, 161, 0.28)');
    }
    if (Math.hypot(hero.x - camp.x, hero.y - camp.y) < sim.map.fountainRadius && hero.alive) {
      this.strokeEllipse(camp.x, camp.y, sim.map.fountainRadius, 'rgba(230, 190, 110, 0.22)');
    }

    this.drawLabel(camp.x, camp.y - 230, 'Rogue Encampment', '#e6d3a1');
    this.drawLabel(lair.x, lair.y - 230, 'Catacombs', '#e7b2a4');

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
    const ready = this.moor.complete && this.moor.naturalWidth > 0;
    const key = `${map.id}:${ready ? this.moor.naturalWidth : 0}`;
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
    ctx.fillStyle = '#100c09';
    ctx.fillRect(0, 0, width, height);
    ctx.setTransform(hw, hw * 0.5, -hw, hw * 0.5, ox, oy);
    ctx.imageSmoothingEnabled = true;
    if (ready) {
      const pattern = ctx.createPattern(this.moor, 'repeat');
      if (pattern) ctx.fillStyle = pattern;
    } else ctx.fillStyle = '#1a1410';
    ctx.fillRect(-200, -200, map.width + 400, map.height + 400);
    ctx.fillStyle = 'rgba(8, 6, 4, 0.38)';
    ctx.fillRect(0, 0, map.width, map.height);
    this.paintRoad(ctx, map);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.scenery = buildScenery(map);
    this.mapCanvas = canvas;
    this.mapKey = key;
  }

  private paintRoad(ctx: CanvasRenderingContext2D, map: ActDef): void {
    const camp = map.playerBase;
    const lair = map.enemyBase;
    ctx.fillStyle = 'rgba(92, 68, 40, 0.22)';
    ctx.beginPath();
    ctx.arc(camp.x, camp.y, map.plaza, 0, Math.PI * 2);
    ctx.fill();
    const crypt = ctx.createRadialGradient(lair.x, lair.y, 30, lair.x, lair.y, map.plaza);
    crypt.addColorStop(0, 'rgba(18, 36, 22, 0.72)');
    crypt.addColorStop(1, 'rgba(18, 36, 22, 0)');
    ctx.fillStyle = crypt;
    ctx.beginPath();
    ctx.arc(lair.x, lair.y, map.plaza, 0, Math.PI * 2);
    ctx.fill();

    trace(ctx, map.lane);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#241910';
    ctx.lineWidth = map.laneWidth + map.jungle * 1.4;
    ctx.stroke();
    ctx.strokeStyle = '#3a2b22';
    ctx.lineWidth = map.laneWidth + 18;
    ctx.stroke();
    ctx.strokeStyle = '#5a4032';
    ctx.lineWidth = map.laneWidth * 0.72;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(120, 36, 28, 0.28)';
    ctx.lineWidth = map.laneWidth * 0.28;
    ctx.stroke();

    const stain = ctx.createLinearGradient(map.width * 0.45, 0, map.width, 0);
    stain.addColorStop(0, 'rgba(70, 12, 14, 0)');
    stain.addColorStop(1, 'rgba(48, 8, 16, 0.4)');
    ctx.fillStyle = stain;
    ctx.fillRect(0, 0, map.width, map.height);

    const rng = new Rng(71);
    for (let i = 0; i < 80; i++) {
      const x = rng.range(200, map.width - 80);
      const y = rng.range(80, map.height - 80);
      if (distToPolyline({ x, y }, map.lane) > map.laneWidth * 0.35) continue;
      ctx.fillStyle = rng.next() > 0.5 ? 'rgba(90, 18, 16, 0.35)' : 'rgba(40, 28, 18, 0.4)';
      ctx.beginPath();
      ctx.ellipse(x, y, rng.range(10, 28), rng.range(6, 14), 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private ensureArcher(): void {
    const src = this.art.raven;
    if (this.archer || !src.complete || !src.naturalWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = src.naturalWidth;
    canvas.height = src.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(src, 0, 0);
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = 'rgba(86, 122, 168, 0.42)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    this.archer = canvas;
  }

  private drawScenery(ctx: CanvasRenderingContext2D, prop: Scenery, u: number): void {
    const p = this.project(prop.x, prop.y);
    if (p.x < -140 || p.y < -180 || p.x > this.camera.cssW + 140 || p.y > this.camera.cssH + 40) return;
    if (prop.kind === 'tent') {
      this.blit(ctx, this.art.tent, p.x, p.y, 92 * u * prop.s, prop.flip);
      return;
    }
    if (prop.kind === 'wall') {
      this.blit(ctx, this.art.wall, p.x, p.y, 70 * u * prop.s, prop.flip);
      return;
    }
    this.drawTree(ctx, p.x, p.y, prop.s * u, prop.kind === 'dead');
  }

  private drawTree(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, dead: boolean): void {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(x, y, 14 * s, 6 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = dead ? '#3a3228' : '#2a2118';
    ctx.fillRect(x - 3 * s, y - 22 * s, 6 * s, 22 * s);
    ctx.fillStyle = dead ? '#4e4638' : '#1a2c22';
    ctx.beginPath();
    ctx.moveTo(x, y - 48 * s);
    ctx.lineTo(x + 16 * s, y - 16 * s);
    ctx.lineTo(x - 16 * s, y - 16 * s);
    ctx.closePath();
    ctx.fill();
    if (!dead) {
      ctx.fillStyle = '#24382c';
      ctx.beginPath();
      ctx.moveTo(x - 4 * s, y - 34 * s);
      ctx.lineTo(x + 12 * s, y - 18 * s);
      ctx.lineTo(x - 14 * s, y - 20 * s);
      ctx.fill();
    }
  }

  private drawFire(ctx: CanvasRenderingContext2D, x: number, y: number, height: number): void {
    const p = this.project(x, y);
    if (p.x < -40 || p.y < -80 || p.x > this.camera.cssW + 40 || p.y > this.camera.cssH + 20) return;
    ctx.fillStyle = 'rgba(255, 120, 40, 0.18)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, height * 0.55, height * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    this.blit(ctx, this.art.fire, p.x, p.y, height, false);
  }

  private drawUnit(ctx: CanvasRenderingContext2D, unit: Unit, opts: DrawOpts, u: number): void {
    const p = this.project(unit.x, unit.y);
    if (p.x < -160 || p.y < -200 || p.x > this.camera.cssW + 160 || p.y > this.camera.cssH + 60) return;
    const gait = this.gaitOf(unit);
    let y = p.y;
    if (unit.leap) {
      const t = Math.min(1, unit.leap.t / unit.leap.dur);
      y -= Math.sin(t * Math.PI) * 48 * u;
    } else if (gait.moving && !this.reduceMotion) {
      y += Math.sin(gait.d / 14) * 2.2;
    }
    const height = this.unitHeight(unit) * u;
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 2, height * 0.26, height * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
    if (opts.targetId === unit.id && unit.alive) {
      ctx.strokeStyle = '#f0e2bc';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, height * 0.32, height * 0.13, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.save();
    if (!unit.alive) ctx.globalAlpha = 0.55;
    else if (unit.invuln > 0 && Math.sin(opts.time * 28) > 0) ctx.globalAlpha = 0.55;
    if (!unit.alive && unit.kind === 'minion') {
      ctx.translate(p.x, y);
      ctx.scale(1, 0.55);
      ctx.translate(-p.x, -y);
    }
    const sheet = this.sheetFor(unit, gait.moving, gait.d);
    const flip = Math.cos(unit.facing) < -0.12;
    if (sheet) this.blit(ctx, sheet, p.x, y, height, flip);
    else this.fallback(ctx, unit, p.x, y, height);
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
    if (unit.alive && (unit.kind !== 'minion' || unit.hp < unit.maxHp)) this.drawBar(unit, p.x, y, height);
    if (unit.stun > 0 && unit.alive) {
      ctx.fillStyle = '#f0e2bc';
      ctx.font = '14px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText('✶', p.x, y - height - 8);
    }
  }

  private unitHeight(unit: Unit): number {
    switch (unit.defId) {
      case 'barbarian':
        return 102;
      case 'blood-raven':
        return 96;
      case 'fallen':
        return 64;
      case 'zombie':
        return 92;
      case 'quillrat':
        return 70;
      case 'rogue':
      case 'rogue-archer':
        return 86;
      case 'tower':
        return unit.alive ? 128 : 70;
      case 'base-ally':
        return unit.alive ? 140 : 80;
      case 'base-enemy':
        return unit.alive ? 156 : 90;
      default:
        return 70;
    }
  }

  private sheetFor(unit: Unit, moving: boolean, phase: number): Sheet | null {
    const step = Math.floor(phase / 22) % 2 === 0;
    if (unit.defId === 'barbarian') {
      if (!unit.alive) return this.art.death;
      if (unit.whirlT > 0) return this.art.whirl;
      if (unit.leap) return this.art.leap;
      if (unit.castT > 0) return this.art.cast;
      if (unit.hitFlash > 0 && unit.swing <= 0) return this.art.gethit;
      if (unit.swing > 0) return TWO_HAND_WCLASS.has(unit.wclass) ? this.art.atk2 : this.art.atk1;
      const north = Math.sin(unit.facing) < -0.62 && Math.abs(Math.cos(unit.facing)) < 0.72;
      if (!moving && north) return this.art.north;
      if (moving) {
        const town = this.inTown(unit);
        if (town) return step ? this.art.walk1 : this.art.walk2;
        return step ? this.art.run1 : this.art.run2;
      }
      return this.art.idle;
    }
    if (unit.defId === 'fallen') return moving ? (step ? this.art.fallenWalk : this.art.fallen) : this.art.fallen;
    if (unit.defId === 'zombie') return moving ? (step ? this.art.zombieWalk : this.art.zombie) : this.art.zombie;
    if (unit.defId === 'quillrat') return this.art.quill;
    if (unit.defId === 'rogue') return this.art.rogue;
    if (unit.defId === 'rogue-archer') return this.archer ?? this.art.rogue;
    if (unit.defId === 'blood-raven') return this.art.raven;
    if (unit.defId === 'tower') return unit.alive ? this.art.tower : null;
    if (unit.defId === 'base-ally') return unit.alive ? this.art.tent : null;
    if (unit.defId === 'base-enemy') return unit.alive ? this.art.altar : null;
    return null;
  }

  private fallback(ctx: CanvasRenderingContext2D, unit: Unit, x: number, y: number, height: number): void {
    ctx.fillStyle = unit.alive ? unit.color : '#3a342c';
    ctx.beginPath();
    ctx.ellipse(x, y - height * 0.35, height * 0.28, height * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  private inTown(unit: Unit): boolean {
    const map = this.mapRef;
    if (!map) return false;
    const base = map.playerBase;
    return Math.hypot(unit.x - base.x, unit.y - base.y) <= map.shopRadius;
  }

  private gaitOf(unit: Unit): { moving: boolean; d: number } {
    const prev = this.gait.get(unit.id);
    let d = prev?.d ?? 0;
    let moving = false;
    if (prev) {
      const step = Math.hypot(unit.x - prev.x, unit.y - prev.y);
      moving = step > 0.4;
      if (moving) d += step;
    }
    this.gait.set(unit.id, { x: unit.x, y: unit.y, d });
    return { moving, d };
  }

  private blit(ctx: CanvasRenderingContext2D, img: Sheet, x: number, y: number, height: number, flip: boolean): void {
    const iw = img instanceof HTMLImageElement ? img.naturalWidth : img.width;
    const ih = img instanceof HTMLImageElement ? img.naturalHeight : img.height;
    if (!iw || !ih) return;
    const w = (iw / ih) * height;
    ctx.save();
    ctx.translate(x, y);
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(img, -w / 2, -height, w, height);
    ctx.restore();
  }

  private drawBar(unit: Unit, x: number, footY: number, height: number): void {
    const ctx = this.ctx;
    const w = unit.kind === 'base' ? 74 : unit.kind === 'champion' ? 54 : 34;
    const y = footY - height - (unit.kind === 'minion' ? 6 : 16);
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, 6);
    ctx.fillStyle = unit.team === 'ally' ? '#9a2a22' : '#9a2a22';
    ctx.fillRect(x - w / 2, y, w, 4);
    ctx.fillStyle = unit.team === 'ally' ? '#c6d28a' : '#e4553c';
    ctx.fillRect(x - w / 2, y, w * Math.max(0, Math.min(1, unit.hp / unit.maxHp)), 4);
    if (unit.kind === 'champion' || unit.kind === 'base') {
      ctx.fillStyle = '#f0e2bc';
      ctx.font = '13px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText(unit.name, x, y - 4);
    }
  }

  private drawLabel(x: number, y: number, text: string, color: string): void {
    const p = this.project(x, y);
    if (p.x < 0 || p.y < 0 || p.x > this.camera.cssW || p.y > this.camera.cssH) return;
    const ctx = this.ctx;
    ctx.fillStyle = color;
    ctx.font = '20px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText(text, p.x, p.y);
  }

  private strokeEllipse(x: number, y: number, radius: number, color: string): void {
    const c = this.project(x, y);
    const e = this.project(x + radius, y);
    const rx = Math.abs(e.x - c.x);
    const ry = rx * 0.5;
    const ctx = this.ctx;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
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
    const map = sim.map;
    const sx = w / map.width;
    const sy = h / map.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#120e0b';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#6a5340';
    ctx.lineWidth = 3;
    ctx.beginPath();
    map.lane.forEach((point, index) => {
      const x = point.x * sx;
      const y = point.y * sy;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    for (const unit of sim.units) {
      if (!unit.alive && unit.kind === 'minion') continue;
      const x = unit.x * sx;
      const y = unit.y * sy;
      ctx.fillStyle = unit.team === 'ally' ? '#e6d3a1' : '#e15a4a';
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

function trace(ctx: CanvasRenderingContext2D, lane: Vec[]): void {
  ctx.beginPath();
  lane.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
}

function buildScenery(map: ActDef): Scenery[] {
  const rng = new Rng(0xa11);
  const props: Scenery[] = [];
  for (let i = 0; i < 48; i++) {
    const x = rng.range(40, map.width - 40);
    const y = rng.range(40, map.height - 40);
    const road = distToPolyline({ x, y }, map.lane);
    if (road < map.laneWidth * 0.55) continue;
    if (Math.hypot(x - map.playerBase.x, y - map.playerBase.y) < map.plaza * 0.9) continue;
    if (Math.hypot(x - map.enemyBase.x, y - map.enemyBase.y) < map.plaza * 0.7) continue;
    const dead = x > map.width * 0.62 || rng.next() > 0.7;
    props.push({ kind: dead ? 'dead' : 'tree', x, y, s: rng.range(0.75, 1.45), flip: rng.next() > 0.5 });
  }
  const camp = map.playerBase;
  props.push(
    { kind: 'tent', x: camp.x - 30, y: camp.y - 175, s: 1.05, flip: false },
    { kind: 'tent', x: camp.x + 155, y: camp.y - 140, s: 0.92, flip: true },
    { kind: 'tent', x: camp.x + 130, y: camp.y + 155, s: 0.84, flip: false },
  );
  for (let i = 0; i < 16; i++) {
    const angle = (i / 16) * Math.PI * 2;
    if (Math.cos(angle) > 0.42) continue;
    props.push({
      kind: 'wall',
      x: camp.x + Math.cos(angle) * 290,
      y: camp.y + Math.sin(angle) * 200,
      s: 0.82 + (i % 3) * 0.08,
      flip: i % 2 === 0,
    });
  }
  const lair = map.enemyBase;
  for (let i = 0; i < 7; i++) {
    const angle = (i / 7) * Math.PI * 2;
    props.push({
      kind: 'dead',
      x: lair.x + Math.cos(angle) * 240,
      y: lair.y + Math.sin(angle) * 160,
      s: 1.25,
      flip: i % 2 === 0,
    });
  }
  return props;
}
