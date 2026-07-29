/** Store pricing shared by the server store and the store page — no IO here. */

import type { Rarity } from "./types";

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
