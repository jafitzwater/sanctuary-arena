export type ItemSlot = 'consumable' | 'weapon' | 'armor' | 'helm' | 'belt' | 'shield';
export type PotionKind = 'health' | 'mana';

export interface ItemDef {
  id: string;
  name: string;
  cost: number;
  slot: ItemSlot;
  description: string;
  consumable?: PotionKind;
  heal?: number;
  restoreMana?: number;
  ad?: number;
  adOne?: number;
  adOff?: number;
  throwAd?: number;
  armor?: number;
  hp?: number;
  mana?: number;
  reqStr?: number;
  reqDex?: number;
  speed?: number;
  wclass?: string;
  wclass2?: string;
  twoHanded?: boolean;
  oneOrTwo?: boolean;
  thrown?: boolean;
  weaponType?: string;
  /** Match level before Akara will sell it. */
  unlockLevel?: number;
  /** Potion slots this belt grants. Unset belts do not change the base cap. */
  potionSlots?: number;
}

/** Potions carried with no belt. A belt raises this, and nothing goes past MAX_POTION_CAP. */
export const BASE_POTION_CAP = 3;
export const MAX_POTION_CAP = 5;

const POTIONS: ItemDef[] = [
  {
    id: 'health-potion',
    name: 'Health Potion',
    cost: 45,
    slot: 'consumable',
    consumable: 'health',
    heal: 105,
    description: 'Drink to restore 105 life.',
  },
  {
    id: 'mana-potion',
    name: 'Mana Potion',
    cost: 30,
    slot: 'consumable',
    consumable: 'mana',
    restoreMana: 130,
    description: 'Drink to restore 130 mana.',
  },
];

/**
 * Short Act I progression. Names and rough damage come from the 1.13c JSON
 * in data/d2; requirements and prices are tuned so a match level gates them.
 * Strength is the main gate. The two-hander also asks for a little dexterity.
 */
const GEAR: ItemDef[] = [
  {
    id: 'clb',
    name: 'Club',
    cost: 40,
    slot: 'weapon',
    unlockLevel: 1,
    description: '1–6 damage. No strength requirement.',
    ad: 5,
    adOne: 5,
    reqStr: 0,
    reqDex: 0,
    speed: -10,
    wclass: '1HS',
    wclass2: '1HS',
    weaponType: 'club',
  },
  {
    id: 'ssd',
    name: 'Short Sword',
    cost: 180,
    slot: 'weapon',
    unlockLevel: 3,
    description: 'Stronger one-hand sword. Requires 40 strength.',
    ad: 9,
    adOne: 9,
    reqStr: 40,
    reqDex: 0,
    speed: 0,
    wclass: '1HS',
    wclass2: '1HS',
    weaponType: 'swor',
  },
  {
    id: 'flc',
    name: 'Falchion',
    cost: 420,
    slot: 'weapon',
    unlockLevel: 5,
    description: 'Heavy one-hand sword. Requires 50 strength.',
    ad: 15,
    adOne: 15,
    reqStr: 50,
    reqDex: 0,
    speed: 10,
    wclass: '1HS',
    wclass2: '1HS',
    weaponType: 'swor',
  },
  {
    id: '2hs',
    name: 'Two-Handed Sword',
    cost: 780,
    slot: 'weapon',
    unlockLevel: 8,
    description: 'Slow two-hander. Requires 65 strength and 30 dexterity.',
    ad: 22,
    adOne: 22,
    reqStr: 65,
    reqDex: 30,
    speed: 15,
    wclass: '2HS',
    wclass2: '2HS',
    twoHanded: true,
    weaponType: 'swor',
  },
  {
    id: 'qui',
    name: 'Quilted Armor',
    cost: 70,
    slot: 'armor',
    unlockLevel: 1,
    description: 'Light padding. Requires 12 strength.',
    armor: 12,
    reqStr: 12,
  },
  {
    id: 'lea',
    name: 'Leather Armor',
    cost: 200,
    slot: 'armor',
    unlockLevel: 3,
    description: 'Requires 40 strength.',
    armor: 26,
    reqStr: 40,
  },
  {
    id: 'stu',
    name: 'Studded Leather',
    cost: 480,
    slot: 'armor',
    unlockLevel: 5,
    description: 'Requires 55 strength.',
    armor: 42,
    reqStr: 55,
  },
  {
    id: 'rng',
    name: 'Ring Mail',
    cost: 860,
    slot: 'armor',
    unlockLevel: 8,
    description: 'Requires 65 strength.',
    armor: 60,
    reqStr: 65,
  },
  {
    id: 'cap',
    name: 'Cap',
    cost: 45,
    slot: 'helm',
    unlockLevel: 1,
    description: 'No strength requirement.',
    armor: 6,
    reqStr: 0,
  },
  {
    id: 'skp',
    name: 'Skull Cap',
    cost: 160,
    slot: 'helm',
    unlockLevel: 3,
    description: 'Requires 40 strength.',
    armor: 16,
    reqStr: 40,
  },
  {
    id: 'hlm',
    name: 'Helm',
    cost: 400,
    slot: 'helm',
    unlockLevel: 5,
    description: 'Requires 55 strength.',
    armor: 28,
    reqStr: 55,
  },
  {
    id: 'fhl',
    name: 'Full Helm',
    cost: 700,
    slot: 'helm',
    unlockLevel: 8,
    description: 'Requires 65 strength.',
    armor: 42,
    reqStr: 65,
  },
  {
    id: 'lbl',
    name: 'Sash',
    cost: 80,
    slot: 'belt',
    unlockLevel: 2,
    description: 'Carry 4 health and 4 mana potions.',
    armor: 4,
    reqStr: 0,
    potionSlots: 4,
  },
  {
    id: 'mbl',
    name: 'Belt',
    cost: 300,
    slot: 'belt',
    unlockLevel: 6,
    description: 'Carry 5 health and 5 mana potions. Requires 45 strength.',
    armor: 12,
    reqStr: 45,
    potionSlots: 5,
  },
];

export const ITEMS: ItemDef[] = [...POTIONS, ...GEAR];

export function itemById(id: string): ItemDef | undefined {
  return ITEMS.find((item) => item.id === id);
}

export function potionItem(kind: PotionKind): ItemDef {
  const item = ITEMS.find((entry) => entry.consumable === kind);
  if (!item) throw new Error(`No potion for ${kind}`);
  return item;
}

export function potionCap(beltId: string | null): number {
  const belt = beltId ? itemById(beltId) : undefined;
  const slots = belt?.potionSlots ?? BASE_POTION_CAP;
  return Math.max(BASE_POTION_CAP, Math.min(MAX_POTION_CAP, slots));
}
