/** Starter deck construction — exactly 50 cards, ≤3 copies (1 for legendaries). */

import type { FactionId, GameCard } from "./types";

export const DECK_SIZE = 50;

export function maxCopies(card: GameCard): number {
  return card.rarity === "legendary" || card.rarity === "mythic" ? 1 : 3;
}

/** Deterministic 50-card starter deck: full faction set + cheap neutrals. */
export function buildStarterDeck(pool: GameCard[], faction: FactionId): string[] {
  const collectible = pool.filter((c) => !c.token);
  const factionCards = collectible
    .filter((c) => c.faction === faction)
    .sort((a, b) => a.cost - b.cost || a.id.localeCompare(b.id));
  const neutrals = collectible
    .filter((c) => c.faction === "neutral")
    .sort((a, b) => a.cost - b.cost || a.id.localeCompare(b.id));

  const deck: string[] = [];
  const add = (c: GameCard) => {
    const copies = Math.min(maxCopies(c), DECK_SIZE - deck.length);
    for (let i = 0; i < copies; i++) deck.push(c.id);
  };
  for (const c of factionCards) { if (deck.length >= DECK_SIZE) break; add(c); }
  for (const c of neutrals) { if (deck.length >= DECK_SIZE) break; add(c); }
  // top up with extra faction commons if still short (shouldn't happen with a full pool)
  let guard = 0;
  while (deck.length < DECK_SIZE && guard++ < 200) {
    const filler = factionCards.find((c) => c.rarity === "common") ?? factionCards[0] ?? neutrals[0];
    if (!filler) break;
    deck.push(filler.id);
  }
  return deck.slice(0, DECK_SIZE);
}

export function starterDeckName(faction: FactionId): string {
  return { pyre: "Forge of the First Hammer", abyss: "Hymns of the Deep", verdant: "The Undersown Grove", neutral: "Neutral" }[faction];
}
