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
    description: 'Drink to restore 1/5 of your life.',
  },
  {
    id: 'mana-potion',
    name: 'Mana Potion',
    cost: 30,
    slot: 'consumable',
    consumable: 'mana',
    description: 'Drink to restore 1/5 of your mana.',
  },
];

/**
 * Short Act I progression. Names and rough damage come from the 1.13c JSON
 * in data/d2; requirements and prices are tuned so a match level gates them.
 * Strength is the main gate. The two-hander also asks for a little dexterity.
 */
// [TEMP] Pass 3 gate cut (layout/jungle/items/skills order, item 3): every gate is now reachable
// by the playable Barbarian (str 30 + 2/level, dex 20 + 1/level) at the item's own level, and the
// top tier (old level 8) and big Belt (old 6) unlock one level sooner. Old -> new (level/str/dex):
// ssd 3/40 -> 3/34, flc 5/50 -> 5/38, 2hs 8/65/30 -> 7/42/26, lea 3/40 -> 3/34, stu 5/55 -> 5/38,
// rng 8/65 -> 7/42, skp 3/40 -> 3/34, hlm 5/55 -> 5/38, fhl 8/65 -> 7/42, mbl 6/45 -> 5/38.
// Prices follow the [JOSEPH] level*50 rule, so 2hs/rng/fhl 400 -> 350 and mbl 300 -> 250.
// Pace check: test/items/item-19b-gate-pace.ts.
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
    description: 'Stronger one-hand sword. Requires 34 strength.',
    ad: 9,
    adOne: 9,
    reqStr: 34,
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
    description: 'Heavy one-hand sword. Requires 38 strength.',
    ad: 15,
    adOne: 15,
    reqStr: 38,
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
    unlockLevel: 7,
    description: 'Slow two-hander. Requires 42 strength and 26 dexterity.',
    ad: 22,
    adOne: 22,
    reqStr: 42,
    reqDex: 26,
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
    description: 'Requires 34 strength.',
    armor: 26,
    reqStr: 34,
  },
  {
    id: 'stu',
    name: 'Studded Leather',
    cost: 480,
    slot: 'armor',
    unlockLevel: 5,
    description: 'Requires 38 strength.',
    armor: 42,
    reqStr: 38,
  },
  {
    id: 'rng',
    name: 'Ring Mail',
    cost: 860,
    slot: 'armor',
    unlockLevel: 7,
    description: 'Requires 42 strength.',
    armor: 60,
    reqStr: 42,
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
    description: 'Requires 34 strength.',
    armor: 16,
    reqStr: 34,
  },
  {
    id: 'hlm',
    name: 'Helm',
    cost: 400,
    slot: 'helm',
    unlockLevel: 5,
    description: 'Requires 38 strength.',
    armor: 28,
    reqStr: 38,
  },
  {
    id: 'fhl',
    name: 'Full Helm',
    cost: 700,
    slot: 'helm',
    unlockLevel: 7,
    description: 'Requires 42 strength.',
    armor: 42,
    reqStr: 42,
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
    unlockLevel: 5,
    description: 'Carry 5 health and 5 mana potions. Requires 38 strength.',
    armor: 12,
    reqStr: 38,
    potionSlots: 5,
  },
];

/**
 * Gap-list item 19, batch 4. Source [JOSEPH] (joseph-answers-oct27.md, answer 1):
 *   "Gear: 4 slots Helmet, Armor, Weapon, Belt. Better = higher required level + higher
 *    base stat/tier; ties = more useful affixes for class. Price base = itemLevel*50;
 *    unique/set = base*3-5 (hardcode)."
 * Doc: "An item cannot be sold. It can only be overwritten for a better item."
 * Implements: gear price = itemLevel * 50, where itemLevel is the item's unlockLevel
 * (the required match level) [DERIVED]; the "better item" rule; no sell-back.
 * The 4 slots are the repo's existing weapon/armor/helm/belt (unchanged).
 * Excluded (NEEDS JOSEPH): the affix tie-break (shop items have no affixes) and the
 * unique/set multiplier (no unique/set item is sold; "3-5" is not one number).
 */
export const GEAR_PRICE_PER_LEVEL = 50;

export function gearPrice(item: ItemDef): number {
  // [JOSEPH] "Price base = itemLevel*50"
  return (item.unlockLevel ?? 1) * GEAR_PRICE_PER_LEVEL;
}

const TIER_RANK: Record<ItemTier, number> = { base: 0, magic: 1, rare: 2, set: 3, unique: 4 };

/** Weapons compare damage; armor, helms and belts compare armor. */
export function gearBaseStat(item: ItemDef): number {
  return item.slot === 'weapon' ? item.ad ?? item.adOne ?? 0 : item.armor ?? 0;
}

/**
 * [JOSEPH] "Better = higher required level + higher base stat/tier".
 * Better means a higher required level with a base stat and tier no lower, or the same
 * required level with a higher base stat or tier. A full tie is not better [the affix
 * tie-break is NEEDS JOSEPH]. An empty slot accepts anything.
 */
export function isBetterGear(next: ItemDef, current: ItemDef | undefined): boolean {
  if (!current) return true;
  const lvl = (next.unlockLevel ?? 1) - (current.unlockLevel ?? 1);
  const stat = gearBaseStat(next) - gearBaseStat(current);
  const tier = TIER_RANK[next.tier ?? 'base'] - TIER_RANK[current.tier ?? 'base'];
  if (lvl > 0) return stat >= 0 && tier >= 0;
  if (lvl === 0) return (stat > 0 && tier >= 0) || (tier > 0 && stat >= 0);
  return false;
}

export const ITEMS: ItemDef[] = [...POTIONS, ...GEAR.map((item) => ({ ...item, cost: gearPrice(item) }))];

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
