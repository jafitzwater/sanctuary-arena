export type ItemSlot = 'consumable' | 'weapon' | 'armor' | 'helm' | 'belt' | 'shield';
export type PotionKind = 'health' | 'mana';
/** Base gear is what Akara sells. The other tiers are stored so later drops can use them. */
export type ItemTier = 'base' | 'magic' | 'rare' | 'unique' | 'set';

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
  /** Missing tier means a normal base item. */
  tier?: ItemTier;
  /** Magic find, in percent. Not used by the current shop. */
  mf?: number;
  /** Gold find, in percent. Not used by the current shop. */
  gf?: number;
  sockets?: number;
  /** Rune name. A set value keeps the item out of the shop grid. */
  rune?: string;
  /** Inventory charm. Not equipped in the four gear slots. */
  charm?: boolean;
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
  {
    id: 'hire-rogue',
    name: 'Hire Rogue',
    cost: 80,
    slot: 'consumable',
    tier: 'base',
    description: 'A rogue follows you for 45 seconds. Only one at a time.',
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

/** Not sold. The shop only lists base items from ITEMS. */
export const FUTURE_ITEMS: ItemDef[] = [
  {
    id: 'tir',
    name: 'Tir Rune',
    cost: 0,
    slot: 'weapon',
    tier: 'magic',
    rune: 'Tir',
    description: 'A rune. Socketing and runewords are not in the shop yet.',
  },
  {
    id: 'charm-life',
    name: 'Fine Small Charm of Vita',
    cost: 0,
    slot: 'consumable',
    tier: 'magic',
    charm: true,
    hp: 8,
    description: 'A charm. It stays in the pack, not in a gear slot.',
  },
  {
    id: 'soj',
    name: 'Stone of Jordan',
    cost: 0,
    slot: 'consumable',
    tier: 'unique',
    mf: 0,
    mana: 20,
    description: 'A unique. Magic find and gold find will read fields like these.',
    gf: 0,
  },
];

export function isShopItem(item: ItemDef): boolean {
  return (item.tier ?? 'base') === 'base' && !item.rune && !item.charm;
}

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
