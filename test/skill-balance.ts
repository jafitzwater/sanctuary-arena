// Skill follow-ups order (2026-10-29) item 4 [JOSEPH t221u]: "best choice for scale and balance" for
// Lightning, Fire Blast, Blood Splash and Strafe. Values are [TEMP]; this test keeps them in a band
// against each class's other damage skills so no skill is clearly dominant.
//
// Metrics per rank (r = 1..3), in AD multiples:
//   single  = damage multiplier on one foe / cooldown        (damage per second of cooldown, one foe)
//   group   = multiplier x min(foes hit, 3) / cooldown        (a 3-foe wave fight; area = 3 foes)
//   perMana = multiplier / mana % of max mana                 (damage per mana; mana is the shared % rule,
//             so within a class every skill costs the same at a rank and this is a pure multiplier ratio)
// Band: each new skill's single and group values are within [BAND_LO, BAND_HI] x the mean of its class's
// other damage skills at the same rank, and its perMana within [MANA_LO, MANA_HI] x theirs.
// Top tiers (Blood Splash, Strafe) unlock at 9 and may sit higher, but stay inside the same band.
import assert from 'node:assert/strict';
import { manaPct } from '../src/game/combat';
import { amazon } from '../src/game/data/classes/amazon';
import { necromancer } from '../src/game/data/classes/necromancer';
import { sorceress } from '../src/game/data/classes/sorceress';
import type { ClassDef } from '../src/game/data/classes/types';
import { STRAFE } from '../src/game/skills/amazon';
import { BLOOD_SPLASH, SPEAR, SPIRIT, TEETH } from '../src/game/skills/necromancer';
import { FIRE_BLAST, LIGHTNING } from '../src/game/skills/sorceress';

export const BAND_LO = 0.5;
export const BAND_HI = 1.7;
export const MANA_LO = 0.5;
export const MANA_HI = 1.5;

type Row = { id: string; mult: number; perRank: number; foes: (rank: number) => number };
// Literal multipliers mirror the handlers in src/game/skills/* (unchanged by this order).
const KITS: [ClassDef, Row[]][] = [
  [sorceress, [
    { id: 'ice-bolt', mult: 1.1, perRank: 0.1, foes: () => 1 },
    { id: 'lightning', ...LIGHTNING, foes: () => 1 },
    { id: 'fire-blast', ...FIRE_BLAST, foes: () => 3 },
    { id: 'blizzard', mult: 1.2, perRank: 0.15, foes: () => 3 },
  ]],
  [necromancer, [
    { id: 'teeth', mult: TEETH.mult, perRank: TEETH.perRank, foes: (r) => TEETH.base + r },
    { id: 'bone-spear', ...SPEAR, foes: () => 1 },
    { id: 'bone-spirit', ...SPIRIT, foes: () => 1 },
    { id: 'blood-splash', ...BLOOD_SPLASH, foes: () => 3 },
  ]],
  [amazon, [
    { id: 'magic-arrow', mult: 1.2, perRank: 0.1, foes: () => 1 },
    { id: 'multi-shot', mult: 0.6, perRank: 0.08, foes: (r) => 2 + r },
    { id: 'ice-shot', mult: 1.0, perRank: 0.1, foes: () => 1 },
    { id: 'fire-shot', mult: 1.4, perRank: 0.15, foes: () => 1 },
    { id: 'strafe', mult: STRAFE.mult, perRank: STRAFE.perRank, foes: () => STRAFE.targets },
  ]],
];
const NEW = ['lightning', 'fire-blast', 'blood-splash', 'strafe'];

function metrics(def: ClassDef, row: Row, rank: number) {
  const skill = def.skills.find((s) => s.id === row.id)!;
  assert.ok(skill, `${row.id} in ${def.id}`);
  const mult = row.mult + (rank - 1) * row.perRank;
  return {
    mult,
    single: mult / skill.cooldown,
    group: (mult * Math.min(row.foes(rank), 3)) / skill.cooldown,
    perMana: mult / manaPct(rank, skill.manaStep ?? 0.05),
  };
}
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

const table: string[] = [];
let checked = 0;
for (const [def, rows] of KITS) {
  for (const row of rows) {
    if (!NEW.includes(row.id)) continue;
    const skill = def.skills.find((s) => s.id === row.id)!;
    assert.equal(skill.maxRank, 3, `${row.id} max rank 3`);
    for (let rank = 1; rank <= 3; rank++) {
      const me = metrics(def, row, rank);
      const sib = rows.filter((r) => r !== row).map((r) => metrics(def, r, rank));
      const rs = me.single / mean(sib.map((s) => s.single));
      const rg = me.group / mean(sib.map((s) => s.group));
      const rm = me.perMana / mean(sib.map((s) => s.perMana));
      table.push(`${row.id} r${rank}: x${me.mult.toFixed(2)} cd ${skill.cooldown} single ${rs.toFixed(2)} group ${rg.toFixed(2)} perMana ${rm.toFixed(2)}`);
      assert.ok(rs >= BAND_LO && rs <= BAND_HI, `${row.id} r${rank} single ${rs.toFixed(2)} in band`);
      assert.ok(rg >= BAND_LO && rg <= BAND_HI, `${row.id} r${rank} group ${rg.toFixed(2)} in band`);
      assert.ok(rm >= MANA_LO && rm <= MANA_HI, `${row.id} r${rank} perMana ${rm.toFixed(2)} in band`);
      checked++;
    }
  }
}
assert.equal(checked, 12, 'four skills x ranks 1-3');
// Exact [TEMP] values chosen by the order (cooldowns from the class data).
assert.deepEqual([LIGHTNING.mult, LIGHTNING.perRank, sorceress.skills.find((s) => s.id === 'lightning')!.cooldown], [1.3, 0.13, 7]);
assert.deepEqual([FIRE_BLAST.mult, FIRE_BLAST.perRank, FIRE_BLAST.radius, sorceress.skills.find((s) => s.id === 'fire-blast')!.cooldown], [1.4, 0.15, 100, 11]);
assert.deepEqual([BLOOD_SPLASH.mult, BLOOD_SPLASH.perRank, BLOOD_SPLASH.radius, necromancer.skills.find((s) => s.id === 'blood-splash')!.cooldown], [1.7, 0.2, 110, 12]);
assert.deepEqual([STRAFE.mult, STRAFE.perRank, STRAFE.targets, amazon.skills.find((s) => s.id === 'strafe')!.cooldown], [0.9, 0.1, 5, 11]);
if (process.env.BALANCE_TABLE) console.log(table.join('\n'));
console.log('skill-balance: ok');
