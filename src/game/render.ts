import type { ActDef } from './data/acts/types';
import { distToPolyline, Rng, type Vec } from './math';
import { player } from './query';
import type { Camera, Sim, Unit } from './types';

interface Prop {
  kind: 'tree' | 'dead' | 'rock' | 'grave' | 'bone' | 'tent' | 'pillar' | 'cart' | 'stump';
  x: number;
  y: number;
  s: number;
  rot: number;
}

export interface DrawOpts {
  mode: 'title' | 'play' | 'end';
  targetId: number | null;
  attack: boolean;
  time: number;
}

export class Renderer {
  camera: Camera = { x: 0, y: 0, viewW: 800, viewH: 500, zoom: 1, cssW: 800, cssH: 500, dpr: 1 };
  private ctx: CanvasRenderingContext2D;
  private mapCanvas: HTMLCanvasElement | null = null;
  private mapKey = '';
  private props: Prop[] = [];
  private snapped = false;
  private reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D is unavailable');
    this.ctx = ctx;
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = Math.max(1, rect.width);
    const cssH = Math.max(1, rect.height);
    const width = Math.round(cssW * dpr);
    const height = Math.round(cssH * dpr);
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.camera.cssW = cssW;
    this.camera.cssH = cssH;
    this.camera.dpr = dpr;
    this.camera.viewH = Math.max(380, Math.min(600, cssH * 0.92));
    this.camera.viewW = this.camera.viewH * (cssW / cssH);
    this.camera.zoom = cssH / this.camera.viewH;
  }

  screenToWorld(sx: number, sy: number): Vec {
    return {
      x: this.camera.x + sx / this.camera.zoom,
      y: this.camera.y + sy / this.camera.zoom,
    };
  }

  updateCamera(sim: Sim, mode: DrawOpts['mode'], dt: number, time: number): void {
    const focus = this.focus(sim, mode, time);
    const desiredX = focus.x - this.camera.viewW / 2;
    const desiredY = focus.y - this.camera.viewH / 2;
    const maxX = Math.max(0, sim.map.width - this.camera.viewW);
    const maxY = Math.max(0, sim.map.height - this.camera.viewH);
    const clampedX = Math.max(0, Math.min(maxX, desiredX));
    const clampedY = Math.max(0, Math.min(maxY, desiredY));
    if (!this.snapped) {
      this.camera.x = clampedX;
      this.camera.y = clampedY;
      this.snapped = true;
    } else {
      const t = 1 - Math.exp(-dt * 6);
      this.camera.x += (clampedX - this.camera.x) * t;
      this.camera.y += (clampedY - this.camera.y) * t;
    }
    if (!this.reduceMotion && sim.shake > 0) {
      this.camera.x += Math.sin(time * 42) * sim.shake;
      this.camera.y += Math.cos(time * 37) * sim.shake * 0.6;
    }
  }

  draw(sim: Sim, opts: DrawOpts): void {
    this.ensureMap(sim.map);
    const ctx = this.ctx;
    const { dpr, zoom } = this.camera;
    ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, -this.camera.x * dpr * zoom, -this.camera.y * dpr * zoom);
    ctx.imageSmoothingEnabled = true;
    if (this.mapCanvas) ctx.drawImage(this.mapCanvas, 0, 0);
    this.drawFires(ctx, sim, opts.time);
    const hero = player(sim);
    if (opts.attack && hero.alive && opts.mode === 'play') {
      ctx.strokeStyle = 'rgba(230, 211, 161, 0.2)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(hero.x, hero.y, hero.attackRange, 0, Math.PI * 2);
      ctx.stroke();
    }
    const units = [...sim.units].sort((a, b) => kindOrder(a) - kindOrder(b) || a.y - b.y);
    for (const unit of units) this.drawUnit(ctx, unit, opts);
    for (const shot of sim.projectiles) {
      ctx.fillStyle = shot.color;
      ctx.beginPath();
      ctx.arc(shot.x, shot.y, shot.radius + 1, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const fx of sim.fx) this.drawFx(ctx, fx);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const vignette = ctx.createRadialGradient(
      this.camera.cssW / 2,
      this.camera.cssH / 2,
      this.camera.cssH * 0.35,
      this.camera.cssW / 2,
      this.camera.cssH / 2,
      this.camera.cssH * 0.75,
    );
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.38)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, this.camera.cssW, this.camera.cssH);
    this.drawMinimap(sim, opts.targetId);
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
      x: hero.x + Math.cos(hero.facing) * 36,
      y: hero.y + Math.sin(hero.facing) * 24,
    };
  }

  private ensureMap(map: ActDef): void {
    if (this.mapCanvas && this.mapKey === map.id) return;
    const canvas = document.createElement('canvas');
    canvas.width = map.width;
    canvas.height = map.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    this.props = buildProps(map);
    paintMap(ctx, map, this.props);
    this.mapCanvas = canvas;
    this.mapKey = map.id;
  }

  private drawFires(ctx: CanvasRenderingContext2D, sim: Sim, time: number): void {
    const flicker = 0.75 + Math.sin(time * 9) * 0.25;
    const camp = sim.map.playerBase;
    drawFire(ctx, camp.x + 70, camp.y - 78, 10 * flicker, '#e6a15a');
    const lair = sim.map.enemyBase;
    drawFire(ctx, lair.x - 90, lair.y + 64, 12 * flicker, '#d24532');
    drawFire(ctx, lair.x - 40, lair.y - 80, 8 * flicker, '#9a2218');
    const ally = player(sim);
    if (Math.hypot(ally.x - camp.x, ally.y - camp.y) < sim.map.fountainRadius) {
      ctx.strokeStyle = 'rgba(230, 190, 110, 0.28)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(camp.x, camp.y, sim.map.fountainRadius, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  private drawUnit(ctx: CanvasRenderingContext2D, unit: Unit, opts: DrawOpts): void {
    if (!unit.alive && unit.kind === 'minion' && unit.corpse <= 0) return;
    ctx.save();
    ctx.translate(unit.x, unit.y);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 8, unit.radius * 0.95, unit.radius * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    if (opts.targetId === unit.id && unit.alive) {
      ctx.strokeStyle = '#f0e2bc';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(unit.x, unit.y, unit.radius + 8, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.save();
    ctx.translate(unit.x, unit.y);
    if (unit.leap) {
      const p = Math.min(1, unit.leap.t / unit.leap.dur);
      ctx.translate(0, -Math.sin(p * Math.PI) * 52);
    }
    if (!unit.alive) ctx.globalAlpha = unit.kind === 'minion' ? 0.45 : 0.7;
    else if (unit.invuln > 0 && Math.sin(opts.time * 28) > 0) ctx.globalAlpha = 0.55;
    if (unit.whirlT > 0) {
      ctx.save();
      ctx.rotate(opts.time * 14);
      ctx.strokeStyle = 'rgba(240, 226, 188, 0.85)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, unit.radius + 14, 0.2, 1.6);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, unit.radius + 14, Math.PI + 0.2, Math.PI + 1.6);
      ctx.stroke();
      ctx.restore();
    }
    if (unit.kind === 'champion' || unit.kind === 'minion') ctx.rotate(unit.facing);
    drawSprite(ctx, unit, opts.time);
    ctx.restore();

    if (unit.buffT > 0 && unit.alive) {
      ctx.strokeStyle = 'rgba(230, 211, 161, 0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(unit.x, unit.y, unit.radius + 5, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (unit.alive && (unit.kind !== 'minion' || unit.hp < unit.maxHp)) drawBar(ctx, unit);
    if (unit.stun > 0 && unit.alive) {
      ctx.fillStyle = '#f0e2bc';
      ctx.font = '12px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText('✶', unit.x, unit.y - unit.radius - 18);
    }
  }

  private drawFx(ctx: CanvasRenderingContext2D, fx: Sim['fx'][number]): void {
    const alpha = Math.max(0, 1 - fx.t / fx.life);
    ctx.save();
    ctx.globalAlpha = alpha;
    if (fx.kind === 'text' && fx.text) {
      ctx.fillStyle = fx.color;
      ctx.font = 'bold 16px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText(fx.text, fx.x, fx.y);
    } else if (fx.kind === 'ring') {
      ctx.strokeStyle = fx.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(fx.x, fx.y, fx.r * (0.35 + fx.t / fx.life), 0, Math.PI * 2);
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
    ctx.fillStyle = '#16110e';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#5a4634';
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
      if (!unit.alive) ctx.globalAlpha = 0.4;
      ctx.fillRect(x - r / 2, y - r / 2, r, r);
      ctx.globalAlpha = 1;
      if (unit.id === targetId) {
        ctx.strokeStyle = '#fff';
        ctx.strokeRect(x - 3, y - 3, 6, 6);
      }
    }
    ctx.strokeStyle = 'rgba(240, 226, 188, 0.45)';
    ctx.lineWidth = 1;
    ctx.strokeRect(this.camera.x * sx, this.camera.y * sy, this.camera.viewW * sx, this.camera.viewH * sy);
  }
}

function kindOrder(unit: Unit): number {
  if (unit.kind === 'base') return 0;
  if (unit.kind === 'tower') return 1;
  if (!unit.alive) return 2;
  if (unit.kind === 'minion') return 3;
  return 4;
}

function drawBar(ctx: CanvasRenderingContext2D, unit: Unit): void {
  const w = unit.kind === 'base' ? 64 : unit.kind === 'champion' ? 48 : 30;
  const x = unit.x - w / 2;
  const y = unit.y - unit.radius - (unit.kind === 'champion' || unit.kind === 'base' ? 22 : 14);
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(x - 1, y - 1, w + 2, 6);
  ctx.fillStyle = unit.team === 'ally' ? '#86c378' : '#d25a4c';
  ctx.fillRect(x, y, w * Math.max(0, Math.min(1, unit.hp / unit.maxHp)), 4);
  if (unit.kind === 'champion' || unit.kind === 'base') {
    ctx.fillStyle = '#f0e2bc';
    ctx.font = '12px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText(unit.name, unit.x, y - 4);
  }
}

function drawFire(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f6e2a8';
  ctx.beginPath();
  ctx.arc(x, y + 1, r * 0.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function ink(unit: Unit, color: string): string {
  return unit.hitFlash > 0 ? '#f7f4ef' : color;
}

function drawSprite(ctx: CanvasRenderingContext2D, unit: Unit, time: number): void {
  switch (unit.defId) {
    case 'barbarian':
      drawBarbarian(ctx, unit);
      break;
    case 'blood-raven':
      drawRaven(ctx, unit, time);
      break;
    case 'fallen':
      drawFallen(ctx, unit);
      break;
    case 'zombie':
      drawZombie(ctx, unit);
      break;
    case 'rogue':
      drawRogue(ctx, unit, false);
      break;
    case 'rogue-archer':
      drawRogue(ctx, unit, true);
      break;
    case 'tower':
      drawTower(ctx, unit);
      break;
    case 'base-ally':
      drawCamp(ctx, unit);
      break;
    case 'base-enemy':
      drawAltar(ctx, unit, time);
      break;
    default:
      ctx.fillStyle = ink(unit, unit.color);
      ctx.beginPath();
      ctx.arc(0, 0, unit.radius, 0, Math.PI * 2);
      ctx.fill();
      break;
  }
}

function drawBarbarian(ctx: CanvasRenderingContext2D, unit: Unit): void {
  const swing = unit.swing;
  ctx.fillStyle = ink(unit, '#6b4228');
  ctx.beginPath();
  ctx.ellipse(-2, 1, 16, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ink(unit, '#6e2a22');
  ctx.beginPath();
  ctx.ellipse(2, 0, 11, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#e6d3a1';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(2, 1, 7, 0.3, Math.PI - 0.2);
  ctx.stroke();
  ctx.fillStyle = ink(unit, '#c48a62');
  ctx.beginPath();
  ctx.arc(10, -1, 6.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ink(unit, '#c5ccd6');
  ctx.beginPath();
  ctx.arc(10, -2, 7, Math.PI * 1.08, Math.PI * 1.92);
  ctx.fill();
  ctx.fillStyle = ink(unit, '#f0e2bc');
  ctx.beginPath();
  ctx.moveTo(6, -6);
  ctx.lineTo(1, -16);
  ctx.lineTo(10, -6);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(14, -6);
  ctx.lineTo(20, -15);
  ctx.lineTo(15, -5);
  ctx.fill();
  ctx.save();
  ctx.translate(2, 8);
  ctx.rotate(-0.7 + swing * 2.5);
  ctx.strokeStyle = '#6b4428';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(20, 0);
  ctx.stroke();
  ctx.fillStyle = ink(unit, '#d5dbe4');
  ctx.beginPath();
  ctx.moveTo(14, -2);
  ctx.lineTo(28, -8);
  ctx.lineTo(26, 6);
  ctx.lineTo(14, 3);
  ctx.fill();
  ctx.restore();
}

function drawRaven(ctx: CanvasRenderingContext2D, unit: Unit, time: number): void {
  ctx.fillStyle = ink(unit, '#4a1520');
  ctx.beginPath();
  ctx.ellipse(-2, 2, 14, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ink(unit, '#6e2430');
  ctx.beginPath();
  ctx.moveTo(12, 2);
  ctx.lineTo(2, -12);
  ctx.lineTo(-8, 2);
  ctx.fill();
  ctx.fillStyle = ink(unit, '#e6d3c4');
  ctx.beginPath();
  ctx.arc(8, 0, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#e0c07a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(14, 6, 9, -0.8 + Math.sin(time * 6) * 0.1, 0.9);
  ctx.stroke();
}

function drawFallen(ctx: CanvasRenderingContext2D, unit: Unit): void {
  ctx.fillStyle = ink(unit, '#8d1d24');
  ctx.beginPath();
  ctx.ellipse(-1, 2, 10, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ink(unit, '#e07a3a');
  ctx.beginPath();
  ctx.arc(7, 0, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ink(unit, '#f0d0a0');
  ctx.beginPath();
  ctx.moveTo(4, -3);
  ctx.lineTo(2, -10);
  ctx.lineTo(7, -3);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(9, -3);
  ctx.lineTo(13, -10);
  ctx.lineTo(11, -2);
  ctx.fill();
  ctx.strokeStyle = '#5a2a18';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(4, 6);
  ctx.lineTo(16, 10);
  ctx.stroke();
}

function drawZombie(ctx: CanvasRenderingContext2D, unit: Unit): void {
  ctx.fillStyle = ink(unit, '#4e6848');
  ctx.beginPath();
  ctx.ellipse(-2, 3, 14, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ink(unit, '#6d8a5e');
  ctx.beginPath();
  ctx.arc(8, 1, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = ink(unit, '#8eae7c');
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(6, 4);
  ctx.lineTo(18, 8);
  ctx.stroke();
}

function drawRogue(ctx: CanvasRenderingContext2D, unit: Unit, archer: boolean): void {
  ctx.fillStyle = ink(unit, archer ? '#31485e' : '#3e5e78');
  ctx.beginPath();
  ctx.ellipse(0, 2, 11, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ink(unit, '#243646');
  ctx.beginPath();
  ctx.moveTo(10, 1);
  ctx.lineTo(2, -11);
  ctx.lineTo(-6, 1);
  ctx.fill();
  ctx.fillStyle = '#e6d3a1';
  ctx.fillRect(8, -2, 3, 3);
  if (archer) {
    ctx.strokeStyle = '#e6d3a1';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(12, 2, 8, -1, 1);
    ctx.stroke();
  } else {
    ctx.strokeStyle = '#d7dde6';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(6, 6);
    ctx.lineTo(18, -2);
    ctx.stroke();
  }
}

function drawTower(ctx: CanvasRenderingContext2D, unit: Unit): void {
  const r = unit.radius;
  if (!unit.alive) {
    ctx.fillStyle = '#4a453e';
    ctx.fillRect(-r * 0.7, -r * 0.2, r * 1.5, r * 0.7);
    ctx.fillStyle = '#3a342c';
    ctx.beginPath();
    ctx.moveTo(-r, 4);
    ctx.lineTo(0, -r * 0.4);
    ctx.lineTo(r * 0.8, 8);
    ctx.fill();
    return;
  }
  ctx.fillStyle = '#5c574f';
  roundRect(ctx, -r, -r * 0.15, r * 2, r * 1.25, 3);
  ctx.fill();
  ctx.fillStyle = '#7d786e';
  ctx.fillRect(-r * 0.72, -r * 1.15, r * 1.44, r);
  ctx.fillStyle = '#3e3a34';
  for (let i = -2; i <= 2; i++) {
    ctx.fillRect(i * r * 0.28 - 2, -r * 1.28, 5, 8);
  }
  ctx.strokeStyle = '#2a241c';
  ctx.beginPath();
  ctx.moveTo(r * 0.2, -r * 1.3);
  ctx.lineTo(r * 0.2, -r * 1.85);
  ctx.stroke();
  ctx.fillStyle = unit.team === 'ally' ? '#d4b46a' : '#c44536';
  ctx.beginPath();
  ctx.moveTo(r * 0.2, -r * 1.8);
  ctx.lineTo(r * 0.95, -r * 1.55);
  ctx.lineTo(r * 0.2, -r * 1.35);
  ctx.fill();
}

function drawCamp(ctx: CanvasRenderingContext2D, unit: Unit): void {
  const r = unit.radius;
  ctx.fillStyle = unit.alive ? '#6a5038' : '#3a3028';
  roundRect(ctx, -r, -r * 0.7, r * 2, r * 1.5, 6);
  ctx.fill();
  ctx.fillStyle = unit.alive ? '#8d6844' : '#4a4036';
  ctx.beginPath();
  ctx.moveTo(-r - 6, -r * 0.2);
  ctx.lineTo(0, -r * 1.35);
  ctx.lineTo(r + 6, -r * 0.2);
  ctx.fill();
  ctx.fillStyle = unit.alive ? '#d4b46a' : '#666';
  ctx.fillRect(-4, -r * 1.55, 8, r * 0.55);
  ctx.beginPath();
  ctx.moveTo(0, -r * 1.7);
  ctx.lineTo(22, -r * 1.25);
  ctx.lineTo(0, -r * 1.05);
  ctx.fill();
  ctx.strokeStyle = '#e6d3a1';
  ctx.lineWidth = 2;
  ctx.strokeRect(-r + 8, -4, 16, 18);
}

function drawAltar(ctx: CanvasRenderingContext2D, unit: Unit, time: number): void {
  const r = unit.radius;
  ctx.fillStyle = unit.alive ? '#2a2420' : '#1a1614';
  ctx.beginPath();
  ctx.ellipse(0, 8, r * 1.15, r * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = unit.alive ? '#3a332c' : '#2a2622';
  roundRect(ctx, -r * 0.7, -r * 0.85, r * 1.4, r * 1.2, 4);
  ctx.fill();
  ctx.fillStyle = unit.alive ? '#c44536' : '#553';
  ctx.globalAlpha = unit.alive ? 0.85 + Math.sin(time * 4) * 0.15 : 0.4;
  ctx.beginPath();
  ctx.arc(0, -4, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#e8d7b0';
  ctx.beginPath();
  ctx.moveTo(-16, -r * 0.2);
  ctx.lineTo(-28, -r * 1.1);
  ctx.lineTo(-6, -r * 0.35);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(16, -r * 0.2);
  ctx.lineTo(28, -r * 1.1);
  ctx.lineTo(6, -r * 0.35);
  ctx.fill();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function paintMap(ctx: CanvasRenderingContext2D, map: ActDef, props: Prop[]): void {
  ctx.fillStyle = map.theme.groundDeep;
  ctx.fillRect(0, 0, map.width, map.height);
  const rng = new Rng(99);
  for (let i = 0; i < 2200; i++) {
    ctx.fillStyle = rng.next() > 0.5 ? '#221c17' : '#181410';
    ctx.fillRect(rng.range(0, map.width), rng.range(0, map.height), rng.range(2, 7), rng.range(2, 5));
  }
  ctx.fillStyle = map.theme.shoulder;
  for (const base of [map.playerBase, map.enemyBase]) {
    ctx.beginPath();
    ctx.arc(base.x, base.y, map.plaza, 0, Math.PI * 2);
    ctx.fill();
  }
  traceLane(ctx, map.lane);
  ctx.strokeStyle = map.theme.shoulder;
  ctx.lineWidth = map.laneWidth + map.jungle * 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.strokeStyle = map.theme.roadEdge;
  ctx.lineWidth = map.laneWidth + 28;
  ctx.stroke();
  ctx.strokeStyle = map.theme.road;
  ctx.lineWidth = map.laneWidth;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(214, 176, 120, 0.28)';
  ctx.lineWidth = 10;
  ctx.stroke();

  const stain = ctx.createLinearGradient(map.width * 0.35, 0, map.width * 0.7, 0);
  stain.addColorStop(0, 'rgba(90, 20, 18, 0)');
  stain.addColorStop(0.5, 'rgba(90, 20, 18, 0.28)');
  stain.addColorStop(1, 'rgba(20, 40, 28, 0.05)');
  ctx.strokeStyle = stain;
  ctx.lineWidth = map.laneWidth * 0.7;
  ctx.stroke();

  for (const prop of props) drawProp(ctx, prop);

  ctx.fillStyle = 'rgba(80, 140, 90, 0.08)';
  ctx.beginPath();
  ctx.arc(map.playerBase.x, map.playerBase.y, map.plaza * 0.95, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(40, 80, 50, 0.16)';
  ctx.beginPath();
  ctx.arc(map.enemyBase.x, map.enemyBase.y, map.plaza, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(230, 211, 161, 0.85)';
  ctx.font = '42px Georgia, serif';
  ctx.textAlign = 'left';
  ctx.fillText('Rogue Encampment', map.playerBase.x - 20, map.playerBase.y - map.plaza + 36);
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(214, 150, 140, 0.9)';
  ctx.fillText('Catacombs', map.enemyBase.x + 10, map.enemyBase.y - map.plaza + 40);
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(180, 60, 48, 0.55)';
  ctx.font = '36px Georgia, serif';
  ctx.fillText('Blood Moor', map.width / 2, 180);
}

function traceLane(ctx: CanvasRenderingContext2D, lane: Vec[]): void {
  ctx.beginPath();
  lane.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
}

function buildProps(map: ActDef): Prop[] {
  const rng = new Rng(0xa11);
  const props: Prop[] = [];
  for (let i = 0; i < 90; i++) {
    const x = rng.range(30, map.width - 30);
    const y = rng.range(30, map.height - 30);
    const road = distToPolyline({ x, y }, map.lane);
    if (road < map.laneWidth * 0.48) continue;
    if (Math.hypot(x - map.playerBase.x, y - map.playerBase.y) < map.plaza * 0.72) continue;
    if (Math.hypot(x - map.enemyBase.x, y - map.enemyBase.y) < map.plaza * 0.72) continue;
    const shoulder = road < map.laneWidth / 2 + map.jungle;
    const roll = rng.next();
    const prop: Prop = {
      kind: 'tree',
      x,
      y,
      s: rng.range(0.75, 1.35),
      rot: rng.range(0, Math.PI * 2),
    };
    if (shoulder) {
      prop.kind = roll < 0.45 ? 'stump' : roll < 0.75 ? 'rock' : 'grave';
      prop.s *= 0.8;
    } else if (x > map.width * 0.62) {
      prop.kind = roll < 0.4 ? 'dead' : roll < 0.7 ? 'bone' : 'pillar';
    } else if (roll < 0.55) prop.kind = 'tree';
    else if (roll < 0.75) prop.kind = 'dead';
    else if (roll < 0.9) prop.kind = 'rock';
    else prop.kind = 'grave';
    props.push(prop);
  }
  const camp = map.playerBase;
  props.push(
    { kind: 'tent', x: camp.x + 120, y: camp.y - 150, s: 1.1, rot: 0.2 },
    { kind: 'tent', x: camp.x - 30, y: camp.y - 160, s: 0.9, rot: -0.3 },
    { kind: 'cart', x: camp.x + 150, y: camp.y + 120, s: 1, rot: 0.4 },
  );
  const lair = map.enemyBase;
  props.push(
    { kind: 'pillar', x: lair.x - 150, y: lair.y - 130, s: 1.2, rot: 0 },
    { kind: 'pillar', x: lair.x - 180, y: lair.y + 110, s: 1.1, rot: 0 },
    { kind: 'bone', x: lair.x + 40, y: lair.y + 140, s: 1.3, rot: 1 },
    { kind: 'bone', x: lair.x - 40, y: lair.y + 150, s: 1, rot: 2 },
  );
  return props;
}

function drawProp(ctx: CanvasRenderingContext2D, prop: Prop): void {
  ctx.save();
  ctx.translate(prop.x, prop.y);
  ctx.rotate(prop.rot);
  const s = prop.s;
  if (prop.kind === 'tree' || prop.kind === 'dead') {
    ctx.fillStyle = '#2c241c';
    ctx.fillRect(-3 * s, -2 * s, 6 * s, 18 * s);
    ctx.fillStyle = prop.kind === 'dead' ? '#5a564c' : '#1c3828';
    ctx.beginPath();
    ctx.moveTo(0, -48 * s);
    ctx.lineTo(18 * s, -4 * s);
    ctx.lineTo(-18 * s, -4 * s);
    ctx.fill();
    if (prop.kind === 'tree') {
      ctx.fillStyle = '#244433';
      ctx.beginPath();
      ctx.arc(-6 * s, -24 * s, 12 * s, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (prop.kind === 'rock' || prop.kind === 'stump') {
    ctx.fillStyle = prop.kind === 'stump' ? '#3a2c22' : '#4a463e';
    ctx.beginPath();
    ctx.ellipse(0, 0, 14 * s, 9 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (prop.kind === 'grave') {
    ctx.fillStyle = '#6a645c';
    roundRect(ctx, -7 * s, -16 * s, 14 * s, 22 * s, 6 * s);
    ctx.fill();
  } else if (prop.kind === 'bone') {
    ctx.strokeStyle = '#d9d0c0';
    ctx.lineWidth = 3 * s;
    ctx.beginPath();
    ctx.moveTo(-8 * s, 4 * s);
    ctx.lineTo(8 * s, -6 * s);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-6 * s, -6 * s);
    ctx.lineTo(6 * s, 6 * s);
    ctx.stroke();
  } else if (prop.kind === 'tent') {
    ctx.fillStyle = '#6e2e2a';
    ctx.beginPath();
    ctx.moveTo(0, -28 * s);
    ctx.lineTo(26 * s, 10 * s);
    ctx.lineTo(-26 * s, 10 * s);
    ctx.fill();
    ctx.fillStyle = '#e6d3a1';
    ctx.fillRect(-3 * s, -6 * s, 6 * s, 16 * s);
  } else if (prop.kind === 'cart') {
    ctx.fillStyle = '#5a3a28';
    ctx.fillRect(-16 * s, -8 * s, 32 * s, 14 * s);
    ctx.fillStyle = '#2a241c';
    ctx.beginPath();
    ctx.arc(-10 * s, 8 * s, 5 * s, 0, Math.PI * 2);
    ctx.arc(10 * s, 8 * s, 5 * s, 0, Math.PI * 2);
    ctx.fill();
  } else if (prop.kind === 'pillar') {
    ctx.fillStyle = '#4e564e';
    ctx.fillRect(-6 * s, -28 * s, 12 * s, 40 * s);
    ctx.fillRect(-10 * s, -32 * s, 20 * s, 6 * s);
  }
  ctx.restore();
}
