import idle from '../../assets/art/barbarian/idle.png';
import walk1 from '../../assets/art/barbarian/walk1.png';
import walk2 from '../../assets/art/barbarian/walk2.png';
import run1 from '../../assets/art/barbarian/run1.png';
import run2 from '../../assets/art/barbarian/run2.png';
import atk1 from '../../assets/art/barbarian/atk1.png';
import atk2 from '../../assets/art/barbarian/atk2.png';
import cast from '../../assets/art/barbarian/cast.png';
import gethit from '../../assets/art/barbarian/gethit.png';
import death from '../../assets/art/barbarian/death.png';
import whirl from '../../assets/art/barbarian/whirl.png';
import leap from '../../assets/art/barbarian/leap.png';
import north from '../../assets/art/barbarian/north.png';
import fallen from '../../assets/art/monsters/fallen.png';
import fallenWalk from '../../assets/art/monsters/fallen-walk.png';
import zombie from '../../assets/art/monsters/zombie.png';
import zombieWalk from '../../assets/art/monsters/zombie-walk.png';
import raven from '../../assets/art/generated/blood-raven.png';
import ravenWalk from '../../assets/art/generated/blood-raven-walk.png';
import rogue from '../../assets/art/monsters/rogue.png';
import quill from '../../assets/art/generated/quillrat.png';
import quillWalk from '../../assets/art/generated/quillrat-walk.png';
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

/**
 * Sprite slots follow Diablo II PlrMode tokens (NU, WL, RN, A1, A2, S1, GH, DD).
 * The Barbarian token is BA. Weapon class from Weapons.txt picks A1 (1HS / 1HT / HTH)
 * or A2 (2HS / 2HT / STF). Replace any URL here to swap a sheet without touching combat.
 *
 * Barbarian walk, run, idle, and attack, the Rogue mercenary, and Akara are
 * whole frames cut from Spriters Resource sheets (see d2Atlas). Whirl, leap,
 * cast, get-hit, and death stay on the generated frames below.
 */
export const barbarianSheets = {
  token: 'BA',
  NU: idle,
  north,
  WL: [walk1, walk2] as const,
  RN: [run1, run2] as const,
  A1: atk1,
  A2: atk2,
  S1: cast,
  GH: gethit,
  DD: death,
  leap,
  whirl,
};

export const monsterSheets = {
  fallen,
  fallenWalk,
  zombie,
  zombieWalk,
  raven,
  ravenWalk,
  rogue,
  quill,
  quillWalk,
};

export const propSheets = {
  tent,
  fire,
  wall,
  tower,
  altar,
};

/** Real Spriters Resource atlases. Eight direction rows, south then clockwise. */
export const d2Atlas = {
  light: { idle: lightIdle, walk: lightWalk, run: lightRun, attack: lightAttack },
  medium: { idle: mediumIdle, walk: mediumWalk, run: mediumRun, attack: mediumAttack },
  heavy: { idle: heavyIdle, walk: heavyWalk, run: heavyRun, attack: heavyAttack },
  rogue: rogueMerc,
  akara: akaraSheet,
  town: townFloor,
  outdoor: outdoorFloor,
};

export const TWO_HAND_WCLASS = new Set(['2HS', '2HT', 'STF']);
