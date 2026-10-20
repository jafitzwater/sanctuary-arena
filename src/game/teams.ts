import { playableIds } from './data/classes/roster';
import { Rng } from './math';

export interface Seat {
  classId: string;
  name: string;
  tint: string;
  lane: number;
}

const ALLY_NAMES = ['Qual-Kehk', 'Larzuk', 'Anya', 'Malah'];
const ENEMY_NAMES = ['Korlic', 'Madawc', 'Talic', 'Bartuc', 'Toorc'];
const TINTS = ['#c4a574', '#8aa0b8', '#7d9a6a', '#b88898', '#d0b070', '#a07058', '#6a8a9a', '#c47858', '#9a7a4a'];

/**
 * Four allied heroes and five enemies. Classes are drawn from the playable
 * roster with no duplicates until the roster runs out. Today only the
 * Barbarian is playable, so empty seats reuse that kit under another name.
 */
export function dealTeams(seed: number, playerClass: string): { allies: Seat[]; enemies: Seat[] } {
  const rng = new Rng(seed);
  const enabled = playableIds();
  const pool = enabled.length ? enabled : ['barbarian'];
  return {
    allies: seats(4, pool.filter((id) => id !== playerClass), pool, ALLY_NAMES, [0, 1, 2, 1], rng),
    enemies: seats(5, pool, pool, ENEMY_NAMES, [0, 1, 2, 0, 2], rng),
  };
}

function seats(count: number, preferred: string[], fallback: string[], names: string[], lanes: number[], rng: Rng): Seat[] {
  const source = preferred.length ? preferred : fallback;
  const order = shuffle(source, rng);
  const picked: string[] = [];
  for (let i = 0; i < count; i++) picked.push(order[i] ?? source[i % source.length]);
  return picked.map((classId, index) => ({
    classId,
    name: names[index] ?? `Hero ${index + 1}`,
    tint: TINTS[(index + names.length) % TINTS.length],
    lane: lanes[index] ?? index % 3,
  }));
}

function shuffle(list: string[], rng: Rng): string[] {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    const swap = copy[i];
    copy[i] = copy[j];
    copy[j] = swap;
  }
  return copy;
}
