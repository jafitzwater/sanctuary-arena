import { byId, inRange, player } from './query';
import type { FrameInput, Sim } from './types';
import type { Vec } from './math';

interface InputHooks {
  getSim: () => Sim | null;
  getWorld: (sx: number, sy: number) => Vec;
  isPlaying: () => boolean;
  toggleShop: () => void;
  closeOverlays: () => void;
}

/**
 * Mouse, keyboard, and touch. The virtual stick and the attack button are
 * pointer-driven so they work with a finger or with desktop emulation.
 */
export class InputController {
  moveX = 0;
  moveY = 0;
  attack = false;
  targetId: number | null = null;
  dest: Vec | null = null;
  cast: string | null = null;
  buy: string | null = null;
  potion: 'health' | 'mana' | null = null;
  upgrade: string | null = null;
  aimX = 0;
  aimY = 0;

  private keys = new Set<string>();
  private joyX = 0;
  private joyY = 0;
  private joyActive = false;
  private attackPointer = false;
  private pointerX = 0;
  private pointerY = 0;
  private pointerSeen = false;
  private stickId: number | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    private hooks: InputHooks,
  ) {}

  attach(): void {
    const stick = document.querySelector<HTMLElement>('#stick');
    const knob = document.querySelector<HTMLElement>('#stick-knob');
    const attack = document.querySelector<HTMLElement>('#attack-btn');
    if (!stick || !knob || !attack) throw new Error('Controls are missing from the page');

    window.addEventListener('keydown', (event) => this.onKeyDown(event));
    window.addEventListener('keyup', (event) => {
      this.keys.delete(event.code);
    });
    window.addEventListener('blur', () => this.releaseAll(knob));
    window.addEventListener('pointermove', (event) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('#stick, #cluster, #topbar, #shop, #help, #minimap')) return;
      this.pointerX = event.clientX;
      this.pointerY = event.clientY;
      this.pointerSeen = true;
    });

    this.canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    this.canvas.addEventListener('pointerdown', (event) => this.onCanvasDown(event));

    stick.addEventListener('pointerdown', (event) => {
      if (!this.hooks.isPlaying()) return;
      this.stickId = event.pointerId;
      stick.setPointerCapture(event.pointerId);
      this.moveStick(stick, knob, event);
      event.preventDefault();
    });
    stick.addEventListener('pointermove', (event) => {
      if (event.pointerId !== this.stickId) return;
      this.moveStick(stick, knob, event);
    });
    const endStick = (event: PointerEvent) => {
      if (event.pointerId !== this.stickId) return;
      this.stickId = null;
      this.joyActive = false;
      this.joyX = 0;
      this.joyY = 0;
      knob.style.transform = 'translate(0px, 0px)';
    };
    stick.addEventListener('pointerup', endStick);
    stick.addEventListener('pointercancel', endStick);

    attack.addEventListener('pointerdown', (event) => {
      if (!this.hooks.isPlaying()) return;
      this.attackPointer = true;
      attack.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    const endAttack = () => {
      this.attackPointer = false;
    };
    attack.addEventListener('pointerup', endAttack);
    attack.addEventListener('pointercancel', endAttack);
    attack.addEventListener('lostpointercapture', endAttack);

    document.addEventListener(
      'touchmove',
      (event) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest('#shop, #help, #title, #end')) return;
        event.preventDefault();
      },
      { passive: false },
    );
  }

  snapshot(): FrameInput {
    const sim = this.hooks.getSim();
    let x = this.joyActive ? this.joyX : 0;
    let y = this.joyActive ? this.joyY : 0;
    if (this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('ArrowUp')) y -= 1;
    if (this.keys.has('ArrowDown')) y += 1;
    const mag = Math.hypot(x, y);
    if (mag > 1) {
      x /= mag;
      y /= mag;
    }
    const direct = mag > 0.15;
    this.attack = this.attackPointer || this.keys.has('Space');

    const rect = this.canvas.getBoundingClientRect();
    const aim = this.hooks.getWorld(this.pointerX - rect.left, this.pointerY - rect.top);
    this.aimX = aim.x;
    this.aimY = aim.y;

    if (sim) {
      if (this.targetId != null) {
        const target = byId(sim, this.targetId);
        if (!target || !target.alive || target.team === 'ally') this.targetId = null;
      }
      const hero = player(sim);
      if (direct) {
        this.dest = null;
        if (this.targetId != null && !this.attack) {
          const target = byId(sim, this.targetId);
          if (!target || !inRange(hero, target)) this.targetId = null;
        }
      } else if (this.dest && Math.hypot(hero.x - this.dest.x, hero.y - this.dest.y) < 20) {
        this.dest = null;
      }
      if (!this.pointerSeen) {
        this.aimX = hero.x + Math.cos(hero.facing) * 200;
        this.aimY = hero.y + Math.sin(hero.facing) * 200;
      }
    }

    return {
      moveX: x,
      moveY: y,
      aimX: this.aimX,
      aimY: this.aimY,
      attack: this.attack,
      targetId: this.targetId,
      destX: this.dest?.x ?? null,
      destY: this.dest?.y ?? null,
      cast: this.cast,
      buy: this.buy,
      potion: this.potion,
      upgrade: this.upgrade,
    };
  }

  endFrame(): void {
    this.cast = null;
    this.buy = null;
    this.potion = null;
    this.upgrade = null;
  }

  private onKeyDown(event: KeyboardEvent): void {
    const playing = this.hooks.isPlaying();
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
      event.preventDefault();
    }
    if (event.code === 'Escape') {
      this.hooks.closeOverlays();
      return;
    }
    if (!playing) {
      if (event.key === 'Enter') {
        document.querySelector<HTMLButtonElement>('#play-btn')?.click();
      }
      return;
    }
    if (!event.repeat) {
      const sim = this.hooks.getSim();
      const skill = sim?.classDef.skills.find(
        (entry) => entry.key.toLowerCase() === event.key.toLowerCase() || entry.digit === event.key,
      );
      if (skill) {
        event.preventDefault();
        if (event.shiftKey) this.upgrade = skill.id;
        else this.cast = skill.id;
        return;
      }
      if (event.key === '5') this.potion = 'health';
      if (event.key === '6') this.potion = 'mana';
      if (event.key === 'b' || event.key === 'B') {
        event.preventDefault();
        this.hooks.toggleShop();
        return;
      }
    }
    this.keys.add(event.code);
  }

  private onCanvasDown(event: PointerEvent): void {
    if (!this.hooks.isPlaying()) return;
    if (event.button !== 0 && event.button !== 2) return;
    const rect = this.canvas.getBoundingClientRect();
    const world = this.hooks.getWorld(event.clientX - rect.left, event.clientY - rect.top);
    this.pointerX = event.clientX;
    this.pointerY = event.clientY;
    this.pointerSeen = true;
    const sim = this.hooks.getSim();
    if (!sim) return;
    const hit = pickEnemy(sim, world.x, world.y);
    if (hit) {
      this.targetId = hit.id;
      this.dest = null;
    } else {
      this.targetId = null;
      this.dest = { x: world.x, y: world.y };
    }
    this.hooks.closeOverlays();
    event.preventDefault();
  }

  private moveStick(stick: HTMLElement, knob: HTMLElement, event: PointerEvent): void {
    const rect = stick.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = event.clientX - cx;
    let dy = event.clientY - cy;
    const max = rect.width * 0.34;
    const mag = Math.hypot(dx, dy) || 1;
    const scale = mag > max ? max / mag : 1;
    dx *= scale;
    dy *= scale;
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    this.joyX = dx / max;
    this.joyY = dy / max;
    this.joyActive = true;
  }

  private releaseAll(knob: HTMLElement): void {
    this.keys.clear();
    this.attackPointer = false;
    this.joyActive = false;
    this.joyX = 0;
    this.joyY = 0;
    this.stickId = null;
    knob.style.transform = 'translate(0px, 0px)';
  }
}

function pickEnemy(sim: Sim, x: number, y: number): Sim['units'][number] | null {
  let best: Sim['units'][number] | null = null;
  let bestD = Infinity;
  for (const unit of sim.units) {
    if (!unit.alive || unit.team === 'ally') continue;
    const d = Math.hypot(unit.x - x, unit.y - y);
    if (d <= unit.radius + 18 && d < bestD) {
      best = unit;
      bestD = d;
    }
  }
  return best;
}
