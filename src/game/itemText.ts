/**
 * Batch 2 C2 [t227u]: real numbers for the stats line and the shop item texts, from the viewing class.
 * Display only: every number comes from heroNumbers / itemGate, nothing here changes a stat.
 */
import { heroNumbers } from './combat';
import { itemGate, potionCap, type ItemDef } from './data/items';
import type { Loadout, Sim } from './types';

export interface CombatNumbers {
  ad: number;
  armor: number;
  attackInterval: number;
  attackRange: number;
}

/** Attacks per second, 2 decimals. */
export function attacksPerSecond(interval: number): string {
  return (1 / Math.max(0.01, interval)).toFixed(2);
}

/** The stats line: damage, armor, attack speed and attack range. */
export function combatStatsText(n: CombatNumbers): string {
  return `AD ${Math.round(n.ad)} · Armor ${Math.round(n.armor)} · AS ${attacksPerSecond(n.attackInterval)}/s · Range ${Math.round(n.attackRange)}`;
}

/** Item descriptions carry Barbarian strength gates; the real per-class gate is written by itemShopText instead. */
export function flavourOf(description: string): string {
  return description
    .replace(/\s*(No strength requirement|Requires [^.]*)\.?/g, '')
    .trim();
}

function requirementText(reqStr: number, reqDex: number): string {
  const parts = [reqStr ? `${reqStr} strength` : '', reqDex ? `${reqDex} dexterity` : ''].filter(Boolean);
  return parts.length ? `Requires ${parts.join(' and ')}.` : 'No requirement.';
}

function change(label: string, before: string, after: string): string {
  return before === after ? `${label} ${after}` : `${label} ${before} → ${after}`;
}

/**
 * Shop text for one item: flavour, then the real before → after numbers for this hero, then this class's gate.
 * `before`/`after` are the viewing hero's numbers without and with the item; `pools` feeds the potion texts.
 */
export function itemShopText(
  item: ItemDef,
  classId: string,
  before: CombatNumbers,
  after: CombatNumbers,
  pools: { maxHp: number; maxMana: number; potionCap: number; potionCapAfter: number },
): string {
  const parts: string[] = [];
  const flavour = flavourOf(item.description);
  if (item.consumable === 'health') return `Drink to restore 1/5 of your life (${Math.round(pools.maxHp / 5)} of ${Math.round(pools.maxHp)}).`;
  if (item.consumable === 'mana') return `Drink to restore 1/5 of your mana (${Math.round(pools.maxMana / 5)} of ${Math.round(pools.maxMana)}).`;
  if (flavour && !/^(Carry \d|\+\d)/.test(flavour)) parts.push(/[.!]$/.test(flavour) ? flavour : `${flavour}.`);
  if (item.slot === 'weapon') {
    parts.push(`+${item.ad ?? item.adOne ?? 0} attack damage (${change('AD', String(before.ad), String(after.ad))}).`);
    parts.push(`${change('Attack speed', `${attacksPerSecond(before.attackInterval)}/s`, `${attacksPerSecond(after.attackInterval)}/s`)}.`);
    parts.push(`${change('Range', String(before.attackRange), String(after.attackRange))}.`);
  }
  if (item.armor) parts.push(`+${item.armor} armor (${change('Armor', String(before.armor), String(after.armor))}).`);
  if (item.potionSlots) parts.push(`Carry ${pools.potionCapAfter} health and ${pools.potionCapAfter} mana potions (now ${pools.potionCap}).`);
  const gate = itemGate(item, classId);
  parts.push(requirementText(gate.reqStr, gate.reqDex));
  return parts.join(' ');
}

function slotKey(item: ItemDef): keyof Loadout | null {
  return item.slot === 'weapon' || item.slot === 'armor' || item.slot === 'helm' || item.slot === 'belt' ? item.slot : null;
}

/** Shop text for `item` as seen by this sim's hero (its class, level, attributes, current gear). */
export function shopTextFor(sim: Sim, item: ItemDef, timers = { bo: false, berserk: false }): string {
  const before = heroNumbers(sim, timers);
  const key = slotKey(item);
  const after = key ? heroNumbers({ ...sim, loadout: { ...sim.loadout, [key]: item.id } }, timers) : before;
  return itemShopText(item, sim.classDef.id, before, after, {
    maxHp: before.hp,
    maxMana: before.mana,
    potionCap: potionCap(sim.loadout.belt),
    potionCapAfter: item.slot === 'belt' ? potionCap(item.id) : potionCap(sim.loadout.belt),
  });
}
