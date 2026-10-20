import { itemById, potionItem, POTION_CAP, type ItemDef, type PotionKind } from './data/items';
import type { SkillDef } from './data/classes/types';
import { dist } from './math';
import { player } from './query';
import type { Fx, Sim, Unit } from './types';

export const MAX_LEVEL = 10;

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

export function pushFx(sim: Sim, fx: Fx): void {
  sim.fx.push(fx);
  if (sim.fx.length > 80) sim.fx.splice(0, sim.fx.length - 80);
}

export function floater(sim: Sim, x: number, y: number, text: string, color: string): void {
  pushFx(sim, { kind: 'text', x, y, text, color, life: 0.9, t: 0, r: 0, vy: -38 });
}

export function ring(sim: Sim, x: number, y: number, r: number, color: string): void {
  pushFx(sim, { kind: 'ring', x, y, r, color, life: 0.4, t: 0 });
}

export function manaCost(def: SkillDef, rank: number): number {
  const raw = def.mana + def.manaPerRank * Math.max(0, rank - 1);
  return Math.max(def.minMana, Math.round(raw));
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
    sim.statPoints += stats.statPointsPerLevel;
    gained = true;
  }
  if (sim.level >= MAX_LEVEL) sim.xp = 0;
  if (gained) {
    recomputeHero(sim);
    const hero = player(sim);
    hero.hp = Math.min(hero.maxHp, hero.hp + hero.maxHp * 0.08);
    banner(sim, `Level ${sim.level} — skill and stat points were gained`);
    sfx(sim, 'level');
  }
}

export function damageUnit(sim: Sim, target: Unit, amount: number, attacker: Unit | null): void {
  if (!target.alive || target.invuln > 0 || sim.phase !== 'playing') return;
  const armor = target.armor + (target.buffT > 0 ? target.buffArmor : 0);
  const dealt = mitigated(amount, armor);
  target.hp -= dealt;
  target.hitFlash = 0.12;
  target.combat = 4;
  if (attacker) attacker.combat = 4;
  floater(sim, target.x, target.y - target.radius - 8, String(Math.round(dealt)), '#f4efe4');
  if (target.id === sim.playerId) sfx(sim, 'hurt');
  else if (attacker?.id === sim.playerId && attacker.whirlT <= 0) sfx(sim, 'swing');
  if (target.hp <= 0) kill(sim, target, attacker);
}

export function kill(sim: Sim, unit: Unit, killer: Unit | null): void {
  if (!unit.alive) return;
  unit.alive = false;
  unit.hp = 0;
  unit.leap = null;
  unit.whirlT = 0;
  unit.targetId = null;
  if (unit.kind === 'minion') unit.corpse = 4.5;
  if (unit.kind === 'champion') {
    unit.respawn = unit.id === sim.playerId ? 5 + sim.level * 1.35 : 14;
    if (unit.id === sim.playerId) {
      sim.deaths += 1;
      banner(sim, 'You have been slain');
      sfx(sim, 'death');
    } else {
      banner(sim, `${unit.name} has fallen`);
      sfx(sim, 'death');
    }
  }
  if (unit.kind === 'tower') {
    banner(sim, `${unit.name} has fallen`);
    sfx(sim, 'tower');
    sim.shake = Math.max(sim.shake, 8);
  }
  if (unit.kind === 'base') {
    sim.phase = unit.team === 'enemy' ? 'victory' : 'defeat';
    banner(
      sim,
      sim.phase === 'victory' ? "Andariel's altar falls silent" : 'The Rogue Encampment has fallen',
      6,
    );
    sfx(sim, sim.phase === 'victory' ? 'win' : 'lose');
    sim.shake = 14;
  }

  if (unit.team !== 'enemy') return;
  const hero = player(sim);
  const playerKill = killer?.id === sim.playerId;
  const structure = unit.kind === 'tower' || unit.kind === 'base';
  if (playerKill) {
    award(sim, unit);
    if (unit.kind === 'minion') sim.cs += 1;
    if (unit.kind === 'champion') sim.kills += 1;
  } else if (structure && killer && killer.team === 'ally') {
    award(sim, unit);
  } else if (hero.alive && dist(hero, unit) < 700) {
    grantXp(sim, Math.round(unit.xp * 0.55));
  }
}

function award(sim: Sim, unit: Unit): void {
  const hero = player(sim);
  let gold = unit.gold;
  if (hero.findGold > 0 && unit.kind === 'minion') {
    gold += hero.findGold;
    hero.findGold = 0;
  }
  sim.gold += gold;
  grantXp(sim, unit.xp);
  floater(sim, unit.x, unit.y - 24, `+${gold}`, '#e6c864');
  sfx(sim, 'coin');
}

const MASTERY: Record<string, string> = {
  swor: 'sword-mastery',
  axe: 'axe-mastery',
  taxe: 'axe-mastery',
  mace: 'mace-mastery',
  club: 'mace-mastery',
  hamm: 'mace-mastery',
  pole: 'pole-arm-mastery',
  spea: 'spear-mastery',
  tkni: 'throwing-mastery',
  jave: 'throwing-mastery',
};

function masteryMul(sim: Sim, type: string): number {
  const ids = [MASTERY[type]];
  if (type === 'taxe' || type === 'tkni' || type === 'jave') ids.push('throwing-mastery');
  let best = 0;
  for (const id of ids) {
    if (!id) continue;
    best = Math.max(best, sim.skillRanks[id] ?? 0);
  }
  return 1 + best * 0.06;
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
  let ad = stats.ad + extraStr * stats.adPerStr;
  let armor = stats.armor + extraDex * stats.armorPerDex;
  let move = stats.moveSpeed;
  let interval = stats.attackInterval;
  let range = stats.attackRange;
  let wclass = 'HTH';

  const main = sim.loadout.weapon ? itemById(sim.loadout.weapon) : undefined;
  const off = sim.loadout.offhand ? itemById(sim.loadout.offhand) : undefined;
  const wieldTwo = !!main?.twoHanded && (!main.oneOrTwo || !off);
  if (main) {
    const weaponAd = wieldTwo ? (main.ad ?? 0) : (main.adOne || main.ad || 0);
    ad += weaponAd * masteryMul(sim, main.weaponType ?? '');
    wclass = (wieldTwo ? main.wclass2 || main.wclass : main.wclass) || '1HS';
    interval = swingTime(main.speed ?? 0);
    if (wieldTwo && (wclass === 'STF' || wclass === '2HT')) range = 96;
  }
  if (off?.slot === 'weapon') {
    const offAd = off.adOff || Math.round((off.adOne || off.ad || 0) * 0.5);
    ad += offAd * masteryMul(sim, off.weaponType ?? '');
    interval = Math.max(interval, swingTime(off.speed ?? 0));
  } else if (off?.slot === 'shield') {
    armor += off.armor ?? 0;
  }
  for (const id of [sim.loadout.armor, sim.loadout.helm, sim.loadout.belt]) {
    if (!id) continue;
    const piece = itemById(id);
    if (!piece) continue;
    armor += piece.armor ?? 0;
    hp += piece.hp ?? 0;
    mana += piece.mana ?? 0;
  }

  const speedRank = sim.skillRanks['increased-speed'] ?? 0;
  move *= 1 + speedRank * 0.035;
  interval *= 1 - Math.min(0.2, speedRank * 0.02);
  interval *= 1 - Math.min(0.15, Math.max(0, extraDex) * 0.004);
  armor += (sim.skillRanks['iron-skin'] ?? 0) * 3;
  armor += sim.skillRanks['natural-resistance'] ?? 0;

  if (timers.bo) {
    const rank = Math.max(1, sim.skillRanks['battle-orders'] ?? 1);
    const mul = 1.12 + rank * 0.03;
    hp *= mul;
    mana *= mul;
  }
  if (timers.berserk) armor *= 0.25;

  return {
    hp: Math.max(1, Math.round(hp)),
    mana: Math.max(0, Math.round(mana)),
    ad: Math.max(1, Math.round(ad)),
    armor: Math.round(armor),
    moveSpeed: move,
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
  const needStr = item.reqStr ?? 0;
  const needDex = item.reqDex ?? 0;
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

function equipWeapon(sim: Sim, item: ItemDef): boolean {
  const main = sim.loadout.weapon ? itemById(sim.loadout.weapon) : undefined;
  const off = sim.loadout.offhand ? itemById(sim.loadout.offhand) : undefined;
  const exclusive = !!item.twoHanded && !item.oneOrTwo;
  if (exclusive) {
    if (sim.loadout.weapon === item.id && !off) {
      banner(sim, 'Already equipped.');
      return false;
    }
    sim.loadout.weapon = item.id;
    sim.loadout.offhand = null;
    return true;
  }
  if (!main) {
    sim.loadout.weapon = item.id;
    return true;
  }
  const mainLocks = !!main.twoHanded && !main.oneOrTwo;
  if (mainLocks) {
    sim.loadout.weapon = item.id;
    sim.loadout.offhand = null;
    return true;
  }
  if (!off) {
    sim.loadout.offhand = item.id;
    return true;
  }
  sim.loadout.weapon = item.id;
  return true;
}

function equipShield(sim: Sim, item: ItemDef): boolean {
  const main = sim.loadout.weapon ? itemById(sim.loadout.weapon) : undefined;
  if (main?.twoHanded && !main.oneOrTwo) {
    banner(sim, 'A two-handed weapon leaves no hand free.');
    return false;
  }
  if (sim.loadout.offhand === item.id) {
    banner(sim, 'Already equipped.');
    return false;
  }
  sim.loadout.offhand = item.id;
  return true;
}

export function tryBuy(sim: Sim, id: string): void {
  const item = itemById(id);
  if (!item) return;
  const hero = player(sim);
  if (hero.alive && !inShopRange(sim, hero)) {
    banner(sim, 'Akara trades only inside the Rogue Encampment.');
    return;
  }
  if (sim.gold < item.cost) {
    banner(sim, 'Not enough gold.');
    return;
  }
  if (item.consumable) {
    const kind = item.consumable;
    if (sim.potions[kind] >= POTION_CAP) {
      banner(sim, 'You cannot carry any more of those.');
      return;
    }
    sim.gold -= item.cost;
    sim.potions[kind] += 1;
    sfx(sim, 'coin');
    banner(sim, `Bought ${item.name}.`);
    return;
  }
  if (!meetsReq(sim, item)) return;
  let equipped = false;
  if (item.slot === 'weapon') equipped = equipWeapon(sim, item);
  else if (item.slot === 'shield') equipped = equipShield(sim, item);
  else if (item.slot === 'armor' || item.slot === 'helm' || item.slot === 'belt') {
    if (sim.loadout[item.slot] === item.id) {
      banner(sim, 'Already equipped.');
      return;
    }
    sim.loadout[item.slot] = item.id;
    equipped = true;
  }
  if (!equipped) return;
  sim.gold -= item.cost;
  recomputeHero(sim);
  sfx(sim, 'coin');
  banner(sim, `Bought ${item.name}.`);
}

export function tryPotion(sim: Sim, kind: PotionKind): void {
  const hero = player(sim);
  if (!hero.alive) return;
  if (sim.potions[kind] <= 0) {
    banner(sim, kind === 'health' ? 'No health potions.' : 'No mana potions.');
    return;
  }
  const item = potionItem(kind);
  if (kind === 'health') {
    if (hero.hp >= hero.maxHp - 0.5) {
      banner(sim, 'Already at full life.');
      return;
    }
    hero.hp = Math.min(hero.maxHp, hero.hp + (item.heal ?? 0));
    floater(sim, hero.x, hero.y - 30, `+${item.heal ?? 0}`, '#8dce86');
  } else {
    if (hero.mana >= hero.maxMana - 0.5) {
      banner(sim, 'Already at full mana.');
      return;
    }
    hero.mana = Math.min(hero.maxMana, hero.mana + (item.restoreMana ?? 0));
    floater(sim, hero.x, hero.y - 30, `+${item.restoreMana ?? 0}`, '#8eb7e8');
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
  if (def.passive) {
    banner(sim, `${def.name} is passive.`);
    return;
  }
  if ((sim.skillRanks[id] ?? 0) <= 0) {
    banner(sim, `Learn ${def.name} before belting it.`);
    return;
  }
  sim.belt = sim.belt.map((entry) => (entry === id ? '' : entry));
  sim.belt[slot] = id;
  banner(sim, `${def.name} is on ${BELT_KEYS[slot]}.`);
}

