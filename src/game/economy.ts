/**
 * ORDER "Gold, XP/leveling, health, mana (Wild Rift style) + status-bar visuals" (Joseph t199u).
 * Pure numbers and formulas for gold, XP, respawn and the item pace model. Values written in the
 * order are [JOSEPH]; everything else is [TEMP]. Spec: sanctuary-canon/wild-rift-economy-spec.md.
 */
import { WAVE_INTERVAL, WAVE_SIZE, waveMob } from './data/waves';

// ---------- GOLD ----------
/** [JOSEPH] "starting gold 500". */
export const START_GOLD = 500;
/** [JOSEPH] "passive 3.5 gold/s starting at 0:20". */
export const PASSIVE_GOLD = 3.5;
export const PASSIVE_GOLD_FROM = 20;
/** [JOSEPH] "from 4:00 the player with the lowest gold gets +2 gold/s extra". */
export const LOW_GOLD_BONUS = 2;
export const LOW_GOLD_FROM = 240;

/** Gold per second for one champion at this time. */
export function passiveGoldRate(time: number, lowest: boolean): number {
  if (time < PASSIVE_GOLD_FROM) return 0;
  return PASSIVE_GOLD + (lowest && time >= LOW_GOLD_FROM ? LOW_GOLD_BONUS : 0);
}

/**
 * [TEMP reading] "the player with the lowest gold": lowest current gold among every champion on
 * the map (both teams); every champion tied at the lowest value gets the bonus.
 */
export function lowestGoldIds(champions: { id: number; gold: number }[]): Set<number> {
  if (!champions.length) return new Set();
  const low = Math.min(...champions.map((c) => c.gold));
  return new Set(champions.filter((c) => c.gold <= low + 1e-6).map((c) => c.id));
}

export type MinionRole = 'melee' | 'caster' | 'siege';
/** [JOSEPH] "last-hit: melee minion 65, caster minion 40, siege/cannon minion 85". */
export const MINION_GOLD: Record<MinionRole, number> = { melee: 65, caster: 40, siege: 85 };

/**
 * Existing lane minions mapped to the order's roles [TEMP mapping]. Rogue, Valkyrie and Act 2
 * Mercenary fight in melee in the sim -> melee. Act 3 Mercenary is the kit's spell caster
 * ("strong spell dmg", joseph-answers) and the Rogue Archer is ranged -> caster.
 * No siege/cannon minion exists in the repo, so 'siege' has no unit (reported, not invented).
 */
export const MINION_ROLE: Record<string, MinionRole> = {
  rogue: 'melee',
  valkyrie: 'melee',
  'act2-mercenary': 'melee',
  'act3-mercenary': 'caster',
  'rogue-archer': 'caster',
};

export function minionRole(defId: string, ranged: boolean): MinionRole {
  return MINION_ROLE[defId] ?? (ranged ? 'caster' : 'melee');
}

/** [TEMP] Share of a minion's gold that each nearby allied champion (not the last-hitter) gets. */
export const SHARE_PCT = 0.2;
/** [TEMP] Range for the share and for proximity XP (the sim's existing 520 XP radius). */
export const SHARE_RADIUS = 520;
export function shareGold(gold: number): number {
  return Math.round(gold * SHARE_PCT);
}

/** [TEMP] Champion bounty: 300 base, +50 per kill the victim had on its streak past 1, capped at +300. */
export const KILL_BOUNTY = 300;
export const BOUNTY_STREAK_STEP = 50;
export const BOUNTY_STREAK_CAP = 300;
/** [TEMP] Each assisting champion gets this share of the base bounty. */
export const ASSIST_GOLD_PCT = 0.5;
export function championBounty(victimStreak: number): number {
  return KILL_BOUNTY + Math.min(BOUNTY_STREAK_CAP, Math.max(0, victimStreak - 1) * BOUNTY_STREAK_STEP);
}
export function assistGold(): number {
  return Math.round(KILL_BOUNTY * ASSIST_GOLD_PCT);
}

/**
 * [TEMP] Structures: local gold is the structure's existing bounty (tower tiers 220/160/260, seal
 * 90, Worldstone 280) to the killer and allied champions within STRUCTURE_LOCAL_RADIUS; global
 * gold goes to every champion on the destroying team.
 */
export const STRUCTURE_LOCAL_RADIUS = 900;
export const STRUCTURE_GLOBAL: Record<'tower' | 'seal' | 'base', number> = { tower: 50, seal: 75, base: 0 };

/** [TEMP, order suggests 70%] "items sell for a percentage of cost". */
export const SELL_PCT = 0.7;
export function sellValue(cost: number): number {
  return Math.floor(cost * SELL_PCT);
}

// ---------- XP / LEVELING ----------
/** [JOSEPH] "max level 15". */
export const MAX_LEVEL = 15;
/** [TEMP] XP for the next level: 120 at level 1, +30 per level (4410 total to 15). */
export function xpToNext(level: number): number {
  return 120 + (level - 1) * 30;
}
export function totalXpToLevel(level: number): number {
  let sum = 0;
  for (let l = 1; l < level; l++) sum += xpToNext(l);
  return sum;
}
/** [TEMP] Lane minion XP by role (siege has no unit). */
export const MINION_XP: Record<MinionRole, number> = { melee: 60, caster: 30, siege: 90 };
/** [TEMP] Champion kill XP by victim level; assisters get ASSIST_XP_PCT of it. */
export function championKillXp(victimLevel: number): number {
  return 100 + 25 * Math.max(1, victimLevel);
}
export const ASSIST_XP_PCT = 0.5;

/** [JOSEPH] Top-tier ("ultimate") skill: unlock at 5, ranks at 9 and 13 -> max rank 3. */
export const TOP_TIER_RANK_LEVELS = [5, 9, 13] as const;

/**
 * [TEMP] Clock level the sim expects at a time: the floor pace model's level (below). Used for
 * bot display levels and the comeback XP multiplier.
 */
let expected: number[] | null = null;
export function expectedLevel(time: number): number {
  expected ??= paceModel(40 * 60).map((p) => p.level);
  return expected[Math.max(0, Math.min(expected.length - 1, Math.floor(time)))];
}

// ---------- HEALTH ----------
/**
 * Doc: "The first death takes 5 seconds. Each death after that adds 5 seconds." [DOC]
 * plus the order's "respawn timer [TEMP, scale with level]": +2 s per level past 1, cap 60 s [TEMP].
 * A level-1 first death is still 5 s.
 */
export const RESPAWN_PER_LEVEL = 2;
export const RESPAWN_CAP = 60;
export function respawnSeconds(deathCount: number, level = 1): number {
  return Math.min(RESPAWN_CAP, 5 * Math.max(1, deathCount) + RESPAWN_PER_LEVEL * (Math.max(1, level) - 1));
}

// ---------- PACE MODEL (items test) ----------
/**
 * [TEMP] Floor model for one solo laner: minions only (no kills, assists, camps, towers, ally
 * share or low-gold bonus). Waves meet ~160 s (measured on the 12k map: first lane minion death
 * at 158 s), then one wave every WAVE_INTERVAL. Every wave death is in XP range; the hero
 * last-hits LAST_HIT of them.
 */
export const FIRST_CONTACT = 160;
export const LAST_HIT = 0.4;
export function paceModel(seconds = 22 * 60, comeback?: (level: number, t: number) => number): { level: number; gold: number; xp: number }[] {
  const out: { level: number; gold: number; xp: number }[] = [];
  let level = 1, xp = 0, gold = START_GOLD, wave = 0, totalXp = 0;
  for (let t = 0; t <= seconds; t++) {
    if (t > 0) gold += passiveGoldRate(t - 1, false);
    if (t >= FIRST_CONTACT && (t - FIRST_CONTACT) % WAVE_INTERVAL === 0) {
      wave += 1;
      const role = minionRole(waveMob(wave), false);
      const gain = Math.round(MINION_XP[role] * (comeback ? comeback(level, t) : 1)) * WAVE_SIZE;
      xp += gain;
      totalXp += gain;
      gold += WAVE_SIZE * LAST_HIT * MINION_GOLD[role];
      while (level < MAX_LEVEL && xp >= xpToNext(level)) { xp -= xpToNext(level); level += 1; }
    }
    out.push({ level, gold, xp: totalXp });
  }
  return out;
}
