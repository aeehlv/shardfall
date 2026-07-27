export type Faction = "pyre" | "abyss" | "verdant";

/**
 * The description text box is IDENTICAL on every card — same position, same size —
 * chosen as the largest box that fits inside all three frames' leather panels.
 * Rect is % of the 3:4 card: [left, top, width, height].
 */
export const RULES_BOX = [21, 75, 58, 16.5] as const;

export interface CardLayout {
  /** Art window rect (frame's portrait window + 1% bleed): left, top, width, height in % */
  art: [number, number, number, number];
  /** Name text box seated on this frame's banner graphic: left, top, width, height in % */
  name: [number, number, number, number];
  /** Name font size in cqw, tuned so the name fits this frame's banner */
  nameSize: number;
  /** Gem socket centers, % of card: [x, y] */
  mana: [number, number];
  attack: [number, number];
  health: [number, number];
  /** Only frames with a spare top-right socket get a rarity cabochon */
  rarity?: [number, number];
}

export interface CardDef {
  id: string;
  faction: Faction;
  factionName: string;
  name: string;
  rarity: "legendary";
  cost: number;
  attack: number;
  health: number;
  rules: string;
  flavor: string;
  art: string;
  frame: string;
  accent: string;
  glow: string;
  layout: CardLayout;
}

export const CARDS: CardDef[] = [
  {
    id: "pyre-003",
    faction: "pyre",
    factionName: "Pyre Dominion",
    name: "Varkha Cindral, First Hammer",
    rarity: "legendary",
    cost: 7,
    attack: 6,
    health: 5,
    rules: "Rush. Piercing. Arrival: Deal 2 damage to all enemy units.",
    flavor: "You never hear her coming. Only landing.",
    art: "/cards/art/pyre.jpg",
    frame: "/cards/frames/pyre.png",
    accent: "#e0562f",
    glow: "rgba(224, 86, 47, 0.45)",
    layout: {
      art: [7.2, 4.3, 85.0, 58.2],
      name: [18, 62.8, 64, 7.5],
      nameSize: 4.0,
      mana: [8.6, 5.3],
      attack: [7.3, 94.8],
      health: [92.6, 94.8],
    },
  },
  {
    id: "abyss-003",
    faction: "abyss",
    factionName: "Abyssal Choir",
    name: "Maelvyra, the First Voice",
    rarity: "legendary",
    cost: 9,
    attack: 6,
    health: 8,
    rules: "Lifesteal. Arrival: Return all other units to their owners’ hands.",
    flavor: "She sang the hush before the chord, and every other voice remembered it was only an echo.",
    art: "/cards/art/abyss.jpg",
    frame: "/cards/frames/abyss.png",
    accent: "#45c4b8",
    glow: "rgba(69, 196, 184, 0.45)",
    layout: {
      art: [5.5, 4.4, 89.0, 55.6],
      name: [21, 62.9, 58, 7.6],
      nameSize: 3.9,
      mana: [7.6, 5.8],
      attack: [7.4, 94.4],
      health: [92.6, 94.4],
    },
  },
  {
    id: "verdant-003",
    faction: "verdant",
    factionName: "Verdant Compact",
    name: "Oremma, the Undersown",
    rarity: "legendary",
    cost: 8,
    attack: 5,
    health: 8,
    rules: "Overgrow. Arrival: Summon two 2/2 Saplings with Guard. Your other units gain Overgrow.",
    flavor: "She was buried holding a seed; the forest that came back up was her.",
    art: "/cards/art/verdant.jpg",
    frame: "/cards/frames/verdant.png",
    accent: "#8cc152",
    glow: "rgba(140, 193, 82, 0.4)",
    layout: {
      art: [13.1, 5.0, 73.8, 58.0],
      name: [28, 63.6, 44, 6.6],
      nameSize: 3.3,
      mana: [7.4, 5.2],
      attack: [7.2, 95.2],
      health: [92.8, 95.2],
      rarity: [92.8, 5.2],
    },
  },
];
