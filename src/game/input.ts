import { commitStickGait, stepStickGait, type StickGaitMemory } from './gait';
import { screenVectorToWorld } from './iso';
import { byId, inRange, player } from './query';
import type { FrameInput, Sim } from './types';
import type { Vec } from './math';

const STICK_LOG =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('sticklog') === '1';
/** Delayed iOS mouse events arrive after touchend. Ignore them for this long. */
const SYNTHETIC_CLICK_MS = 700;

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
  recall = false;
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
  private stickPointerId: number | null = null;
  private stickTouchId: number | null = null;
  private stickEngaged = false;
  private stickReleasedAt = 0;
  private ignoredMoves = 0;
  private lastSnap = 0;
  private stickMemory: StickGaitMemory = { gait: 'idle', hold: null, holdMs: 0 };

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
    this.canvas.addEventListener(
      'click',
      (event) => {
        if (!this.syntheticMouse(event)) return;
        event.preventDefault();
        event.stopPropagation();
      },
      true,
    );
    installZoomLock();
    this.installStickTouch();

    stick.addEventListener('pointerdown', (event) => {
      if (!this.hooks.isPlaying()) return;
      this.stickPointerId = event.pointerId;
      this.stickEngaged = true;
      this.dest = null;
      if (event.pointerType === 'touch') {
        if (this.stickTouchId == null) this.placeStick(event.clientX, event.clientY, stick, knob);
        event.preventDefault();
        return;
      }
      stick.setPointerCapture(event.pointerId);
      this.placeStick(event.clientX, event.clientY, stick, knob);
      event.preventDefault();
    });
    stick.addEventListener('pointermove', (event) => {
      if (event.pointerId !== this.stickPointerId) return;
      if (event.pointerType === 'touch' && this.stickTouchId != null) return;
      this.placeStick(event.clientX, event.clientY, stick, knob);
    });
    const endStick = (event: PointerEvent) => {
      if (event.pointerId !== this.stickPointerId) return;
      if (event.pointerType === 'touch' && this.stickTouchId != null) return;
      this.releaseStick(knob);
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
    const now = performance.now();
    const dtMs = this.lastSnap === 0 ? 0 : Math.min(250, now - this.lastSnap);
    this.lastSnap = now;
    const tilt = Math.hypot(sx, sy);
    this.stickMemory = stepStickGait(this.stickMemory, tilt, dtMs);
    const directing = this.stickMemory.gait !== 'idle';
    commitStickGait(this.stickMemory.gait, directing);
    let x = 0;
    let y = 0;
    if (directing && (sx !== 0 || sy !== 0)) {
      const worldDir = screenVectorToWorld(sx, sy);
      const mag = Math.hypot(worldDir.x, worldDir.y);
      if (mag > 1e-6) {
        x = worldDir.x / mag;
        y = worldDir.y / mag;
      }
    }
    const direct = x !== 0 || y !== 0;
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
      if (this.stickEngaged) this.dest = null;
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

    if (STICK_LOG) {
      (globalThis as { __inputTrace?: unknown }).__inputTrace = {
        tilt,
        gait: this.stickMemory.gait,
        dest: this.dest != null,
        engaged: this.stickEngaged,
        ignoredMoves: this.ignoredMoves,
      };
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
      recall: this.recall,
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
    this.recall = false;
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
      if (event.key === 'g' || event.key === 'G') {
        event.preventDefault();
        this.recall = true;
        return;
      }
    }
    this.keys.add(event.code);
  }

  private onCanvasDown(event: PointerEvent): void {
    if (!this.hooks.isPlaying()) return;
    if (this.blocksMove(event)) {
      this.dest = null;
      this.ignoredMoves += 1;
      event.preventDefault();
      return;
    }
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

  private placeStick(clientX: number, clientY: number, stick: HTMLElement, knob: HTMLElement): void {
    const rect = stick.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const max = rect.width * 0.34;
    const mag = Math.hypot(dx, dy) || 1;
    const scale = mag > max ? max / mag : 1;
    dx *= scale;
    dy *= scale;
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    this.joyX = dx / max;
    this.joyY = dy / max;
    this.joyActive = true;
    this.stickEngaged = true;
    this.dest = null;
  }

  private releaseStick(knob: HTMLElement): void {
    const was = this.stickEngaged || this.joyActive;
    this.stickEngaged = false;
    this.joyActive = false;
    this.joyX = 0;
    this.joyY = 0;
    this.stickTouchId = null;
    this.stickPointerId = null;
    knob.style.transform = 'translate(0px, 0px)';
    if (was) this.stickReleasedAt = performance.now();
  }

  private blocksMove(event: PointerEvent): boolean {
    if (this.stickEngaged) return true;
    if (this.stickPointerId != null && event.pointerId === this.stickPointerId) return true;
    return this.syntheticMouse(event);
  }

  private syntheticMouse(event: Event): boolean {
    if (this.stickEngaged) return true;
    const pointer = event instanceof PointerEvent ? event.pointerType : 'mouse';
    if (pointer === 'touch') return false;
    return performance.now() - this.stickReleasedAt < SYNTHETIC_CLICK_MS;
  }

  /** Touch listeners cancel the mouse compatibility events iOS fires under the thumb. */
  private installStickTouch(): void {
    document.addEventListener('touchstart', this.onStickTouchStart, { passive: false, capture: true });
    document.addEventListener('touchmove', this.onStickTouchMove, { passive: false, capture: true });
    document.addEventListener('touchend', this.onStickTouchEnd, { passive: false, capture: true });
    document.addEventListener('touchcancel', this.onStickTouchEnd, { passive: false, capture: true });
  }

  private onStickTouchStart = (event: TouchEvent): void => {
    if (this.stickTouchId != null || !this.hooks.isPlaying()) return;
    const nodes = stickNodes();
    if (!nodes) return;
    for (const touch of event.changedTouches) {
      const target = touch.target instanceof Element ? touch.target : null;
      if (!target?.closest('#stick')) continue;
      this.stickTouchId = touch.identifier;
      this.stickEngaged = true;
      this.dest = null;
      this.placeStick(touch.clientX, touch.clientY, nodes.stick, nodes.knob);
      event.preventDefault();
      return;
    }
  };

  private onStickTouchMove = (event: TouchEvent): void => {
    if (this.stickTouchId == null) return;
    const nodes = stickNodes();
    for (const touch of event.changedTouches) {
      if (touch.identifier !== this.stickTouchId) continue;
      event.preventDefault();
      if (nodes) this.placeStick(touch.clientX, touch.clientY, nodes.stick, nodes.knob);
      return;
    }
  };

  private onStickTouchEnd = (event: TouchEvent): void => {
    if (this.stickTouchId == null) return;
    for (const touch of event.changedTouches) {
      if (touch.identifier !== this.stickTouchId) continue;
      event.preventDefault();
      const knob = document.querySelector<HTMLElement>('#stick-knob');
      if (knob) this.releaseStick(knob);
      return;
    }
  };

  private releaseAll(knob: HTMLElement): void {
    this.keys.clear();
    this.attackPointer = false;
    this.releaseStick(knob);
  }
}

function stickNodes(): { stick: HTMLElement; knob: HTMLElement } | null {
  const stick = document.querySelector<HTMLElement>('#stick');
  const knob = document.querySelector<HTMLElement>('#stick-knob');
  if (!stick || !knob) return null;
  return { stick, knob };
}

/**
 * iOS Safari and Android Chrome still double-tap zoom while mashing buttons,
 * even when the viewport sets user-scalable=no. Cancel the second tap of a
 * quick pair, pinch, and the legacy iOS gesture events. Pointer handlers for
 * Attack and skills run before touchstart, so those taps still register.
 */
function inScrollingPanel(event: Event): boolean {
  const node = event.target;
  const el = node instanceof Element ? node : node instanceof Node ? node.parentElement : null;
  return !!el?.closest('#shop, #tree, #help, #title, #end');
}

function installZoomLock(): void {
  let lastStart = 0;
  document.addEventListener(
    'touchstart',
    (event) => {
      const now = performance.now();
      const pinch = event.touches.length > 1;
      const doubleTap = now - lastStart < 320;
      lastStart = now;
      if (pinch) {
        event.preventDefault();
        return;
      }
      // Panels must be able to scroll and to accept a second tap. The viewport
      // and touch-action: manipulation already suppress double-tap zoom there.
      if (doubleTap && !inScrollingPanel(event)) event.preventDefault();
    },
    { passive: false, capture: true },
  );
  let lastEnd = 0;
  document.addEventListener(
    'touchend',
    (event) => {
      const now = performance.now();
      const quick = now - lastEnd < 320;
      lastEnd = now;
      if (quick && !inScrollingPanel(event)) event.preventDefault();
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
