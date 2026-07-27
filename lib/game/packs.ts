/** Pack definitions & rolling — shared by client profile and server. */

import type { GameCard, Rarity } from "./types";

export const PACKS = [
  { id: "small", name: "Small Pack", cards: 3, gold: 100, art: "/store/pack-small.png" },
  { id: "standard", name: "Standard Pack", cards: 5, gold: 150, art: "/store/pack-standard.png" },
  { id: "grand", name: "Grand Pack", cards: 10, gold: 280, art: "/store/pack-grand.png" },
] as const;

export const PACK_ODDS: [Rarity, number][] = [
  ["common", 0.675], ["rare", 0.22], ["epic", 0.08], ["legendary", 0.02], ["mythic", 0.005],
];

export function rollPack(pool: GameCard[], count: number, rand: () => number = Math.random): string[] {
  const collectible = pool.filter((c) => !c.token);
  const byRarity = (r: Rarity) => collectible.filter((c) => c.rarity === r);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    let roll = rand();
    let rarity: Rarity = "common";
    for (const [r, odds] of PACK_ODDS) {
      if (roll < odds) { rarity = r; break; }
      roll -= odds;
    }
    let candidates = byRarity(rarity);
    if (candidates.length === 0) candidates = collectible;
    out.push(candidates[Math.floor(rand() * candidates.length)].id);
  }
  return out;
}
