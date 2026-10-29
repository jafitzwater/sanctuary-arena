/**
 * Economy order, step 6: champion unit frames (world space). Pure data for the renderer and
 * tests: class name, level, bar fills, tick marks, and a cache key that only changes when the
 * frame chrome (name, level, team, ticks) changes.
 * Layout [TEMP]: round level circle at the left, green HP bar with ticks, thinner blue mana
 * bar directly under it, class name in small text over the HP bar.
 */
import type { Unit } from './types';

export const CLASS_NAMES: Record<string, string> = {
  barbarian: 'Barbarian',
  amazon: 'Amazon',
  paladin: 'Paladin',
  sorceress: 'Sorceress',
  necromancer: 'Necromancer',
};

/** [TEMP] Frame sizes in screen px (phone-readable at 844x390). */
export const FRAME = { w: 58, hp: 6, mana: 3, gap: 1, circle: 8, name: 9 } as const;

/** HP per tick mark: 100, or 250 when 100-hp ticks would sit closer than 4 px (as before). */
export function tickStep(maxHp: number, width: number = FRAME.w): number {
  const gap = width / Math.max(1, maxHp / 100);
  return gap >= 4 ? 100 : 250;
}

/** Tick positions as fractions (0..1) of the HP bar. */
export function tickMarks(maxHp: number, width: number = FRAME.w): number[] {
  const step = tickStep(maxHp, width);
  const out: number[] = [];
  for (let mark = step; mark < maxHp - 0.5; mark += step) out.push(mark / maxHp);
  return out;
}

/** Bot heroes keep their class in `look`; the player's defId is its class id. */
export function className(unit: Unit): string {
  return CLASS_NAMES[unit.look ?? ''] ?? CLASS_NAMES[unit.defId] ?? unit.name;
}

export interface UnitFrameData {
  className: string;
  level: number;
  team: Unit['team'];
  mine: boolean;
  hpPct: number;
  manaPct: number;
  showMana: boolean;
  ticks: number[];
  /** Chrome cache key: changes only with class, level, team, ownership or tick layout. */
  key: string;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export function unitFrameData(unit: Unit, playerId: number, heroLevel?: number): UnitFrameData {
  const mine = unit.id === playerId;
  const level = mine && heroLevel ? heroLevel : unit.level || 1;
  const name = className(unit);
  const step = tickStep(unit.maxHp);
  const ticks = tickMarks(unit.maxHp);
  const showMana = unit.maxMana > 0;
  return {
    className: name,
    level,
    team: unit.team,
    mine,
    hpPct: clamp01(unit.hp / Math.max(1, unit.maxHp)),
    manaPct: showMana ? clamp01(unit.mana / unit.maxMana) : 0,
    showMana,
    ticks,
    key: `${name}|${level}|${unit.team}|${mine ? 1 : 0}|${Math.round(unit.maxHp)}|${step}|${showMana ? 1 : 0}`,
  };
}
