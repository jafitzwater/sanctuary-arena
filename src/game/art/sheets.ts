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

/**
 * Sprite slots follow Diablo II PlrMode tokens (NU, WL, RN, A1, A2, S1, GH, DD).
 * The Barbarian token is BA. Weapon class from Weapons.txt picks A1 (1HS / 1HT / HTH)
 * or A2 (2HS / 2HT / STF). Replace any URL here to swap a sheet without touching combat.
 *
 * Character frames under src/assets/art/barbarian and monsters/ are original generated art.
 * Blood Raven and the quill rat use the stand-ins in src/assets/art/generated.
 * Spriters Resource sheets were not clean enough to ship; see the README.
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

export const TWO_HAND_WCLASS = new Set(['2HS', '2HT', 'STF']);
