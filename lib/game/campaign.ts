/** Campaign: 5 chapters (the ranked zones) × 6 nodes. PvE vs themed decks, escalating. */

import type { FactionId } from "./types";

export interface CampaignNode {
  id: string;
  chapter: number;
  index: number;
  name: string;
  enemyFaction: FactionId;
  board: "glasswake" | "cinderreach" | "sunken-antiphon";
  /** enemy hero bonus HP (difficulty knob) */
  enemyHpBonus: number;
  /** enemy starts with +N max aether */
  enemyManaBonus: number;
  firstWin: { gold: number; pack: "small" | "standard" | "grand" };
  replayGold: number;
}

const CHAPTERS: {
  name: string; board: CampaignNode["board"]; enemy: FactionId;
  pack: "small" | "standard" | "grand"; gold: number;
}[] = [
  { name: "The Glasswake", board: "glasswake", enemy: "verdant", pack: "small", gold: 50 },
  { name: "The Cinderreach", board: "cinderreach", enemy: "pyre", pack: "standard", gold: 60 },
  { name: "The Sunken Antiphon", board: "sunken-antiphon", enemy: "abyss", pack: "standard", gold: 70 },
  { name: "The Greatgraft", board: "glasswake", enemy: "verdant", pack: "grand", gold: 80 },
  { name: "The Heartwound", board: "cinderreach", enemy: "pyre", pack: "grand", gold: 100 },
];

const NODE_NAMES = [
  ["First Steps", "Shardlight Trail", "The Prospector's Claim", "Meadow Ambush", "Singing Stones", "Warden of the Vale"],
  ["Bronze Roads", "Slag Gate", "Foundry Row", "The Ember Test", "Crucible Watch", "The First Hammer's Shadow"],
  ["Drowned Steps", "Pearl Gallery", "Choir Practice", "The Silent Nave", "Tide Vault", "Echo of the First Voice"],
  ["Root Crossing", "The Grafted Mile", "Sapwarden Post", "Golden Hollow", "The Long Suture", "Heartwood Gate"],
  ["Crater Rim", "Falling Light", "The Worldsong Breach", "Shardstorm", "The Last Verse", "Heart of the Shattering"],
];

export const CAMPAIGN: CampaignNode[] = CHAPTERS.flatMap((ch, ci) =>
  NODE_NAMES[ci].map((name, ni) => ({
    id: `ch${ci + 1}-n${ni + 1}`,
    chapter: ci + 1,
    index: ni + 1,
    name,
    enemyFaction: ch.enemy,
    board: ch.board,
    enemyHpBonus: ci * 3 + Math.floor(ni / 2) * 2,          // 0 … +16
    enemyManaBonus: ci >= 3 ? 1 : 0,
    firstWin: { gold: ch.gold, pack: ch.pack },
    replayGold: 15 + ci * 5,
  })),
);

export const chapterName = (n: number) => CHAPTERS[n - 1]?.name ?? "";

export function nodeById(id: string): CampaignNode | undefined {
  return CAMPAIGN.find((n) => n.id === id);
}

/** A node is unlocked when the previous node is cleared (first node always unlocked). */
export function isUnlocked(nodeId: string, cleared: Set<string>): boolean {
  const idx = CAMPAIGN.findIndex((n) => n.id === nodeId);
  if (idx <= 0) return idx === 0;
  return cleared.has(CAMPAIGN[idx - 1].id);
}
