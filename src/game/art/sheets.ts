import raven from '../../assets/art/generated/blood-raven.png';
import ravenWalk from '../../assets/art/generated/blood-raven-walk.png';
import tent from '../../assets/art/props/tent.png';
import fire from '../../assets/art/props/fire.png';
import wall from '../../assets/art/props/wall.png';
import tower from '../../assets/art/props/watchtower.png';
import altar from '../../assets/art/props/andariel.png';
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
import townFloor from '../../assets/art/d2/town-floor.webp';
import outdoorFloor from '../../assets/art/d2/outdoor-floor.webp';
import fallenIdle from '../../assets/art/d2/fallen-idle.webp';
import fallenWalk from '../../assets/art/d2/fallen-walk.webp';
import zombieIdle from '../../assets/art/d2/zombie-idle.webp';
import zombieWalk from '../../assets/art/d2/zombie-walk.webp';
import shamanIdle from '../../assets/art/d2/shaman-idle.webp';
import shamanWalk from '../../assets/art/d2/shaman-walk.webp';
import quill from '../../assets/art/d2/quillrat.webp';

/**
 * Real Spriters Resource atlases. Eight direction rows, south then clockwise.
 * Barbarian whirl, leap, cast, get-hit, and death reuse these same sheets
 * (run, attack, or idle) so a state never swaps in an older drawing.
 * Fallen, zombie, and fallen shaman walk the same way. The quill rat has no
 * sheet here — the plain rat sheet is not used — so quillrat.webp is drawn
 * in the Act I browns.
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
  town: townFloor,
  outdoor: outdoorFloor,
};

/** Blood Raven has no supplied sheet. Props are project drawings. */
export const monsterSheets = {
  raven,
  ravenWalk,
};

export const propSheets = {
  tent,
  fire,
  wall,
  tower,
  altar,
};

export const TWO_HAND_WCLASS = new Set(['2HS', '2HT', 'STF']);
