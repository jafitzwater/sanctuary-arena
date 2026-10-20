import { itemById, potionItem, POTION_CAP, type ItemDef, type PotionKind } from './data/items';
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

export function grantXp(sim: Sim, amount: number): void {
  if (amount <= 0 || sim.level >= MAX_LEVEL) return;
  sim.xp += amount;
  const hero = player(sim);
  const stats = sim.classDef.stats;
  let gained = false;
  while (sim.level < MAX_LEVEL && sim.xp >= xpToNext(sim.level)) {
    sim.xp -= xpToNext(sim.level);
    sim.level += 1;
    sim.skillPoints += 1;
    hero.maxHp += stats.hpPerLevel;
    hero.hp += stats.hpPerLevel;
    hero.maxMana += stats.manaPerLevel;
    hero.mana += stats.manaPerLevel;
    hero.ad += stats.adPerLevel;
    hero.armor += stats.armorPerLevel;
    hero.hp = Math.min(hero.maxHp, hero.hp + hero.maxHp * 0.08);
    gained = true;
  }
  if (sim.level >= MAX_LEVEL) sim.xp = 0;
  if (gained) {
    banner(sim, `Level ${sim.level} — a skill point was gained`);
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
  sim.gold += unit.gold;
  grantXp(sim, unit.xp);
  floater(sim, unit.x, unit.y - 24, `+${unit.gold}`, '#e6c864');
  sfx(sim, 'coin');
}

export function applyItemStats(hero: Unit, item: ItemDef, sign: 1 | -1): void {
  hero.ad += sign * (item.ad ?? 0);
  hero.armor += sign * (item.armor ?? 0);
  hero.maxHp += sign * (item.hp ?? 0);
  hero.hp += sign * (item.hp ?? 0);
  hero.maxMana += sign * (item.mana ?? 0);
  hero.mana += sign * (item.mana ?? 0);
  hero.hp = Math.max(1, Math.min(hero.maxHp, hero.hp));
  hero.mana = Math.max(0, Math.min(hero.maxMana, hero.mana));
}

export function inShopRange(sim: Sim, unit: Unit): boolean {
  return dist(unit, sim.map.playerBase) <= sim.map.shopRadius;
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
  if (item.slot === 'weapon') {
    if (sim.loadout.weapon === item.id) {
      banner(sim, 'Already equipped.');
      return;
    }
    if (sim.loadout.weapon) {
      const previous = itemById(sim.loadout.weapon);
      if (previous) applyItemStats(hero, previous, -1);
    }
    sim.loadout.weapon = item.id;
    applyItemStats(hero, item, 1);
  } else if (item.slot === 'armor' || item.slot === 'helm') {
    if (sim.loadout[item.slot]) {
      banner(sim, 'Already owned.');
      return;
    }
    sim.loadout[item.slot] = item.id;
    applyItemStats(hero, item, 1);
  }
  sim.gold -= item.cost;
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
  if (sim.skillPoints <= 0) {
    banner(sim, 'No skill points.');
    return false;
  }
  sim.skillRanks[id] = rank + 1;
  sim.skillPoints -= 1;
  banner(sim, `${def.name} is rank ${rank + 1}.`);
  sfx(sim, 'level');
  return true;
}

