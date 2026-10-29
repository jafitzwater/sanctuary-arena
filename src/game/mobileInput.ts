/**
 * Touch aiming for the thumb fan. Ranges come from each unit's AttackProfile
 * (the same `range` as `unit.attackRange`), not a fixed placeholder.
 */

export interface TouchZoneConfig {
  /** Stick deflection cap in CSS pixels. Tilt is distance / maxRadius. */
  maxRadius: number;
  /** Pixels of drag off a skill button before it aims instead of tap-casting. */
  dragSlop: number;
}

export interface MobileCommand {
  moveVector: { x: number; y: number };
  attackTriggered: boolean;
  /** Belt slot 0–3, or -1 when this sample did not release a skill. */
  castSkillIndex: number;
  /** Client position while a skill drag is past the slop, otherwise null. */
  dragAimVector: { x: number; y: number } | null;
}

export interface AutoTargetUnit {
  id: number;
  x: number;
  y: number;
  radius: number;
  hp: number;
  alive: boolean;
  team: string;
  kind: string;
}

export const MOBILE_ZONE: TouchZoneConfig = { maxRadius: 45, dragSlop: 12 };

export type SkillAim = 'single' | 'ground' | 'self';

/** Amazon order: the four Magic Arrow path skills aim at a unit (handlers in skills/amazon.ts). */
const AMAZON_SINGLE = ['magic-arrow', 'multi-shot', 'ice-shot', 'fire-shot'];

/** Paladin order: Zeal and Smite lock a unit in melee reach, Charge locks a unit to rush (skills/paladin.ts). */
const PALADIN_MELEE = ['zeal', 'smite'];

/** Barbarian, Amazon and Paladin skills. Leap is the ground cast; bash and the Amazon arrows lock a unit. */
export function skillAimKind(id: string): SkillAim {
  if (id === 'leap-attack') return 'ground';
  if (id === 'bash') return 'single';
  if (AMAZON_SINGLE.includes(id)) return 'single';
  if (PALADIN_MELEE.includes(id) || id === 'charge') return 'single';
  return 'self';
}

/** Reach used by the single-target skills, matching their handlers. */
export function skillReach(id: string, attackRange: number): number {
  if (id === 'bash') return attackRange + 18;
  if (AMAZON_SINGLE.includes(id)) return attackRange + 40; // skills/amazon.ts AMAZON_SKILL_REACH_BONUS [TEMP]
  if (PALADIN_MELEE.includes(id)) return attackRange + 18; // skills/paladin.ts PALADIN_MELEE_REACH_BONUS [TEMP]
  if (id === 'charge') return 260; // skills/paladin.ts CHARGE_REACH [TEMP]
  return attackRange;
}

/**
 * Living enemies in range. Champions beat minions and towers by scoring
 * distance × 0.6. Equal scores go to the lowest HP, then the nearest body.
 */
export function getAutoTarget<T extends AutoTargetUnit>(
  units: readonly T[],
  hero: { x: number; y: number; team: string },
  range: number,
): T | null {
  let best: T | null = null;
  let bestScore = Infinity;
  let bestHp = Infinity;
  let bestDist = Infinity;
  for (const unit of units) {
    if (!unit.alive || unit.team === hero.team) continue;
    const dist = Math.hypot(unit.x - hero.x, unit.y - hero.y);
    if (dist > range + unit.radius) continue;
    const score = unit.kind === 'champion' ? dist * 0.6 : dist;
    const closerScore = score < bestScore - 1e-9;
    const sameScore = Math.abs(score - bestScore) <= 1e-9;
    const lowerHp = unit.hp < bestHp - 1e-9;
    const sameHp = Math.abs(unit.hp - bestHp) <= 1e-9;
    if (closerScore || (sameScore && (lowerHp || (sameHp && dist < bestDist - 1e-9)))) {
      best = unit;
      bestScore = score;
      bestHp = unit.hp;
      bestDist = dist;
    }
  }
  return best;
}

export interface SkillGesture {
  slot: number;
  mode: 'tap' | 'aim' | 'cancel';
  x: number;
  y: number;
}

interface StickIds {
  touch?: number;
  pointer?: number;
}

/**
 * Floating left-half joystick plus skill tap/drag. The DOM listeners live in
 * InputController so the existing touch guards stay in one place.
 */
export class MobileInputManager {
  readonly zone: TouchZoneConfig;
  anchorX = 0;
  anchorY = 0;
  engaged = false;
  touchId: number | null = null;
  pointerId: number | null = null;
  castSkillIndex = -1;
  dragAimVector: { x: number; y: number } | null = null;
  lastGesture: SkillGesture | null = null;

  private joyX = 0;
  private joyY = 0;
  private skill: { pointerId: number; slot: number; x0: number; y0: number; x: number; y: number; max: number } | null =
    null;

  constructor(zone: TouchZoneConfig = MOBILE_ZONE) {
    this.zone = zone;
  }

  get moveVector(): { x: number; y: number } {
    return { x: this.engaged ? this.joyX : 0, y: this.engaged ? this.joyY : 0 };
  }

  command(attackTriggered: boolean): MobileCommand {
    return {
      moveVector: this.moveVector,
      attackTriggered,
      castSkillIndex: this.castSkillIndex,
      dragAimVector: this.dragAimVector,
    };
  }

  /** True when this touch is the one holding the stick. A second finger is ignored. */
  ownsTouch(id: number): boolean {
    return this.touchId === id;
  }

  /** Pointer updates the stick only when no touch id has claimed the gesture. */
  ownsPointer(id: number): boolean {
    return this.touchId == null && this.pointerId === id;
  }

  beginStick(x: number, y: number, id: StickIds): boolean {
    if (this.touchId != null) return false;
    if (this.engaged && this.pointerId != null && id.touch != null) {
      if (Math.hypot(x - this.anchorX, y - this.anchorY) < this.zone.maxRadius + 8) {
        this.touchId = id.touch;
        return true;
      }
      return false;
    }
    if (this.engaged) return false;
    this.anchorX = x;
    this.anchorY = y;
    this.touchId = id.touch ?? null;
    this.pointerId = id.pointer ?? null;
    this.engaged = true;
    this.joyX = 0;
    this.joyY = 0;
    return true;
  }

  moveStick(x: number, y: number): void {
    if (!this.engaged) return;
    let dx = x - this.anchorX;
    let dy = y - this.anchorY;
    const max = this.zone.maxRadius;
    const mag = Math.hypot(dx, dy);
    if (mag > max && mag > 0) {
      const scale = max / mag;
      dx *= scale;
      dy *= scale;
    }
    this.joyX = max > 0 ? dx / max : 0;
    this.joyY = max > 0 ? dy / max : 0;
  }

  endStick(): void {
    this.engaged = false;
    this.joyX = 0;
    this.joyY = 0;
    this.touchId = null;
    this.pointerId = null;
  }

  trackingSkill(pointerId: number): boolean {
    return this.skill?.pointerId === pointerId;
  }

  beginSkill(pointerId: number, slot: number, x: number, y: number): void {
    if (slot < 0 || slot > 3) return;
    this.skill = { pointerId, slot, x0: x, y0: y, x, y, max: 0 };
    this.dragAimVector = null;
    this.castSkillIndex = -1;
  }

  /** Returns true while the finger is far enough to show the ground cursor. */
  moveSkill(pointerId: number, x: number, y: number): boolean {
    const skill = this.skill;
    if (!skill || skill.pointerId !== pointerId) return false;
    skill.x = x;
    skill.y = y;
    skill.max = Math.max(skill.max, Math.hypot(x - skill.x0, y - skill.y0));
    const aiming = Math.hypot(x - skill.x0, y - skill.y0) > this.zone.dragSlop;
    this.dragAimVector = aiming ? { x, y } : null;
    return aiming;
  }

  endSkill(pointerId: number, x: number, y: number, overButton: boolean): SkillGesture | null {
    const skill = this.skill;
    if (!skill || skill.pointerId !== pointerId) return null;
    skill.max = Math.max(skill.max, Math.hypot(x - skill.x0, y - skill.y0));
    this.skill = null;
    this.dragAimVector = null;
    const dragged = skill.max > this.zone.dragSlop;
    const mode: SkillGesture['mode'] = !dragged ? 'tap' : overButton ? 'cancel' : 'aim';
    const gesture: SkillGesture = { slot: skill.slot, mode, x, y };
    this.lastGesture = gesture;
    this.castSkillIndex = mode === 'cancel' ? -1 : skill.slot;
    return gesture;
  }
}
