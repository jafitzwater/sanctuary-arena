import { attackProfile } from './combat/attackCycle';
import { commitStickGait, stepStickGait, type StickGaitMemory } from './gait';
import { screenVectorToWorld } from './iso';
import { getAutoTarget, MobileInputManager, skillAimKind, skillReach } from './mobileInput';
import { byId, inRange, player } from './query';
import type { FrameInput, Sim } from './types';
import type { Vec } from './math';

const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
const STICK_LOG = params?.get('sticklog') === '1';
const AIM_LOG = params?.get('aimlog') === '1';
/** Delayed iOS mouse events arrive after touchend. Ignore them for this long. */
const SYNTHETIC_CLICK_MS = 700;
const STICK_BLOCK =
  'button, a, input, textarea, select, #topbar, #minimap, #minimap-toggle, #gold-badge, #belt, #potions, #shop, #tree, #help, #title, #end, #quick-buy';

interface InputHooks {
  getSim: () => Sim | null;
  getWorld: (sx: number, sy: number) => Vec;
  isPlaying: () => boolean;
  toggleShop: () => void;
  toggleTree: () => void;
  openTree: (slot: number) => void;
  closeOverlays: () => void;
}

interface AimCast {
  slot: number;
  id: string;
  mode: 'tap' | 'aim';
  clientX: number;
  clientY: number;
  worldX: number;
  worldY: number;
}

/**
 * Mouse, keyboard, and touch. The stick floats under a left-half finger.
 * Attack and skills are pointer-driven and do not capture the pointer, so a
 * second finger can hold a button while the stick is down.
 */
export class InputController {
  moveX = 0;
  moveY = 0;
  attack = false;
  targetId: number | null = null;
  autoTargetId: number | null = null;
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
  private attackPointer = false;
  private attackPointerId: number | null = null;
  private pointerX = 0;
  private pointerY = 0;
  private pointerSeen = false;
  private stickPointerId: number | null = null;
  private stickEngaged = false;
  private stickReleasedAt = 0;
  private ignoredMoves = 0;
  private lastSnap = 0;
  private stickMemory: StickGaitMemory = { gait: 'idle', hold: null, holdMs: 0 };
  private readonly mobile = new MobileInputManager();
  private pinnedAim: Vec | null = null;
  private castFocus = false;
  private aimCast: AimCast | null = null;
  private aimCanceled = false;

  constructor(
    private canvas: HTMLCanvasElement,
    private hooks: InputHooks,
  ) {}

  attach(): void {
    const stick = document.querySelector<HTMLElement>('#stick');
    const knob = document.querySelector<HTMLElement>('#stick-knob');
    const attack = document.querySelector<HTMLElement>('#attack-btn');
    if (!stick || !knob || !attack) throw new Error('Controls are missing from the page');

    if (AIM_LOG) {
      (globalThis as { getAutoTarget?: typeof getAutoTarget }).getAutoTarget = getAutoTarget;
    }

    window.addEventListener('keydown', (event) => this.onKeyDown(event));
    window.addEventListener('keyup', (event) => {
      this.keys.delete(event.code);
    });
    window.addEventListener('blur', () => this.releaseAll(knob, stick));
    window.addEventListener('pointermove', (event) => {
      if (this.mobile.trackingSkill(event.pointerId)) {
        const show = this.mobile.moveSkill(event.pointerId, event.clientX, event.clientY);
        this.paintCursor(show, event.clientX, event.clientY);
        return;
      }
      if (this.mobile.ownsPointer(event.pointerId)) {
        this.mobile.moveStick(event.clientX, event.clientY);
        this.paintStick(stick, knob);
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target?.closest('#stick, #cluster, #topbar, #shop, #help, #tree, #minimap, #minimap-toggle')) return;
      this.pointerX = event.clientX;
      this.pointerY = event.clientY;
      this.pointerSeen = true;
    });
    window.addEventListener('pointerup', (event) => {
      this.finishSkill(event);
      this.finishAttack(event);
      if (this.mobile.ownsPointer(event.pointerId)) this.releaseStick(knob, stick);
    });
    window.addEventListener('pointercancel', (event) => {
      this.finishSkill(event);
      this.finishAttack(event);
      if (this.mobile.ownsPointer(event.pointerId)) this.releaseStick(knob, stick);
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
    this.installStickTouch(stick, knob);

    document.addEventListener(
      'pointerdown',
      (event) => {
        if (!this.hooks.isPlaying()) return;
        const target = event.target as HTMLElement | null;
        if (target?.closest('.plus, [data-upgrade]')) return;
        const skill = target?.closest<HTMLElement>('.skill');
        if (!skill?.dataset.cast) return;
        if (skill.classList.contains('arming')) return;
        const slot = Number(skill.dataset.slot ?? -1);
        if (slot < 0 || slot > 3) return;
        this.mobile.beginSkill(event.pointerId, slot, event.clientX, event.clientY);
        event.preventDefault();
        event.stopPropagation();
      },
      true,
    );

    stick.addEventListener('pointerdown', (event) => {
      if (!this.hooks.isPlaying()) return;
      if (event.pointerType === 'touch') {
        event.preventDefault();
        return;
      }
      this.stickPointerId = event.pointerId;
      try {
        stick.setPointerCapture(event.pointerId);
      } catch {
        /* the stick is a visual; tracking does not need capture */
      }
      this.anchorStick(event.clientX, event.clientY, { pointer: event.pointerId }, stick, knob);
      event.preventDefault();
    });
    stick.addEventListener('pointermove', (event) => {
      if (event.pointerId !== this.stickPointerId) return;
      if (event.pointerType === 'touch' && this.mobile.touchId != null) return;
      this.mobile.moveStick(event.clientX, event.clientY);
      this.paintStick(stick, knob);
    });
    const endStick = (event: PointerEvent) => {
      if (event.pointerId !== this.stickPointerId) return;
      if (event.pointerType === 'touch' && this.mobile.touchId != null) return;
      this.releaseStick(knob, stick);
    };
    stick.addEventListener('pointerup', endStick);
    stick.addEventListener('pointercancel', endStick);

    attack.addEventListener('pointerdown', (event) => {
      if (!this.hooks.isPlaying()) return;
      this.attackPointer = true;
      this.attackPointerId = event.pointerId;
      event.preventDefault();
    });
    attack.addEventListener('pointerup', (event) => this.finishAttack(event));
    attack.addEventListener('pointercancel', (event) => this.finishAttack(event));
    attack.addEventListener('lostpointercapture', (event) => this.finishAttack(event));

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
    const move = this.mobile.moveVector;
    let sx = this.mobile.engaged ? move.x : 0;
    let sy = this.mobile.engaged ? move.y : 0;
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
    const command = this.mobile.command(this.attackPointer || this.keys.has('Space'));
    this.attack = command.attackTriggered;
    this.stickEngaged = this.mobile.engaged;

    const rect = this.canvas.getBoundingClientRect();
    if (this.pinnedAim) {
      this.aimX = this.pinnedAim.x;
      this.aimY = this.pinnedAim.y;
    } else {
      const aim = this.hooks.getWorld(this.pointerX - rect.left, this.pointerY - rect.top);
      this.aimX = aim.x;
      this.aimY = aim.y;
    }

    if (sim) {
      const hero = player(sim);
      const profile = attackProfile(hero.attackInterval, hero.attackRange);
      const auto = getAutoTarget(sim.units, hero, profile.range);
      this.autoTargetId = auto?.id ?? null;
      if (this.targetId != null && !this.castFocus) {
        const target = byId(sim, this.targetId);
        if (!target || !target.alive || target.team === hero.team) this.targetId = null;
      }
      if (this.stickEngaged) this.dest = null;
      if (direct) {
        this.dest = null;
        if (this.targetId != null && !this.attack && !this.castFocus) {
          const target = byId(sim, this.targetId);
          if (!target || !inRange(hero, target)) this.targetId = null;
        }
      } else if (this.dest && Math.hypot(hero.x - this.dest.x, hero.y - this.dest.y) < 20) {
        this.dest = null;
      }
      if (this.attack && !this.castFocus) {
        this.targetId = auto ? auto.id : null;
      }
      if (!this.pointerSeen && !this.pinnedAim) {
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
        attack: this.attack,
        anchorX: this.mobile.anchorX,
        anchorY: this.mobile.anchorY,
        radius: this.mobile.zone.maxRadius,
      };
    }
    if (AIM_LOG) {
      (globalThis as { __aim?: unknown }).__aim = {
        cursor: document.querySelector('#aim-cursor')?.classList.contains('on') ?? false,
        cast: this.aimCast,
        canceled: this.aimCanceled,
        autoTargetId: this.autoTargetId,
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
    this.pinnedAim = null;
    if (this.castFocus) {
      this.targetId = null;
      this.castFocus = false;
    }
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
        else this.castSkill(sim, id, 'tap', 0, 0);
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
    if (event.pointerType === 'touch' && !this.mobile.engaged && this.canFloatStick(event.clientX, event.clientY, event.target)) {
      const stick = document.querySelector<HTMLElement>('#stick');
      const knob = document.querySelector<HTMLElement>('#stick-knob');
      if (stick && knob) this.anchorStick(event.clientX, event.clientY, { pointer: event.pointerId }, stick, knob);
      this.dest = null;
      this.ignoredMoves += 1;
      event.preventDefault();
      return;
    }
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

  private canFloatStick(x: number, y: number, target: EventTarget | null): boolean {
    if (x >= window.innerWidth / 2) return false;
    const el = target instanceof Element ? target : null;
    if (el?.closest(STICK_BLOCK)) return false;
    if (this.covers(x, y, '#minimap-toggle') || this.covers(x, y, '#gold-badge')) return false;
    return true;
  }

  /** The map and gold badge sit on the left. A stick must not anchor underneath them. */
  private covers(x: number, y: number, selector: string): boolean {
    const node = document.querySelector(selector);
    if (!(node instanceof HTMLElement) || node.hidden) return false;
    const rect = node.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return false;
    return x >= rect.left - 4 && x <= rect.right + 4 && y >= rect.top - 4 && y <= rect.bottom + 4;
  }

  private anchorStick(
    clientX: number,
    clientY: number,
    id: { touch?: number; pointer?: number },
    stick: HTMLElement,
    knob: HTMLElement,
  ): void {
    const started = this.mobile.beginStick(clientX, clientY, id);
    if (!started && !this.mobile.engaged) return;
    this.stickPointerId = this.mobile.pointerId;
    this.stickEngaged = this.mobile.engaged;
    this.dest = null;
    this.paintStick(stick, knob);
  }

  private paintStick(stick: HTMLElement, knob: HTMLElement): void {
    const radius = this.mobile.zone.maxRadius;
    stick.style.left = `${this.mobile.anchorX - radius}px`;
    stick.style.top = `${this.mobile.anchorY - radius}px`;
    stick.classList.toggle('on', this.mobile.engaged);
    const move = this.mobile.moveVector;
    knob.style.transform = `translate(${move.x * radius}px, ${move.y * radius}px)`;
  }

  private releaseStick(knob: HTMLElement, stick: HTMLElement): void {
    const was = this.mobile.engaged;
    this.mobile.endStick();
    this.stickEngaged = false;
    this.stickPointerId = null;
    knob.style.transform = 'translate(0px, 0px)';
    stick.classList.remove('on');
    if (was) this.stickReleasedAt = performance.now();
  }

  private finishAttack(event: PointerEvent): void {
    if (this.attackPointerId == null || event.pointerId !== this.attackPointerId) return;
    this.attackPointer = false;
    this.attackPointerId = null;
  }

  private finishSkill(event: PointerEvent): void {
    if (!this.mobile.trackingSkill(event.pointerId)) return;
    const target = document.elementFromPoint(event.clientX, event.clientY);
    const over = !!target?.closest('.skill');
    const gesture = this.mobile.endSkill(event.pointerId, event.clientX, event.clientY, over);
    this.paintCursor(false, event.clientX, event.clientY);
    if (!gesture) return;
    if (gesture.mode === 'cancel') {
      this.aimCanceled = true;
      this.aimCast = null;
      return;
    }
    const sim = this.hooks.getSim();
    const id = sim?.belt[gesture.slot] ?? '';
    if (!sim || !id) return;
    this.castSkill(sim, id, gesture.mode, gesture.x, gesture.y);
  }

  private castSkill(sim: Sim, id: string, mode: 'tap' | 'aim', clientX: number, clientY: number): void {
    const hero = player(sim);
    const rect = this.canvas.getBoundingClientRect();
    const world = this.hooks.getWorld(clientX - rect.left, clientY - rect.top);
    const kind = skillAimKind(id);
    this.aimCanceled = false;
    if (mode === 'aim') {
      this.pinnedAim = world;
      this.aimX = world.x;
      this.aimY = world.y;
    } else if (kind === 'ground') {
      this.pinnedAim = { x: hero.x, y: hero.y };
      this.aimX = hero.x;
      this.aimY = hero.y;
    } else if (!this.pointerSeen) {
      this.pinnedAim = {
        x: hero.x + Math.cos(hero.facing) * 200,
        y: hero.y + Math.sin(hero.facing) * 200,
      };
    }
    if (kind === 'single') {
      const reach = skillReach(id, attackProfile(hero.attackInterval, hero.attackRange).range);
      const focus =
        mode === 'aim' ? (enemyNear(sim, world.x, world.y, 36) ?? getAutoTarget(sim.units, hero, reach)) : getAutoTarget(sim.units, hero, reach);
      if (focus && Math.hypot(focus.x - hero.x, focus.y - hero.y) <= reach + focus.radius) {
        this.targetId = focus.id;
        this.castFocus = true;
      }
    }
    this.cast = id;
    this.aimCast = {
      slot: sim.belt.indexOf(id),
      id,
      mode,
      clientX,
      clientY,
      worldX: this.pinnedAim?.x ?? this.aimX,
      worldY: this.pinnedAim?.y ?? this.aimY,
    };
  }

  private paintCursor(on: boolean, x: number, y: number): void {
    const cursor = document.querySelector<HTMLElement>('#aim-cursor');
    if (!cursor) return;
    cursor.classList.toggle('on', on);
    if (!on) return;
    cursor.style.left = `${x}px`;
    cursor.style.top = `${y}px`;
  }

  private blocksMove(event: PointerEvent): boolean {
    if (this.mobile.engaged || this.stickEngaged) return true;
    if (this.stickPointerId != null && event.pointerId === this.stickPointerId) return true;
    return this.syntheticMouse(event);
  }

  private syntheticMouse(event: Event): boolean {
    if (this.mobile.engaged || this.stickEngaged) return true;
    const pointer = event instanceof PointerEvent ? event.pointerType : 'mouse';
    if (pointer === 'touch') return false;
    return performance.now() - this.stickReleasedAt < SYNTHETIC_CLICK_MS;
  }

  /** Touch listeners cancel the mouse compatibility events iOS fires under the thumb. */
  private installStickTouch(stick: HTMLElement, knob: HTMLElement): void {
    document.addEventListener('touchstart', (event) => this.onStickTouchStart(event, stick, knob), {
      passive: false,
      capture: true,
    });
    document.addEventListener('touchmove', (event) => this.onStickTouchMove(event, stick, knob), {
      passive: false,
      capture: true,
    });
    document.addEventListener('touchend', (event) => this.onStickTouchEnd(event, stick, knob), {
      passive: false,
      capture: true,
    });
    document.addEventListener('touchcancel', (event) => this.onStickTouchEnd(event, stick, knob), {
      passive: false,
      capture: true,
    });
  }

  private onStickTouchStart(event: TouchEvent, stick: HTMLElement, knob: HTMLElement): void {
    if (!this.hooks.isPlaying()) return;
    for (const touch of event.changedTouches) {
      const target = touch.target instanceof Element ? touch.target : null;
      if (!this.canFloatStick(touch.clientX, touch.clientY, target)) continue;
      const started = this.mobile.beginStick(touch.clientX, touch.clientY, { touch: touch.identifier });
      if (!started && !this.mobile.ownsTouch(touch.identifier)) continue;
      this.stickEngaged = this.mobile.engaged;
      this.dest = null;
      this.paintStick(stick, knob);
      event.preventDefault();
      return;
    }
  }

  private onStickTouchMove(event: TouchEvent, stick: HTMLElement, knob: HTMLElement): void {
    if (this.mobile.touchId == null) return;
    for (const touch of event.changedTouches) {
      if (!this.mobile.ownsTouch(touch.identifier)) continue;
      event.preventDefault();
      this.mobile.moveStick(touch.clientX, touch.clientY);
      this.paintStick(stick, knob);
      return;
    }
  }

  private onStickTouchEnd(event: TouchEvent, stick: HTMLElement, knob: HTMLElement): void {
    if (this.mobile.touchId == null) return;
    for (const touch of event.changedTouches) {
      if (!this.mobile.ownsTouch(touch.identifier)) continue;
      event.preventDefault();
      this.releaseStick(knob, stick);
      return;
    }
  }

  private releaseAll(knob: HTMLElement, stick: HTMLElement): void {
    this.keys.clear();
    this.attackPointer = false;
    this.attackPointerId = null;
    this.releaseStick(knob, stick);
  }
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
  return enemyNear(sim, x, y, 18);
}

function enemyNear(sim: Sim, x: number, y: number, pad: number): Sim['units'][number] | null {
  let best: Sim['units'][number] | null = null;
  let bestD = Infinity;
  for (const unit of sim.units) {
    if (!unit.alive || unit.team === 'ally') continue;
    const d = Math.hypot(unit.x - x, unit.y - y);
    if (d <= unit.radius + pad && d < bestD) {
      best = unit;
      bestD = d;
    }
  }
  return best;
}
