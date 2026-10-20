import bash from '../../assets/art/icons/bash.png';
import shout from '../../assets/art/icons/shout.png';
import stun from '../../assets/art/icons/stun.png';
import leap from '../../assets/art/icons/leap-attack.png';
import orders from '../../assets/art/icons/battle-orders.png';
import whirl from '../../assets/art/icons/whirlwind.png';
import health from '../../assets/art/icons/health-potion.png';
import mana from '../../assets/art/icons/mana-potion.png';
import clb from '../../assets/art/icons/clb.png';
import ssd from '../../assets/art/icons/ssd.png';
import flc from '../../assets/art/icons/flc.png';
import twohs from '../../assets/art/icons/2hs.png';
import qui from '../../assets/art/icons/qui.png';
import lea from '../../assets/art/icons/lea.png';
import stu from '../../assets/art/icons/stu.png';
import rng from '../../assets/art/icons/rng.png';
import cap from '../../assets/art/icons/cap.png';
import skp from '../../assets/art/icons/skp.png';
import hlm from '../../assets/art/icons/hlm.png';
import fhl from '../../assets/art/icons/fhl.png';
import lbl from '../../assets/art/icons/lbl.png';
import mbl from '../../assets/art/icons/mbl.png';

/** Swap a file in src/assets/art/icons to change a button without touching combat. */
const SKILLS: Record<string, string> = {
  bash,
  shout,
  stun,
  'leap-attack': leap,
  'battle-orders': orders,
  whirlwind: whirl,
};

const GEAR: Record<string, string> = {
  'health-potion': health,
  'mana-potion': mana,
  clb,
  ssd,
  flc,
  '2hs': twohs,
  qui,
  lea,
  stu,
  rng,
  cap,
  skp,
  hlm,
  fhl,
  lbl,
  mbl,
};

export function skillIcon(id: string): string {
  return SKILLS[id] ?? '';
}

export function itemIcon(id: string): string {
  return GEAR[id] ?? '';
}
