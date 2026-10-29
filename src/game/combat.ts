import { totalMS } from './data/moveSpeed';
import { STAT_GROWTH } from './data/classes/statGrowth';
import { isBetterGear, itemById, itemGate, potionCap, type ItemDef, type PotionKind } from './data/items';
import type { SkillDef } from './data/classes/types';
import { dist } from './math';
import { comebackMul, xpShare } from './pace';
import { player } from './query';
import type { Fx, Sim, Unit } from './types';

/** Doc: "The level cap is 15." (item 11). Exp per level is not in the doc; the repo curve below is kept. */
export const MAX_LEVEL = 15;

export function xpToNext(level: number): number {
  return 60 + (level - 1) * 55;
}

export function mitigated(amount: number, armor: number): number {
  if (amount <= 0) return 0;
  return Math.max(1, amount * (100 / (100 + Math.max(0, armor))));
}

export function banner(sim: Sim, text: string, seconds = 3.2): void {
  sim.banner = { text, t: seconds };
}

export function sfx(sim: Sim, name: string): void {
  sim.sfx.push(name);
  if (sim.sfx.length > 24) sim.sfx.shift();
}

function creditChampion(sim: Sim, unit: Unit, killer: Unit | null): void {
  const team = killer?.team;
  if (team === 'ally') sim.allyKills += 1;
  else if (team === 'enemy') sim.enemyKills += 1;
  if (!killer || (team !== 'ally' && team !== 'enemy')) return;
  const seen = new Set<number>([killer.id]);
  for (const mark of unit.threats) {
    if (sim.time - mark.t > ASSIST_WINDOW) continue;
    if (mark.team !== team || seen.has(mark.id)) continue;
    seen.add(mark.id);
    const mate = sim.units.find((other) => other.id === mark.id);
    if (!mate || mate.kind !== 'champion') continue;
    if (mate.id === sim.playerId) sim.assists += 1;
  }
}

function fxCap(): number {
  return typeof window !== 'undefined' && 'ontouchstart' in window ? 120 : 80;
}

export function pushFx(sim: Sim, fx: Fx): void {
  sim.fx.push(fx);
  const cap = fxCap();
  if (sim.fx.length > cap) sim.fx.splice(0, sim.fx.length - cap);
}

export type DamageSchool = 'physical' | 'magic';

const ASSIST_WINDOW = 10;

/** Orange physical, magenta magic or skill, red when the player takes the hit. */
export function damageColor(school: DamageSchool, taken: boolean): string {
  if (taken) return '#e23b3b';
  return school === 'magic' ? '#e454c8' : '#e07a32';
}

export function floater(
  sim: Sim,
  x: number,
  y: number,
  text: string,
  color: string,
  hit?: { school: DamageSchool; taken: boolean },
): void {
  pushFx(sim, {
    kind: 'text',
    x,
    y,
    text,
    color,
    life: 0.9,
    t: 0,
    r: 0,
    vy: -38,
    school: hit?.school,
    taken: hit?.taken,
  });
}

/** Remember a champion hit or debuff so a teammate's kill can award an assist. */
export function noteDebuff(sim: Sim, target: Unit, attacker: Unit | null): void {
  if (!attacker || attacker.id === target.id || target.kind !== 'champion') return;
  if (attacker.team === target.team) return;
  const mark = target.threats.find((entry) => entry.id === attacker.id);
  if (mark) {
    mark.t = sim.time;
    mark.team = attacker.team;
    return;
  }
  target.threats.push({ id: attacker.id, team: attacker.team, t: sim.time });
  if (target.threats.length > 12) {
    const now = sim.time;
    target.threats = target.threats.filter((entry) => now - entry.t <= ASSIST_WINDOW).slice(-8);
  }
}

/**
 * Player level follows the xp track. Enemy champions show a clock level
 * (one step each 45s, capped) that does not change their stats.
 */
export function syncChampionLevels(sim: Sim): void {
  const clock = 1 + Math.min(MAX_LEVEL - 1, Math.floor(sim.time / 45));
  for (const unit of sim.units) {
    if (unit.kind !== 'champion') continue;
    if (unit.id === sim.playerId) unit.level = sim.level;
    else if (unit.team === 'enemy') unit.level = clock;
    else if (!unit.level) unit.level = 1;
  }
}

export function ring(sim: Sim, x: number, y: number, r: number, color: string): void {
  pushFx(sim, { kind: 'ring', x, y, r, color, life: 0.4, t: 0 });
}

/**
 * Gap-list item 13. Doc: "At skill level 1 the mana cost is 10%, level 2 is 15%, level 3 is 20%, and so on."
 * -> 10/15/20/25/30% [DERIVED]. [TEMP, numbers-table: percent of maximum mana; the doc does not say of what.]
 * Sorceress order: the sorceress 2% step ([DOC][P]) comes from SkillDef.manaStep; every other kit
 * keeps the 5% step. Necromancer order: the necromancer kit sets the same 2% manaStep.
 */
export function manaPct(rank: number, step = 0.05): number {
  return 0.1 + step * (Math.max(1, rank) - 1);
}

export function manaCost(def: SkillDef, rank: number, maxMana: number): number {
  return Math.round(maxMana * manaPct(rank, def.manaStep ?? 0.05));
}

export function grantXp(sim: Sim, amount: number): void {
  if (amount <= 0 || sim.level >= MAX_LEVEL) return;
  sim.xp += amount;
  const stats = sim.classDef.stats;
  let gained = false;
  while (sim.level < MAX_LEVEL && sim.xp >= xpToNext(sim.level)) {
    sim.xp -= xpToNext(sim.level);
    sim.level += 1;
    sim.skillPoints += 1;
    // Doc: "Stat points always auto-populate." (item 10)
    const growth = STAT_GROWTH[sim.classDef.id];
    if (growth) for (const key of ['str', 'dex', 'vit', 'energy'] as const) sim.attributes[key] += growth[key];
    else sim.statPoints += stats.statPointsPerLevel;
    gained = true;
  }
  if (sim.level >= MAX_LEVEL) sim.xp = 0;
  if (gained) {
    autoLearnUnlocked(sim);
    fillEmptyBelt(sim);
    recomputeHero(sim);
    const hero = player(sim);
    if (hero.alive) {
      hero.hp = hero.maxHp;
      hero.mana = hero.maxMana;
    }
    hero.level = sim.level;
    banner(sim, `Level ${sim.level} — life and mana restored`);
    floater(sim, hero.x, hero.y - hero.radius - 28, `Level ${sim.level}`, '#e6c864');
    pushFx(sim, { kind: 'ring', x: hero.x, y: hero.y, r: 54, color: '#e6c864', life: 0.75, t: 0 });
    sfx(sim, 'level');
  }
}

/**
 * [JOSEPH] Pass 3 order item 4: "each skill auto-learned at rank 1 at its suggested level;
 * extra skill points stay manual; no auto-spending beyond the rank-1 auto-learn."
 * A skill whose kit unlockLevel is reached (and whose prereqs are learned) goes to rank 1.
 * Reading used [JOSEPH to confirm]: the rank-1 learn uses that level's skill point when one is
 * there (the level-1 starter is still free, as before), so total ranks + points per level match
 * the old manual flow. Ranks 2+ stay manual through tryUpgrade.
 */
export function autoLearnUnlocked(sim: Sim): void {
  let learned = true;
  while (learned) {
    learned = false;
    for (const def of sim.classDef.skills) {
      if ((sim.skillRanks[def.id] ?? 0) >= 1 || sim.level < def.unlockLevel) continue;
      if (def.prereqs.some((req) => (sim.skillRanks[req] ?? 0) < 1)) continue;
      sim.skillRanks[def.id] = 1;
      if (sim.skillPoints > 0) sim.skillPoints -= 1;
      banner(sim, `${def.name} learned.`);
      learned = true;
    }
  }
}

/** Put a learned skill (rank 1 or higher) into the first empty Q W E R slot. */
export function fillEmptyBelt(sim: Sim): void {
  for (const skill of sim.classDef.skills) {
    if ((sim.skillRanks[skill.id] ?? 0) < 1) continue;
    if (sim.belt.includes(skill.id)) continue;
    const slot = sim.belt.findIndex((entry) => !entry);
    if (slot < 0) return;
    sim.belt[slot] = skill.id;
  }
}

export function damageUnit(
  sim: Sim,
  target: Unit,
  amount: number,
  attacker: Unit | null,
  school: DamageSchool = 'physical',
): void {
  if (!target.alive || target.invuln > 0 || sim.phase !== 'playing') return;
  const armor = target.armor + (target.buffT > 0 ? target.buffArmor : 0) + (target.guardT > 0 ? 14 : 0);
  const dealt = mitigated(amount, armor);
  target.hp -= dealt;
  target.hitFlash = 0.12;
  target.combat = 4;
  if (attacker) attacker.combat = 4;
  const taken = target.id === sim.playerId;
  floater(sim, target.x, target.y - target.radius - 8, String(Math.round(dealt)), '#f4efe4', { school, taken });
  noteDebuff(sim, target, attacker);
  if (target.id === sim.playerId) {
    sfx(sim, 'hurt');
    if (dealt >= target.maxHp * 0.15) sfx(sim, 'heavy');
  }
  else if (attacker?.id === sim.playerId && attacker.whirlT <= 0) sfx(sim, 'swing');
  if (target.hp <= 0) kill(sim, target, attacker);
}

export function kill(sim: Sim, unit: Unit, killer: Unit | null): void {
  if (!unit.alive) return;
  unit.alive = false;
  unit.hp = 0;
  unit.diedAt = sim.time;
  unit.leap = null;
  unit.whirlT = 0;
  unit.targetId = null;
  if (unit.kind === 'minion') unit.corpse = 4.5;
  let goldMul = 1;
  if (unit.kind === 'champion') {
    // Doc: "The first death takes 5 seconds. Each death after that adds 5 seconds."
    unit.deathCount += 1;
    unit.respawn = respawnSeconds(unit.deathCount);
    unit.streak = 0;
    if (killer && killer.kind === 'champion' && killer.team !== unit.team) {
      killer.streak += 1;
      goldMul = killGoldMul(!sim.firstKillPaid, killer.streak);
      sim.firstKillPaid = true;
    }
    if (unit.id === sim.playerId) {
      // Doc: "They lose 25% of the gold they have."
      sim.gold -= deathGoldLoss(sim.gold);
      sim.deaths += 1;
      banner(sim, 'You have been slain');
      sfx(sim, 'death');
    } else {
      banner(sim, `${unit.name} has fallen`);
      sfx(sim, 'death');
    }
    creditChampion(sim, unit, killer);
  }
  if (unit.kind === 'tower' || unit.kind === 'seal') {
    banner(sim, `${unit.name} has fallen`);
    sfx(sim, 'tower');
    sim.shake = Math.max(sim.shake, 8);
    if (unit.kind === 'seal') unit.respawn = 40;
  }
  if (unit.kind === 'base') {
    sim.phase = unit.team === 'enemy' ? 'victory' : 'defeat';
    banner(
      sim,
      sim.phase === 'victory'
        ? (sim.map.victory ?? "Andariel's altar falls silent")
        : (sim.map.defeat ?? 'The Rogue Encampment has fallen'),
      6,
    );
    sfx(sim, sim.phase === 'victory' ? 'win' : 'lose');
    sim.shake = 14;
  }

  // Item 15 [DOC]: "A boss drops a health potion and a mana potion instead." When the last
  // of a cave pack falls to the player, one of each goes to the player's potions, up to
  // the belt cap. Drops for AI killers are not tracked (the repo has no AI potions).
  if (unit.pack && killer?.id === sim.playerId && sim.map.dens?.some((den) => den.id === unit.pack && den.cave)) {
    const packLeft = sim.units.some((other) => other.alive && other.pack === unit.pack);
    if (!packLeft) {
      const cap = potionCap(sim.loadout.belt);
      sim.potions.health = Math.min(cap, sim.potions.health + 1);
      sim.potions.mana = Math.min(cap, sim.potions.mana + 1);
      banner(sim, `${unit.name} dropped a health potion and a mana potion.`);
    }
  }

  if (unit.objective === 'dragon' && killer && (killer.team === 'ally' || killer.team === 'enemy')) {
    for (const heroUnit of sim.units) {
      if (!heroUnit.alive || heroUnit.kind !== 'champion' || heroUnit.team !== killer.team) continue;
      if (unit.affix === 'Cold') heroUnit.guardT = Math.max(heroUnit.guardT, 16);
      else if (unit.affix === 'Lightning') heroUnit.haste = Math.max(heroUnit.haste, 16);
      else heroUnit.mightT = Math.max(heroUnit.mightT, 16);
    }
    banner(sim, `${unit.affix || 'Fire'} power fills your side.`);
  }
  const worth = unit.team === 'enemy' || unit.team === 'wild';
  if (!worth) return;
  const hero = player(sim);
  const playerKill = killer?.id === sim.playerId;
  const structure = unit.kind === 'tower' || unit.kind === 'base' || unit.kind === 'seal';
  if (playerKill) {
    awardGold(sim, unit, goldMul);
    if (unit.kind === 'minion') sim.cs += 1;
    if (unit.kind === 'champion') sim.kills += 1;
  } else if (structure && killer && killer.team === 'ally') {
    awardGold(sim, unit);
  }
  if (structure && killer && killer.team === 'ally') {
    grantXp(sim, unit.xp);
    return;
  }
  if (killer && killer.team === 'enemy') return;
  const near = sim.units.filter(
    (other) =>
      other.alive &&
      other.kind === 'champion' &&
      other.team === 'ally' &&
      dist(other, unit) <= 520,
  );
  if (playerKill && hero.alive && !near.some((other) => other.id === hero.id)) near.push(hero);
  if (!near.some((other) => other.id === sim.playerId)) return;
  const xp = Math.round(unit.xp * xpShare(near.length) * comebackMul(sim.level, sim.time));
  grantXp(sim, xp);
}

/**
 * Gap-list items 8 and 9 (refined doc, "Death" and "Premise").
 * Doc: "The first death takes 5 seconds. Each death after that adds 5 seconds." -> 5 s x death count.
 * Doc: "They lose 25% of the gold they have." -> 25% of current gold (rounded down).
 * Doc: "The first character kill of the match pays 50% more gold." -> x1.5.
 * Doc: "A streak is 3 kills in a row, and that kill also pays 50% more gold." -> x1.5 on the 3rd kill.
 * Excluded (NEEDS JOSEPH): timer cap, base kill gold/exp, whether the streak bonus repeats.
 */
export function respawnSeconds(deathCount: number): number {
  return 5 * Math.max(1, deathCount);
}

export function deathGoldLoss(gold: number): number {
  return Math.floor(Math.max(0, gold) * 0.25);
}

export function killGoldMul(firstKillOfMatch: boolean, streak: number): number {
  let mul = 1;
  if (firstKillOfMatch) mul *= 1.5;
  if (streak === 3) mul *= 1.5;
  return mul;
}

function awardGold(sim: Sim, unit: Unit, mul = 1): void {
  const hero = player(sim);
  let gold = Math.round(unit.gold * mul);
  if (hero.findGold > 0 && unit.kind === 'minion') {
    gold += hero.findGold;
    hero.findGold = 0;
  }
  sim.gold += gold;
  floater(sim, unit.x, unit.y - 24, `+${gold}`, '#e6c864');
  sfx(sim, 'coin');
}

function swingTime(wsm: number): number {
  return Math.min(1.2, Math.max(0.45, 0.78 * (1 + wsm / 100)));
}

export function heroNumbers(sim: Sim, timers: { bo: boolean; berserk: boolean }): {
  hp: number;
  mana: number;
  ad: number;
  armor: number;
  moveSpeed: number;
  attackInterval: number;
  attackRange: number;
  wclass: string;
} {
  const stats = sim.classDef.stats;
  const lvl = Math.max(0, sim.level - 1);
  const extraVit = sim.attributes.vit - stats.vit;
  const extraEn = sim.attributes.energy - stats.energy;
  const extraStr = sim.attributes.str - stats.str;
  const extraDex = sim.attributes.dex - stats.dex;
  let hp = stats.hp + lvl * stats.hpPerLevel + extraVit * stats.hpPerVit;
  let mana = stats.mana + lvl * stats.manaPerLevel + extraEn * stats.manaPerEnergy;
  let ad = stats.ad + extraStr * stats.adPerStr + extraDex * (stats.adPerDex ?? 0);
  let armor = stats.armor + extraDex * stats.armorPerDex;
  let move = stats.moveSpeed;
  let interval = stats.attackInterval;
  let range = stats.attackRange;
  let wclass = 'HTH';

  const main = sim.loadout.weapon ? itemById(sim.loadout.weapon) : undefined;
  const wieldTwo = !!main?.twoHanded;
  if (main) {
    ad += main.ad ?? main.adOne ?? 0;
    wclass = (wieldTwo ? main.wclass2 || main.wclass : main.wclass) || '1HS';
    interval = swingTime(main.speed ?? 0);
    if (wieldTwo && (wclass === 'STF' || wclass === '2HT' || wclass === '2HS')) range = 96;
  }
  for (const id of [sim.loadout.armor, sim.loadout.helm, sim.loadout.belt]) {
    if (!id) continue;
    const piece = itemById(id);
    if (!piece) continue;
    armor += piece.armor ?? 0;
    hp += piece.hp ?? 0;
    mana += piece.mana ?? 0;
  }

  interval *= 1 - Math.min(0.15, Math.max(0, extraDex) * 0.004);

  if (timers.bo) {
    const rank = Math.max(1, sim.skillRanks['battle-orders'] ?? 1);
    hp *= 1 + 0.06 * rank;
  }
  if (timers.berserk) armor *= 0.25;

  return {
    hp: Math.max(1, Math.round(hp)),
    mana: Math.max(0, Math.round(mana)),
    ad: Math.max(1, Math.round(ad)),
    armor: Math.round(armor),
    // [JOSEPH] world px/s of the base MS with no modifiers; live modifiers apply in sim championMS().
    moveSpeed: totalMS(move),
    attackInterval: Math.min(1.2, Math.max(0.4, interval)),
    attackRange: range,
    wclass,
  };
}

export function recomputeHero(sim: Sim): void {
  const hero = player(sim);
  const prevHp = hero.maxHp;
  const prevMana = hero.maxMana;
  const built = heroNumbers(sim, { bo: hero.boT > 0, berserk: hero.berserkT > 0 });
  hero.maxHp = built.hp;
  hero.maxMana = built.mana;
  hero.ad = built.ad;
  hero.armor = built.armor;
  hero.moveSpeed = built.moveSpeed;
  hero.attackInterval = built.attackInterval;
  hero.attackRange = built.attackRange;
  hero.wclass = built.wclass;
  if (built.hp > prevHp) hero.hp += built.hp - prevHp;
  if (built.mana > prevMana) hero.mana += built.mana - prevMana;
  hero.hp = Math.max(1, Math.min(hero.maxHp, hero.hp));
  hero.mana = Math.max(0, Math.min(hero.maxMana, hero.mana));
}

export function inShopRange(sim: Sim, unit: Unit): boolean {
  return dist(unit, sim.map.playerBase) <= sim.map.shopRadius;
}

function meetsReq(sim: Sim, item: ItemDef): boolean {
  const { reqStr: needStr, reqDex: needDex } = itemGate(item, sim.classDef.id);
  if (sim.attributes.str < needStr) {
    banner(sim, `Need ${needStr} strength.`);
    return false;
  }
  if (sim.attributes.dex < needDex) {
    banner(sim, `Need ${needDex} dexterity.`);
    return false;
  }
  return true;
}

const GEAR_SLOTS = ['weapon', 'armor', 'helm', 'belt'] as const;

export function tryBuy(sim: Sim, id: string): void {
  const item = itemById(id);
  if (!item) return;
  const hero = player(sim);
  if (hero.alive && !inShopRange(sim, hero)) {
    banner(sim, 'Akara trades only inside the Rogue Encampment.');
    return;
  }
  if (item.consumable) {
    if (sim.gold < item.cost) {
      banner(sim, 'Not enough gold.');
      return;
    }
    const kind = item.consumable;
    if (sim.potions[kind] >= potionCap(sim.loadout.belt)) {
      banner(sim, 'You cannot carry any more of those.');
      return;
    }
    sim.gold -= item.cost;
    sim.potions[kind] += 1;
    sfx(sim, 'coin');
    banner(sim, `Bought ${item.name}.`);
    return;
  }
  if (!GEAR_SLOTS.includes(item.slot as (typeof GEAR_SLOTS)[number])) return;
  const slot = item.slot as (typeof GEAR_SLOTS)[number];
  if ((item.unlockLevel ?? 1) > sim.level) {
    banner(sim, `${item.name} unlocks at level ${item.unlockLevel}.`);
    return;
  }
  if (sim.loadout[slot] === item.id) {
    banner(sim, 'Already equipped.');
    return;
  }
  if (!meetsReq(sim, item)) return;
  const old = sim.loadout[slot] ? itemById(sim.loadout[slot] as string) : undefined;
  // Item 19 [JOSEPH]/doc: "An item cannot be sold. It can only be overwritten for a better item."
  // No sell-back refund; a slot only takes a better item (isBetterGear).
  if (!isBetterGear(item, old)) {
    banner(sim, `${item.name} is not better than your ${old?.name ?? 'gear'}.`);
    return;
  }
  const price = item.cost;
  if (sim.gold < price) {
    banner(sim, 'Not enough gold.');
    return;
  }
  sim.gold -= price;
  sim.loadout[slot] = item.id;
  recomputeHero(sim);
  sfx(sim, 'coin');
  banner(sim, `Bought ${item.name}.`);
}

/**
 * Gap-list items 20 and 21.
 * Doc: "Both add 1/5th the size of the health or mana of the character, depending on the potion used."
 *   -> 1/5 of maximum health or mana (numbers-table: "size" read as maximum [DERIVED]).
 * Doc: "The teleport takes 3 seconds." -> TELEPORT_SECONDS.
 * Excluded (NEEDS JOSEPH): potion price/limits/cooldown, teleport interruption/cooldown
 * (the repo's existing move/hit interruption is kept unchanged).
 */
export const TELEPORT_SECONDS = 3;

export function potionAmount(max: number): number {
  return Math.round(max / 5);
}

export function tryPotion(sim: Sim, kind: PotionKind): void {
  const hero = player(sim);
  if (!hero.alive) return;
  if (sim.potions[kind] <= 0) {
    banner(sim, kind === 'health' ? 'No health potions.' : 'No mana potions.');
    return;
  }
  if (kind === 'health') {
    if (hero.hp >= hero.maxHp - 0.5) {
      banner(sim, 'Already at full life.');
      return;
    }
    const heal = potionAmount(hero.maxHp);
    hero.hp = Math.min(hero.maxHp, hero.hp + heal);
    floater(sim, hero.x, hero.y - 30, `+${heal}`, '#8dce86');
  } else {
    if (hero.mana >= hero.maxMana - 0.5) {
      banner(sim, 'Already at full mana.');
      return;
    }
    const restore = potionAmount(hero.maxMana);
    hero.mana = Math.min(hero.maxMana, hero.mana + restore);
    floater(sim, hero.x, hero.y - 30, `+${restore}`, '#8eb7e8');
  }
  sim.potions[kind] -= 1;
  sfx(sim, 'potion');
}

export function tryUpgrade(sim: Sim, id: string): boolean {
  const def = sim.classDef.skills.find((skill) => skill.id === id);
  if (!def) return false;
  const rank = sim.skillRanks[id] ?? 0;
  if (rank >= def.maxRank) return false;
  if (sim.level < def.unlockLevel) {
    banner(sim, `${def.name} unlocks at level ${def.unlockLevel}.`);
    return false;
  }
  for (const req of def.prereqs) {
    if ((sim.skillRanks[req] ?? 0) < 1) {
      const name = sim.classDef.skills.find((skill) => skill.id === req)?.name ?? req;
      banner(sim, `${def.name} requires ${name}.`);
      return false;
    }
  }
  if (sim.skillPoints <= 0) {
    banner(sim, 'No skill points.');
    return false;
  }
  sim.skillRanks[id] = rank + 1;
  sim.skillPoints -= 1;
  if (rank === 0) fillEmptyBelt(sim);
  recomputeHero(sim);
  banner(sim, `${def.name} is rank ${rank + 1}.`);
  sfx(sim, 'level');
  return true;
}

export function trySpendAttribute(sim: Sim, key: 'str' | 'dex' | 'vit' | 'energy'): void {
  if (sim.statPoints <= 0) {
    banner(sim, 'No stat points.');
    return;
  }
  sim.attributes[key] += 1;
  sim.statPoints -= 1;
  recomputeHero(sim);
  sfx(sim, 'level');
}

const BELT_KEYS = ['Q', 'W', 'E', 'R'];

export function tryAssignBelt(sim: Sim, id: string, slot: number): void {
  const def = sim.classDef.skills.find((skill) => skill.id === id);
  if (!def || slot < 0 || slot > 3) return;
  if (sim.level < def.unlockLevel) {
    banner(sim, `${def.name} unlocks at level ${def.unlockLevel}.`);
    return;
  }
  if ((sim.skillRanks[def.id] ?? 0) < 1) {
    banner(sim, `${def.name} needs a skill point before it can be equipped.`);
    return;
  }
  const from = sim.belt.indexOf(id);
  if (from === slot) return;
  if (from >= 0) {
    const displaced = sim.belt[slot] ?? '';
    sim.belt[slot] = id;
    sim.belt[from] = displaced;
  } else {
    sim.belt[slot] = id;
  }
  banner(sim, `${def.name} is on ${BELT_KEYS[slot]}.`);
}

