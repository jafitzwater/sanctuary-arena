/**
 * Economy order, step 6: champion unit frames (world space). Pure data for the renderer and
 * tests: class name, level, bar fills, tick marks, and a cache key that only changes when the
 * frame chrome (name, level, team, ticks) changes.
 * Layout (unit-frame restyle order [JOSEPH t228u]): class name centered above the bars, round
 * level badge at the left with an XP ring, green HP bar with ticks right of it, thinner blue mana
 * bar directly under it and aligned.
 */
import type { Unit } from './types';
import { MAX_LEVEL, xpToNext } from './economy';

export const CLASS_NAMES: Record<string, string> = {
  barbarian: 'Barbarian',
  amazon: 'Amazon',
  paladin: 'Paladin',
  sorceress: 'Sorceress',
  necromancer: 'Necromancer',
};

/**
 * Unit-frame restyle order [JOSEPH t228u]: Wild Rift layout, slightly larger than the PR #74 frame
 * (w 58 / hp 6 / mana 3 / circle r 8 / name 9). Sizes in css px (screen px at the current HUD scale; the
 * canvas is dpr-scaled, so 1 unit = 1 css px).
 * Four UI/size changes order item 1 [JOSEPH t250u]: hp bar 12 px (was 8), mana bar 8 px (was 4), level
 * circle 36 px diameter (circle = radius 18, was 12 = 24 px), XP ring 2 px thick inside the circle (unchanged).
 * w, gap and name stay as they were [TEMP].
 * circle = level badge radius; ring = XP ring stroke width just inside the badge rim.
 */
export const FRAME = { w: 68, hp: 12, mana: 8, gap: 1, circle: 18, ring: 2, name: 11 } as const;

/**
 * Structure scale + nameplate order item 3 [JOSEPH t275u]: the frame sits just ABOVE the champion's head.
 * [TEMP] Gap between the top of the scaled sprite (foot - drawn height, which already includes the +15%) and the
 * lowest point of the frame (css px). Frame sizes unchanged.
 */
export const NAMEPLATE_HEAD_GAP = 4;

/** How far the frame reaches below the HP bar top: the bars, or the level circle centred on them (28.5 px). */
export function nameplateDrop(): number {
  const bars = FRAME.hp + FRAME.gap + FRAME.mana;
  return Math.max(bars, bars / 2 + FRAME.circle);
}

/** HP bar top (css y) for a champion with foot at footY and drawn sprite height spriteH (was footY - spriteH - 18). */
export function nameplateBarTop(footY: number, spriteH: number): number {
  return footY - spriteH - NAMEPLATE_HEAD_GAP - nameplateDrop();
}

/** Level badge rim stroke width (css px). */
export const BADGE_RIM = 1.6;

/**
 * XP ring path radius: the 2 px ring sits fully inside the badge rim with a 0.8 px gap (outer edge
 * r - rim - 0.8, inner edge 2 px further in). Filled clockwise from 12 o'clock.
 */
export function xpRingRadius(r: number = FRAME.circle, ring: number = FRAME.ring): number {
  return r - BADGE_RIM - ring / 2 - 0.8;
}

/** XP ring redraw step: the ring only changes (and the cached chrome rebuilds) every 1/48 of a level. */
export const XP_RING_STEPS = 48;

/** [TEMP] Frame colors. Enemy HP stays red [JOSEPH earlier]; allies and the player read green. */
export const FRAME_COLORS = {
  hp: { ally: '#4fbf3a', enemy: '#d8432e', wild: '#4fbf3a' },
  rim: { ally: '#c7b377', enemy: '#b8402c', wild: '#c7b377' },
  mana: '#3a8fe8',
  ring: '#ffd75e',
} as const;

/**
 * XP ring fill (0..1), quantized to XP_RING_STEPS. Max level shows a full ring. Bots have a clock
 * level and no XP track, so pass xp undefined to get an empty ring [TEMP].
 */
export function xpRingFraction(level: number, xp: number | undefined): number {
  if (level >= MAX_LEVEL) return 1;
  if (xp === undefined) return 0;
  const raw = Math.max(0, Math.min(1, xp / xpToNext(level)));
  return Math.floor(raw * XP_RING_STEPS) / XP_RING_STEPS;
}

/** Level text shown in the badge. */
export function levelText(level: number): string {
  return String(Math.max(1, Math.min(MAX_LEVEL, Math.floor(level) || 1)));
}

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
  /** Level badge text (centered in the circle). */
  levelText: string;
  /** XP ring fill 0..1 in 1/48 steps; 1 at max level. */
  xpRing: number;
  hpColor: string;
  rimColor: string;
  /** Chrome cache key: changes only with class, level, team, ownership or tick layout. */
  key: string;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export function unitFrameData(unit: Unit, playerId: number, heroLevel?: number, heroXp?: number): UnitFrameData {
  const mine = unit.id === playerId;
  const level = mine && heroLevel ? heroLevel : unit.level || 1;
  const xpRing = xpRingFraction(level, mine ? heroXp : undefined);
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
    levelText: levelText(level),
    xpRing,
    hpColor: FRAME_COLORS.hp[unit.team],
    rimColor: FRAME_COLORS.rim[unit.team],
    key: `${name}|${level}|${unit.team}|${mine ? 1 : 0}|${Math.round(unit.maxHp)}|${step}|${showMana ? 1 : 0}|${Math.round(xpRing * XP_RING_STEPS)}`,
  };
}
