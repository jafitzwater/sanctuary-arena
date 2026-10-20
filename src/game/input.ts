import { screenVectorToWorld } from './iso';
import { byId, inRange, player } from './query';
import type { FrameInput, Sim } from './types';
import type { Vec } from './math';

interface InputHooks {
  getSim: () => Sim | null;
  getWorld: (sx: number, sy: number) => Vec;
  isPlaying: () => boolean;
  toggleShop: () => void;
  toggleTree: () => void;
  openTree: (slot: number) => void;
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
  attribute: FrameInput['attribute'] = null;
  assignSkill: string | null = null;
  assignSlot = 0;
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
      if (target?.closest('#stick, #cluster, #topbar, #shop, #help, #tree, #minimap')) return;
      this.pointerX = event.clientX;
      this.pointerY = event.clientY;
      this.pointerSeen = true;
    });

    this.canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    this.canvas.addEventListener('pointerdown', (event) => this.onCanvasDown(event));
    installZoomLock();

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
        if (event.touches.length > 1) {
          event.preventDefault();
          return;
        }
        const target = event.target as HTMLElement | null;
        if (target?.closest('#shop, #help, #tree, #title, #end, #topbar, #belt')) return;
        event.preventDefault();
      },
      { passive: false },
    );
  }

  snapshot(): FrameInput {
    const sim = this.hooks.getSim();
    let sx = this.joyActive ? this.joyX : 0;
    let sy = this.joyActive ? this.joyY : 0;
    if (this.keys.has('ArrowLeft')) sx -= 1;
    if (this.keys.has('ArrowRight')) sx += 1;
    if (this.keys.has('ArrowUp')) sy -= 1;
    if (this.keys.has('ArrowDown')) sy += 1;
    const worldDir = screenVectorToWorld(sx, sy);
    let x = worldDir.x;
    let y = worldDir.y;
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
      attribute: this.attribute,
      assignSkill: this.assignSkill,
      assignSlot: this.assignSlot,
    };
  }

  endFrame(): void {
    this.cast = null;
    this.buy = null;
    this.potion = null;
    this.upgrade = null;
    this.attribute = null;
    this.assignSkill = null;
    this.assignSlot = 0;
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
      const slot = beltSlot(event.key);
      if (slot >= 0 && sim) {
        event.preventDefault();
        const id = sim.belt[slot] ?? '';
        if (!id) {
          this.hooks.openTree(slot);
          return;
        }
        if (event.shiftKey) this.upgrade = id;
        else this.cast = id;
        return;
      }
      if (event.key === '5') this.potion = 'health';
      if (event.key === '6') this.potion = 'mana';
      if (event.key === 't' || event.key === 'T') {
        event.preventDefault();
        this.hooks.toggleTree();
        return;
      }
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
    this.pointerX = event.clientX;
    this.pointerY = event.clientY;
    this.pointerSeen = true;
    this.hooks.closeOverlays();
    event.preventDefault();
    // A finger must not walk the hero. Movement on touch is the joystick only.
    // Mouse and pen still click the ground to move, or click an enemy to chase.
    if (event.pointerType === 'touch') {
      this.dest = null;
      return;
    }
    const world = this.hooks.getWorld(event.clientX - rect.left, event.clientY - rect.top);
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

/**
 * iOS Safari and Android Chrome still double-tap zoom while mashing buttons,
 * even when the viewport sets user-scalable=no. Cancel the second tap of a
 * quick pair, pinch, and the legacy iOS gesture events. Pointer handlers for
 * Attack and skills run before touchstart, so those taps still register.
 */
function installZoomLock(): void {
  let lastStart = 0;
  document.addEventListener(
    'touchstart',
    (event) => {
      const now = performance.now();
      if (event.touches.length > 1 || now - lastStart < 320) event.preventDefault();
      lastStart = now;
    },
    { passive: false, capture: true },
  );
  let lastEnd = 0;
  document.addEventListener(
    'touchend',
    (event) => {
      const now = performance.now();
      if (now - lastEnd < 320) event.preventDefault();
      lastEnd = now;
    },
    { passive: false, capture: true },
  );
  document.addEventListener('dblclick', (event) => event.preventDefault(), { capture: true });
  for (const name of ['gesturestart', 'gesturechange', 'gestureend', 'gesturemove']) {
    document.addEventListener(name, (event) => event.preventDefault(), { passive: false, capture: true });
  }
}

const BELT_KEYS = ['q', 'w', 'e', 'r', '1', '2', '3', '4'];

function beltSlot(key: string): number {
  const index = BELT_KEYS.indexOf(key.toLowerCase());
  return index < 0 ? -1 : index % 4;
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
