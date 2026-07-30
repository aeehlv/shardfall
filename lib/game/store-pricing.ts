/** Store pricing shared by the server store and the store page — no IO here. */

import type { Rarity } from "./types";
import { PACKS } from "./packs";

/** Fixed featured singles — epic/legendary ids that exist in the pool. */
export const FEATURED_IDS = ["pyre-003", "abyss-003", "verdant-003"];

/** Shard price of a featured single. */
export const singlePrice = (rarity: Rarity) => (rarity === "legendary" ? 15 : 8);

/** Purchase copy cap for featured singles. */
export const MAX_COPIES = (rarity: Rarity) => (rarity === "legendary" ? 1 : 3);

/** Rotation purchase limits: legendary/mythic 1 copy, everything else 3. */
export const ROTATION_MAX = (rarity: Rarity) =>
  rarity === "legendary" || rarity === "mythic" ? 1 : 3;

/** Demo shard top-up tiers (prices are display-only until real payments land). */
export const TOPUP_TIERS: { shards: number; price: string; best?: boolean; label?: string }[] = [
  { shards: 10, price: "1.99 €" },
  { shards: 30, price: "4.99 €" },
  { shards: 70, price: "9.99 €" },
  { shards: 900, price: "99.00 €", best: true, label: "Hoard of the Undersun" },
];

/** All rarities — the key set of the singles price table. */
export const RARITIES: readonly Rarity[] = ["common", "rare", "epic", "legendary", "mythic"];

/** The store catalog served by /api/store/catalog: effective prices for every
 *  admin-adjustable surface (packs, featured singles, top-up tiers). */
export interface StoreCatalog {
  packs: { id: string; name: string; cards: number; gold: number }[];
  singles: Record<Rarity, number>;
  topups: { shards: number; price: string; label?: string; best?: boolean }[];
}

/** Catalog built from the hardcoded defaults — the server merges admin overrides
 *  on top; the store page renders this until the live catalog loads. */
export function defaultCatalog(): StoreCatalog {
  return {
    packs: PACKS.map(({ id, name, cards, gold }) => ({ id, name, cards, gold })),
    singles: Object.fromEntries(
      RARITIES.map((r) => [r, singlePrice(r)]),
    ) as Record<Rarity, number>,
    topups: TOPUP_TIERS.map((t) => ({ ...t })),
  };
}
