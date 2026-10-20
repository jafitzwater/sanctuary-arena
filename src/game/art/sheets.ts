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
 * Barbarian whirl, leap, cast, get-hit, and death reuse these same sheets
 * (run, attack, or idle) so a state never swaps in an older drawing.
 * Fallen, zombie, and fallen shaman walk the same way. The quill rat has no
 * sheet here — the plain rat sheet is not used — so quillrat.webp is drawn
 * in the Act I browns. ground.webp is 4 variants by 6 rows of 160×80 diamonds:
 * grass, shoulder, path, town, pale stone, dark.
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
  fence: [fence0, fence1],
  tent: [tent0, tent1, tent2],
  stone: [stone0, stone1],
};

/** Blood Raven has no supplied sheet. */
export const monsterSheets = {
  raven,
  ravenWalk,
};

export const TWO_HAND_WCLASS = new Set(['2HS', '2HT', 'STF']);
