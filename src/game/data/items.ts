export type ItemSlot = 'consumable' | 'weapon' | 'armor' | 'helm';
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
  armor?: number;
  hp?: number;
  mana?: number;
}

export const POTION_CAP = 5;

/** Shop catalog. Add an entry here and the shop UI picks it up. */
export const ITEMS: ItemDef[] = [
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
  {
    id: 'hand-axe',
    name: 'Hand Axe',
    cost: 380,
    slot: 'weapon',
    ad: 16,
    description: '+16 damage. Replaces your equipped weapon.',
  },
  {
    id: 'battle-sword',
    name: 'Battle Sword',
    cost: 860,
    slot: 'weapon',
    ad: 34,
    description: '+34 damage. Replaces your equipped weapon.',
  },
  {
    id: 'leather-armor',
    name: 'Leather Armor',
    cost: 460,
    slot: 'armor',
    armor: 18,
    hp: 150,
    description: '+18 armor and +150 life.',
  },
  {
    id: 'war-helm',
    name: 'War Helm',
    cost: 340,
    slot: 'helm',
    hp: 110,
    mana: 40,
    armor: 8,
    description: '+110 life, +40 mana, and +8 armor.',
  },
];

export function itemById(id: string): ItemDef | undefined {
  return ITEMS.find((item) => item.id === id);
}

export function potionItem(kind: PotionKind): ItemDef {
  const item = ITEMS.find((entry) => entry.consumable === kind);
  if (!item) throw new Error(`No potion for ${kind}`);
  return item;
}
