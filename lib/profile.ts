"use client";

/** Player profile — localStorage-backed (no server yet). */

export { PACKS, PACK_ODDS, rollPack } from "@/lib/game/packs";

export const STARTER_DECK_VERSION = 3;

export interface Profile {
  deckVersion?: number;
  gold: number;
  shards: number;
  xp: number;
  level: number;
  collection: Record<string, number>;
  decks: Record<string, string[]>; // deck name -> 50 card ids
  wins: number;
  losses: number;
  introSeen: boolean;
  tutorialDone: boolean;
  /** YYYY-MM-DD (UTC) of the last free daily-card claim */
  lastFreeClaim?: string;
}

const KEY = "shardfall-profile-v1";

export const XP_PER_LEVEL = (level: number) => 100 * level;


export function defaultProfile(): Profile {
  return {
    gold: 300, shards: 20, xp: 0, level: 1, collection: {}, decks: {},
    wins: 0, losses: 0, introSeen: false, tutorialDone: false,
  };
}

export function loadProfile(): Profile {
  if (typeof window === "undefined") return defaultProfile();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultProfile();
    return { ...defaultProfile(), ...JSON.parse(raw) };
  } catch {
    return defaultProfile();
  }
}

export function saveProfile(p: Profile) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(p));
}

export function addCards(p: Profile, ids: string[]) {
  for (const id of ids) p.collection[id] = (p.collection[id] ?? 0) + 1;
}


/** Match rewards. Returns pack counts earned via level-ups. */
export function applyMatchResult(p: Profile, won: boolean): { gold: number; xp: number; levelUps: number } {
  const gold = won ? 40 : 15;
  const xp = won ? 60 : 25;
  p.gold += gold;
  p.xp += xp;
  if (won) p.wins += 1; else p.losses += 1;
  let levelUps = 0;
  while (p.xp >= XP_PER_LEVEL(p.level)) {
    p.xp -= XP_PER_LEVEL(p.level);
    p.level += 1;
    levelUps += 1;
  }
  return { gold, xp, levelUps };
}
