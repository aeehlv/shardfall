/** Battlefield registry. Adding a new arena here (plus its /board/<slug>.jpg)
 *  makes it selectable in practice and usable by matches. */

import type { FactionId } from "./types";

export interface BoardDef {
  slug: string;
  name: string;
  blurb: string;
  /** Which faction's lands this belongs to — drives the default board per match. */
  realm: FactionId;
}

export const BOARDS: BoardDef[] = [
  { slug: "glasswake", name: "The Glasswake", blurb: "Shard-dusted borderland meadows.", realm: "verdant" },
  { slug: "cinderreach", name: "The Cinderreach", blurb: "Caldera-lands of the forge empire.", realm: "pyre" },
  { slug: "sunken-antiphon", name: "The Sunken Antiphon", blurb: "Drowned cathedral-trenches.", realm: "abyss" },
  { slug: "greatgraft", name: "The Greatgraft", blurb: "A living bridge over a bottomless break.", realm: "verdant" },
  { slug: "heartwound", name: "The Heartwound", blurb: "The crater where the Undersun burst.", realm: "pyre" },
  { slug: "shard-wastes", name: "The Shardfall Wastes", blurb: "Salt-flats studded with fallen shards.", realm: "neutral" },
  { slug: "bronze-road", name: "Bronze Road Crossing", blurb: "A plated causeway over living lava.", realm: "pyre" },
  { slug: "pearl-reliquary", name: "The Pearl Reliquary", blurb: "A flooded vault of luminous pearls.", realm: "abyss" },
  { slug: "canopy-court", name: "The Canopy Court", blurb: "An arena woven in the forest crown.", realm: "verdant" },
];

/** Arenas whose art actually exists yet — keep in step with public/board/. */
export const AVAILABLE_BOARDS = new Set(BOARDS.map((b) => b.slug));

export const playableBoards = (): BoardDef[] =>
  BOARDS.filter((b) => AVAILABLE_BOARDS.has(b.slug));

export const boardImage = (slug: string): string =>
  `/board/${AVAILABLE_BOARDS.has(slug) ? slug : "glasswake"}.jpg`;

export const boardByslug = (slug?: string | null): BoardDef | undefined =>
  BOARDS.find((b) => b.slug === slug);

/** Default arena for a match: the opponent's home realm. */
export function defaultBoardFor(enemy: FactionId): string {
  const home = playableBoards().filter((b) => b.realm === enemy);
  if (home.length > 0) return home[0].slug;
  return "glasswake";
}
