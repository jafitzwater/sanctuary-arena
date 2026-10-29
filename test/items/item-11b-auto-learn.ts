// Pass 3 order item 4 [JOSEPH]: each skill is auto-learned at rank 1 at its kit level; extra
// skill points stay manual; nothing past rank 1 is spent for the player. All five classes.
// Only the Barbarian has a ClassDef; the other four use test kits with the unlock levels from
// kits-final.md (first listed path; their fifth skill has no stated level, so it is left out).
import assert from 'node:assert/strict';
import { barbarian } from '../../src/game/data/classes/barbarian';
import type { ClassDef } from '../../src/game/data/classes/types';
import { sanctuary } from '../../src/game/data/acts/sanctuary';
import { grantXp, MAX_LEVEL, tryUpgrade, xpToNext } from '../../src/game/combat';
import { createMatch } from '../../src/game/sim';

function kit(id: string, names: string[]): ClassDef {
  const levels = [1, 3, 5, 7];
  return {
    ...barbarian,
    id,
    name: id,
    skills: names.map((name, i) => ({ ...barbarian.skills[i], id: `${id}-${i}`, name, unlockLevel: levels[i], starter: i === 0 })),
  };
}
const classes: ClassDef[] = [
  barbarian, // bash 1, shout 3, leap 5, battle orders 7, whirlwind (ult) 5
  kit('amazon', ['Jab', 'Charged strike', 'Poison strike', 'Multi strike']),
  kit('necromancer', ['Teeth', 'Bone spear', 'Bone armor', 'Bone spirit']),
  kit('paladin', ['Zeal', 'Smite', 'Charge', 'Holy shield']),
  kit('sorceress', ['Ice bolt', 'Frozen nova', 'Blizzard', 'Frozen orb']),
];
// Economy order [JOSEPH]: the ult (top tier) unlocks at 5 (was 10).
assert.deepEqual(barbarian.skills.map((s) => s.unlockLevel), [1, 3, 5, 7, 5], 'barbarian kit levels incl. the ult');

for (const def of classes) {
  const sim = createMatch(sanctuary, def, 1);
  const rank = (i: number) => sim.skillRanks[def.skills[i].id] ?? 0;
  assert.equal(rank(0), 1, `${def.id}: level-1 skill learned at start`);
  assert.equal(sim.skillPoints, 0);
  for (let lv = 2; lv <= MAX_LEVEL; lv++) {
    grantXp(sim, xpToNext(sim.level));
    assert.equal(sim.level, lv);
    def.skills.forEach((s, i) =>
      assert.equal(rank(i), lv >= s.unlockLevel ? 1 : 0, `${def.id} L${lv}: ${s.name} rank (unlock ${s.unlockLevel})`),
    );
    const autoLearned = def.skills.filter((s) => s.unlockLevel > 1 && s.unlockLevel <= lv).length;
    assert.equal(sim.skillPoints, lv - 1 - autoLearned, `${def.id} L${lv}: unspent points accrue`);
  }
  assert.ok(sim.skillPoints > 0, `${def.id}: spare points left for manual use`);
  // Extra points are manual: spending is only through tryUpgrade.
  const before = sim.skillPoints;
  assert.ok(tryUpgrade(sim, def.skills[0].id));
  assert.equal(rank(0), 2);
  assert.equal(sim.skillPoints, before - 1);
  // Every learned skill sits on the belt when a slot is free.
  assert.ok(sim.belt.filter(Boolean).length >= Math.min(4, def.skills.length));
}

// Multi-level jump learns everything due at once.
const jump = createMatch(sanctuary, barbarian, 1);
grantXp(jump, 1e7);
assert.ok(barbarian.skills.every((s) => jump.skillRanks[s.id] === 1));
assert.equal(jump.skillPoints, 14 - 4);
