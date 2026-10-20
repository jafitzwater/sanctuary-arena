import { actProps, d2Atlas, monsterSheets } from './art/sheets';
import type { ActDef } from './data/acts/types';
import { projectIso, unprojectIso } from './iso';
import type { Prop } from './landscape';
import { sceneryFor } from './landscape';
import type { Vec } from './math';
import { player } from './query';
import { groundAt, type GroundKind } from './terrain';
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
  private gait = new Map<number, { x: number; y: number; d: number }>();
  private facingRow = new Map<number, number>();
  private mapRef: ActDef | null = null;
  private readonly art = {
    raven: loadImage(monsterSheets.raven),
    ravenWalk: loadImage(monsterSheets.ravenWalk),
  };
  private readonly props = {
    tree: actProps.tree.map(loadImage),
    rock: actProps.rock.map(loadImage),
    fence: actProps.fence.map(loadImage),
    tent: actProps.tent.map(loadImage),
    stone: actProps.stone.map(loadImage),
  };
  private readonly mobs = {
    fallenIdle: loadImage(d2Atlas.fallen.idle),
    fallenWalk: loadImage(d2Atlas.fallen.walk),
    zombieIdle: loadImage(d2Atlas.zombie.idle),
    zombieWalk: loadImage(d2Atlas.zombie.walk),
    shamanIdle: loadImage(d2Atlas.shaman.idle),
    shamanWalk: loadImage(d2Atlas.shaman.walk),
    quill: loadImage(d2Atlas.quill),
  };
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
  private readonly rogueSheet = loadImage(d2Atlas.rogue);
  private readonly akaraSheet = loadImage(d2Atlas.akara);
  private readonly ground = loadImage(d2Atlas.ground);

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D is unavailable');
    this.ctx = ctx;
    const bump = () => {
      this.mapKey = '';
    };
    this.ground.onload = bump;
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
    ctx.imageSmoothingEnabled = false;

    const u = this.spriteScale();
    const layers: { depth: number; paint: () => void }[] = [];
    for (const prop of this.scenery) {
      layers.push({
        depth: prop.x + prop.y,
        paint: () => this.drawScenery(ctx, prop, u),
      });
    }

    const units = sim.units.filter((unit) => unit.alive || unit.corpse > 0 || unit.kind !== 'minion');
    for (const unit of units) {
      layers.push({
        depth: unit.x + unit.y + (unit.kind === 'base' ? -8 : 0),
        paint: () => this.drawUnit(ctx, unit, opts, u, this.armorTier(sim)),
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
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#100c09';
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
    };
    const i1 = Math.ceil(map.width / step) + 2;
    const j1 = Math.ceil(map.height / step) + 2;
    for (let j = -2; j <= j1; j++) {
      for (let i = -2; i <= i1; i++) {
        const kind = groundAt(map, i * step, j * step);
        const row = rows[kind];
        let col = Math.abs((i * 3 + j * 5) % 4);
        if (kind === 'river') col %= 2;
        if (kind === 'dark') col = 2 + (col % 2);
        const sx = Math.round((i - j) * 80 + ox);
        const sy = Math.round((i + j) * 40 + oy);
        // One extra pixel on every side so the diamonds overlap and the bake has no seams.
        ctx.drawImage(this.ground, col * 160, row * 80, 160, 80, sx - 81, sy - 41, 162, 82);
      }
    }
  }

  private drawScenery(ctx: CanvasRenderingContext2D, prop: Prop, u: number): void {
    const p = this.project(prop.x, prop.y);
    if (p.x < -180 || p.y < -220 || p.x > this.camera.cssW + 180 || p.y > this.camera.cssH + 40) return;
    const height =
      prop.kind === 'tree' ? 168 :
      prop.kind === 'tent' ? 108 :
      prop.kind === 'fence' ? 64 :
      prop.kind === 'npc' ? 102 :
      86;
    const sheet =
      prop.kind === 'npc' ? this.akaraSheet :
      prop.kind === 'tree' ? this.props.tree[prop.variant % this.props.tree.length] :
      prop.kind === 'rock' ? this.props.rock[prop.variant % this.props.rock.length] :
      prop.kind === 'fence' ? this.props.fence[prop.variant % this.props.fence.length] :
      this.props.tent[prop.variant % this.props.tent.length];
    if (sheet.complete && sheet.naturalWidth > 0) this.blit(ctx, sheet, p.x, p.y, height * u, prop.flip);
  }

  private drawUnit(ctx: CanvasRenderingContext2D, unit: Unit, opts: DrawOpts, u: number, tier: ArmorTier): void {
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
    const glyph = this.sheetFor(unit, gait.moving, gait.d, tier);
    const outlined = unit.kind === 'minion' || unit.kind === 'champion';
    if (glyph) this.blit(ctx, glyph.img, footX, y, height, glyph.flip, glyph, outlined);
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
    if (unit.defId === 'fallen' && unit.name === 'Bishibosh') return 92;
    switch (unit.defId) {
      case 'barbarian':
        return 108;
      case 'blood-raven':
        return 104;
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
        return unit.alive ? 140 : 80;
      case 'base-enemy':
        return unit.alive ? 156 : 90;
      default:
        return 70;
    }
  }

  private sheetFor(unit: Unit, moving: boolean, phase: number, tier: ArmorTier): Glyph | null {
    const raw = this.dirRow(unit.facing);
    const row = unit.whirlT > 0 ? raw : this.stepRow(unit.id, raw);
    if (unit.kind === 'seal') return this.full(this.props.rock[0], false);
    if (unit.defId === 'base-ally') return this.full(this.props.stone[0], false);
    if (unit.defId === 'base-enemy') return this.full(this.props.stone[1], false);
    if (unit.defId === 'tower') return this.full(this.props.rock[unit.alive ? 2 : 0], false);
    if (unit.defId === 'barbarian') {
      const pack = this.d2[tier];
      // One armor tier, one sheet per state. Feet share a cell anchor, and the
      // column advances with distance so a run does not skip ahead of the feet.
      if (!unit.alive || unit.castT > 0) return this.atlas(pack.idle, 1, 0, row);
      if (unit.whirlT > 0) return this.atlas(pack.run, 4, Math.floor(phase / 10) % 4, row);
      if (unit.leap || unit.swing > 0) {
        const col = unit.leap ? 2 : Math.min(3, Math.floor((1 - Math.max(0, unit.swing)) * 4));
        return this.atlas(pack.attack, 4, col, row);
      }
      if (moving) {
        // One frame per 16 world pixels, so the cycle slows with the 120 run.
        const col = Math.floor(phase / 16) % 4;
        return this.atlas(this.inTown(unit) ? pack.walk : pack.run, 4, col, row);
      }
      return this.atlas(pack.idle, 1, 0, row);
    }
    if (unit.defId === 'rogue' || unit.defId === 'rogue-archer') {
      return this.atlas(this.rogueSheet, 2, moving ? 1 : 0, row);
    }
    if (unit.defId === 'fallen' && unit.name === 'Bishibosh') {
      return this.cycle(this.mobs.shamanWalk, this.mobs.shamanIdle, moving, phase, row);
    }
    if (unit.defId === 'fallen' || unit.defId === 'goatman') {
      return this.cycle(this.mobs.fallenWalk, this.mobs.fallenIdle, moving, phase, row);
    }
    if (unit.defId === 'zombie' || unit.defId === 'skeleton' || unit.defId === 'hungry-dead' || unit.defId === 'mummy') {
      return this.cycle(this.mobs.zombieWalk, this.mobs.zombieIdle, moving, phase, row);
    }
    if (unit.defId === 'demon' || unit.defId === 'willowisp' || unit.objective === 'dragon' || unit.objective === 'herald' || unit.objective === 'baron') {
      return this.cycle(this.mobs.shamanWalk, this.mobs.shamanIdle, moving, phase, row);
    }
    if (unit.defId === 'quillrat') {
      return this.atlas(this.mobs.quill, 2, moving ? Math.floor(phase / 16) % 2 : 0, row);
    }
    const flip = Math.cos(unit.facing) < -0.12;
    const step = Math.floor(phase / 22) % 2 === 0;
    if (unit.defId === 'blood-raven') return this.full(moving ? (step ? this.art.ravenWalk : this.art.raven) : this.art.raven, flip);
    return null;
  }

  /** Turn at most one direction row per frame so a facing change does not pop. */
  private stepRow(id: number, target: number): number {
    const prev = this.facingRow.get(id);
    if (prev == null) {
      this.facingRow.set(id, target);
      return target;
    }
    let delta = (target - prev + 8) % 8;
    if (delta > 4) delta -= 8;
    const next = delta === 0 ? prev : (prev + Math.sign(delta) + 8) % 8;
    this.facingRow.set(id, next);
    return next;
  }

  /** Walk and idle from one monster's own sheet. No flip: every direction is a row. */
  private cycle(walk: HTMLImageElement, idle: HTMLImageElement, moving: boolean, phase: number, row: number): Glyph | null {
    if (moving) return this.atlas(walk, 4, Math.floor(phase / 16) % 4, row);
    return this.atlas(idle, 1, 0, row);
  }

  private armorTier(sim: Sim): ArmorTier {
    const id = sim.loadout.armor;
    if (id === 'stu' || id === 'rng') return 'heavy';
    if (id === 'lea') return 'medium';
    return 'light';
  }

  /** Sheet row 0 faces the camera. Later rows turn clockwise, two source rows per step. */
  private dirRow(facing: number): number {
    const sx = Math.cos(facing) - Math.sin(facing);
    const sy = Math.cos(facing) + Math.sin(facing);
    let delta = Math.atan2(sy, sx) - Math.PI / 2;
    if (delta < 0) delta += Math.PI * 2;
    return Math.floor((Math.round(delta / (Math.PI / 8)) % 16) / 2) % 8;
  }

  private full(img: Sheet, flip: boolean): Glyph | null {
    const iw = img instanceof HTMLImageElement ? img.naturalWidth : img.width;
    const ih = img instanceof HTMLImageElement ? img.naturalHeight : img.height;
    if (!iw || !ih) return null;
    return { img, flip, sx: 0, sy: 0, sw: iw, sh: ih };
  }

  private atlas(img: HTMLImageElement, cols: number, col: number, row: number): Glyph | null {
    if (!img.complete || !img.naturalWidth || !img.naturalHeight) return null;
    const sw = img.naturalWidth / cols;
    const sh = img.naturalHeight / 8;
    return { img, flip: false, sx: col * sw, sy: row * sh, sw, sh };
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

  private blit(
    ctx: CanvasRenderingContext2D,
    img: Sheet,
    x: number,
    y: number,
    height: number,
    flip: boolean,
    src?: Glyph,
    outline = false,
  ): void {
    const iw = src ? src.sw : img instanceof HTMLImageElement ? img.naturalWidth : img.width;
    const ih = src ? src.sh : img instanceof HTMLImageElement ? img.naturalHeight : img.height;
    if (!iw || !ih) return;
    const dh = Math.max(1, Math.round(height));
    const dw = Math.max(1, Math.round((iw / ih) * dh));
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(Math.round(x), Math.round(y));
    if (flip) ctx.scale(-1, 1);
    const dx = -Math.round(dw / 2);
    const dy = -dh;
    const paint = (ox: number, oy: number) => {
      if (src) ctx.drawImage(img, src.sx, src.sy, src.sw, src.sh, dx + ox, dy + oy, dw, dh);
      else ctx.drawImage(img, dx + ox, dy + oy, dw, dh);
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

