import monsters from '../d2/monsters-act1.json';
import type { ActDef } from './types';

const raven = monsters.find((entry) => entry.monId === 'bloodraven');
if (!raven) throw new Error('Blood Raven missing from MonStats import');

/**
 * Act I — the road from the Rogue Encampment across the Blood Moor
 * to Andariel's altar in the Catacombs.
 *
 * Towers sit on the lane polyline so minions walk into them. The plaza
 * radii cover the shop, and the inner towers overlap those yards so the
 * base cannot be walked around through the trees.
 */
export const act1: ActDef = {
  id: 'act1',
  actNumber: 1,
  name: 'Blood Moor',
  subtitle: 'Rogue Encampment to the Catacombs',
  width: 4600,
  height: 1560,
  laneWidth: 200,
  jungle: 130,
  plaza: 420,
  shopRadius: 390,
  fountainRadius: 320,
  lane: [
    { x: 430, y: 820 },
    { x: 1050, y: 760 },
    { x: 1750, y: 920 },
    { x: 2450, y: 740 },
    { x: 3200, y: 880 },
    { x: 4080, y: 800 },
  ],
  playerBase: {
    name: 'Rogue Encampment',
    x: 260,
    y: 820,
    hp: 1108,
    ad: 16,
    armor: 20,
    attackRange: 240,
    attackInterval: 1.15,
    radius: 74,
    gold: 280,
    xp: 180,
  },
  enemyBase: {
    name: "Andariel's Altar",
    x: 4340,
    y: 800,
    hp: 1108,
    ad: 18,
    armor: 20,
    attackRange: 250,
    attackInterval: 1.1,
    radius: 74,
    gold: 280,
    xp: 180,
  },
  towers: [
    { team: 'ally', tier: 1, x: 604, y: 803, name: 'Encampment Watch' },
    { team: 'ally', tier: 2, x: 1386, y: 837, name: 'Moor Outpost' },
    { team: 'enemy', tier: 2, x: 2765, y: 799, name: 'Crypt Gate' },
    { team: 'enemy', tier: 1, x: 3830, y: 822, name: 'Catacomb Watch' },
  ],
  waves: {
    interval: 22,
    first: 8,
    ally: [
      { unit: 'rogue', count: 3 },
      { unit: 'rogue-archer', count: 1 },
    ],
    enemy: [
      { unit: 'fallen', count: 2 },
      { unit: 'zombie', count: 1 },
      { unit: 'quillrat', count: 1 },
    ],
  },
  enemyChampion: {
    name: 'Blood Raven',
    title: 'The Corrupted Sister',
    hp: 298,
    ad: 13,
    armor: raven.moba.armor,
    moveSpeed: 93,
    attackRange: raven.moba.attackRange,
    attackInterval: raven.moba.attackInterval,
    projectileSpeed: raven.moba.projectileSpeed,
    radius: 20,
    gold: raven.moba.gold,
    xp: raven.moba.xp,
    color: '#6e2430',
    accent: '#e0c07a',
  },
  theme: {
    decor: 'act1-moor',
    ground: '#1a1612',
    groundDeep: '#100e0c',
    shoulder: '#2a241c',
    road: '#5a4634',
    roadEdge: '#3a2e22',
    ally: '#d4b46a',
    enemy: '#c44536',
    fog: '#2a120f',
  },
};
