import rawItems from './d2/items-act1.json';

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
}

export const POTION_CAP = 5;

const POTIONS: ItemDef[] = [
  {
    id: 'health-potion',
    name: 'Health Potion',
    cost: 45,
    slot: 'consumable',
    consumable: 'health',
    heal: 340,
    description: 'Drink to restore 340 life. Carry up to 5.',
  },
  {
    id: 'mana-potion',
    name: 'Mana Potion',
    cost: 30,
    slot: 'consumable',
    consumable: 'mana',
    restoreMana: 130,
    description: 'Drink to restore 130 mana. Carry up to 5.',
  },
];

/** Potions plus normal Act I bases imported from Weapons.txt and Armor.txt. */
export const ITEMS: ItemDef[] = [...POTIONS, ...(rawItems as ItemDef[])];

export function itemById(id: string): ItemDef | undefined {
  return ITEMS.find((item) => item.id === id);
}

export function potionItem(kind: PotionKind): ItemDef {
  const item = ITEMS.find((entry) => entry.consumable === kind);
  if (!item) throw new Error(`No potion for ${kind}`);
  return item;
}
