import pr23Manifest from './pr23-manifest.json';
import raven from '../../assets/art/generated/blood-raven.png';
import ravenWalk from '../../assets/art/generated/blood-raven-walk.png';
import lightIdle from '../../assets/art/d2/barb-light-idle.webp';
import lightWalk from '../../assets/art/d2/barb-light-walk.webp';
import lightRun from '../../assets/art/d2/barb-light-run.webp';
import lightAttack from '../../assets/art/d2/barb-light-attack.webp';
import mediumIdle from '../../assets/art/d2/barb-medium-idle.webp';
import mediumWalk from '../../assets/art/d2/barb-medium-walk.webp';
import mediumRun from '../../assets/art/d2/barb-medium-run.webp';
import mediumAttack from '../../assets/art/d2/barb-medium-attack.webp';
import heavyIdle from '../../assets/art/d2/barb-heavy-idle.webp';
import heavyWalk from '../../assets/art/d2/barb-heavy-walk.webp';
import heavyRun from '../../assets/art/d2/barb-heavy-run.webp';
import heavyAttack from '../../assets/art/d2/barb-heavy-attack.webp';
import rogueMerc from '../../assets/art/d2/rogue.webp';
import akaraSheet from '../../assets/art/d2/akara.webp';
import ground from '../../assets/art/d2/ground.webp';
import tree0 from '../../assets/art/d2/tree0.webp';
import tree1 from '../../assets/art/d2/tree1.webp';
import tree2 from '../../assets/art/d2/tree2.webp';
import tree3 from '../../assets/art/d2/tree3.webp';
import tree4 from '../../assets/art/d2/tree4.webp';
import rock0 from '../../assets/art/d2/rock0.webp';
import rock1 from '../../assets/art/d2/rock1.webp';
import rock2 from '../../assets/art/d2/rock2.webp';
import fence0 from '../../assets/art/d2/fence0.webp';
import fence1 from '../../assets/art/d2/fence1.webp';
import fence2 from '../../assets/art/d2/fence2.webp';
import stump0 from '../../assets/art/d2/stump0.webp';
import stump1 from '../../assets/art/d2/stump1.webp';
import stump2 from '../../assets/art/d2/stump2.webp';
import wagon0 from '../../assets/art/d2/wagon0.webp';
import tent0 from '../../assets/art/d2/tent0.webp';
import tent1 from '../../assets/art/d2/tent1.webp';
import tent2 from '../../assets/art/d2/tent2.webp';
import stone0 from '../../assets/art/d2/stone0.webp';
import stone1 from '../../assets/art/d2/stone1.webp';
import fallenIdle from '../../assets/art/d2/fallen-idle.webp';
import fallenWalk from '../../assets/art/d2/fallen-walk.webp';
import zombieIdle from '../../assets/art/d2/zombie-idle.webp';
import zombieWalk from '../../assets/art/d2/zombie-walk.webp';
import shamanIdle from '../../assets/art/d2/shaman-idle.webp';
import shamanWalk from '../../assets/art/d2/shaman-walk.webp';
import quill from '../../assets/art/d2/quillrat.webp';
import banner from '../../assets/art/d2/banner.webp';

/**
 * Real Spriters Resource atlases. Eight direction rows, south then clockwise.
 * Run sheets keep the first 12 frames of each direction (the cycle that returns
 * to the start pose). Later blobs on that row are the next weapon group.
 * Barbarian whirl, leap, cast, get-hit, and death reuse these same sheets
 * (run, attack, or idle) so a state never swaps in an older drawing.
 * Fallen, zombie, and fallen shaman walk the same way. The quill rat has no
 * sheet here — the plain rat sheet is not used — so quillrat.webp is drawn
 * in the Act I browns. ground.webp is 4 variants by 7 rows of 160×80 diamonds:
 * grass, shoulder, path, town, pale stone, dark, then grass-to-dirt
 * transitions facing east, south, west, and north.
 */
export const d2Atlas = {
  light: { idle: lightIdle, walk: lightWalk, run: lightRun, attack: lightAttack },
  medium: { idle: mediumIdle, walk: mediumWalk, run: mediumRun, attack: mediumAttack },
  heavy: { idle: heavyIdle, walk: heavyWalk, run: heavyRun, attack: heavyAttack },
  fallen: { idle: fallenIdle, walk: fallenWalk },
  zombie: { idle: zombieIdle, walk: zombieWalk },
  shaman: { idle: shamanIdle, walk: shamanWalk },
  quill,
  rogue: rogueMerc,
  akara: akaraSheet,
  ground,
  banner,
};

/** Act I outdoor and town objects, keyed off magenta. No drawn stand-ins. */
export const actProps = {
  tree: [tree0, tree1, tree2, tree3, tree4],
  rock: [rock0, rock1, rock2],
  fence: [fence0, fence1, fence2],
  stump: [stump0, stump1, stump2],
  wagon: [wagon0],
  tent: [tent0, tent1, tent2],
  stone: [stone0, stone1],
};

/** Blood Raven has no supplied sheet. */
export const monsterSheets = {
  raven,
  ravenWalk,
};

export const TWO_HAND_WCLASS = new Set(['2HS', '2HT', 'STF']);

interface Pr23Entry {
  file: string;
  rows: number;
  cols: number;
  placeholder: boolean;
  missing?: string;
  gifFrames?: number;
  groundRow?: number;
  source?: string;
}

const pr23Files = import.meta.glob('../../assets/art/d2/pr23/*.webp', {
  eager: true,
  import: 'default',
}) as Record<string, string>;

const manifest = pr23Manifest as Record<string, Pr23Entry>;

function pr23Url(file: string): string {
  const hit = Object.entries(pr23Files).find(([path]) => path.endsWith(`/${file}`));
  if (!hit) throw new Error(`missing cut sheet ${file}`);
  return hit[1];
}

export interface FrameSheet {
  src: string;
  rows: number;
  cols: number;
}

export interface CastSheet {
  idle: FrameSheet;
  walk: FrameSheet;
  attack?: FrameSheet;
  placeholder: boolean;
  missing?: string;
  gifFrames?: number;
}

function frameOf(entry: Pr23Entry): FrameSheet {
  return { src: pr23Url(entry.file), rows: entry.rows, cols: entry.cols };
}

function must(key: string): Pr23Entry {
  const entry = manifest[key];
  if (!entry) throw new Error(`missing manifest entry ${key}`);
  return entry;
}

function castOf(stem: string): CastSheet {
  const walk = must(`${stem}-walk`);
  const idle = manifest[`${stem}-idle`] ?? walk;
  const attack = manifest[`${stem}-attack`];
  return {
    idle: frameOf(idle),
    walk: frameOf(walk),
    attack: attack ? frameOf(attack) : undefined,
    placeholder: Boolean(walk.placeholder || idle.placeholder),
    missing: walk.missing ?? idle.missing,
    gifFrames: walk.gifFrames,
  };
}

function singleOf(key: string): CastSheet {
  const entry = must(key);
  const frame = frameOf(entry);
  return {
    idle: frame,
    walk: frame,
    placeholder: entry.placeholder,
    missing: entry.missing,
  };
}

/** Cut PR #23 atlases. The hero's measured foot pivot is not in this set. */
export const pr23Cast = {
  rogue: castOf('minion-hero-basic-rogue'),
  guard: castOf('minion-hero-hard-guard'),
  valkyrie: singleOf('minion-hero-medium-valkyrie'),
  fallen: castOf('minion-enemy-basic-fallen'),
  goatman: castOf('minion-enemy-basic-goatman'),
  sandraider: castOf('minion-enemy-medium-sandraider'),
  blunderbore: castOf('minion-enemy-medium-blunderbore'),
  destruction: castOf('minion-enemy-hard-destruction'),
  bovine: castOf('minion-enemy-hard-bovine'),
  diablo: castOf('boss-herald-diablo'),
  duriel: castOf('boss-arena-duriel'),
  andariel: castOf('boss-arena-andariel'),
  heroPath: castOf('tower-hero-path'),
  enemyPath: castOf('tower-enemy-path'),
  heroBase: castOf('tower-hero-base'),
  enemyBase: castOf('tower-enemy-base'),
};

export const mephisto = {
  idle: frameOf(must('boss-herald-mephisto-idle-walk')),
  walk: frameOf(must('boss-herald-mephisto-walk-walk')),
  attack1: frameOf(must('boss-herald-mephisto-attack-1-walk')),
  attack2: frameOf(must('boss-herald-mephisto-attack-2-walk')),
  getHit: frameOf(must('boss-herald-mephisto-get-hit-walk')),
  death: frameOf(must('boss-herald-mephisto-death-walk')),
  die: frameOf(must('boss-herald-mephisto-die-walk')),
};

export const pr23Boulders = [0, 1, 2].map((index) => pr23Url(`boulder${index}.webp`));

/**
 * #FF00FF, near-magenta halos, the grey and teal sheet backdrops, and a flat
 * near-white backdrop. Black is left alone so outlines survive.
 */
export function isSheetMatte(r: number, g: number, b: number, a: number): boolean {
  if (a < 16) return true;
  if (g <= 110 && r > 170 && b > 120 && Math.min(r, b) - g > 70 && Math.abs(r - b) < 120) return true;
  if (Math.abs(r - 170) <= 4 && Math.abs(g - 170) <= 4 && Math.abs(b - 170) <= 4) return true;
  if (r < 18 && Math.abs(g - 128) <= 18 && Math.abs(b - 128) <= 18) return true;
  const chroma = Math.max(r, g, b) - Math.min(r, g, b);
  return chroma <= 12 && r >= 220 && g >= 220 && b >= 220;
}
