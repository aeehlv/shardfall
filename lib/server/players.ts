import { db, leagueFor } from "./db";

export interface PlayerRow {
  id: number;
  userId: string | null;
  name: string;
  isBot: number;
  rating: number;
  league: string;
  gold: number;
  shards: number;
  xp: number;
  level: number;
  wins: number;
  losses: number;
  packs: string;
  collection: string;
  decks: string;
}

export function getPlayerByUserId(userId: string): PlayerRow | undefined {
  return db.prepare("SELECT * FROM players WHERE userId = ?").get(userId) as PlayerRow | undefined;
}

export function getPlayerById(id: number): PlayerRow | undefined {
  return db.prepare("SELECT * FROM players WHERE id = ?").get(id) as PlayerRow | undefined;
}

export function ensurePlayerForUser(userId: string, name: string): PlayerRow {
  const existing = getPlayerByUserId(userId);
  if (existing) return existing;
  const info = db
    .prepare("INSERT INTO players (userId, name, isBot) VALUES (?, ?, 0)")
    .run(userId, name.slice(0, 24) || "Duelist");
  return getPlayerById(Number(info.lastInsertRowid))!;
}

export function updatePlayer(id: number, fields: Partial<Record<keyof PlayerRow, unknown>>) {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  const sets = keys.map((k) => `${k} = @${k}`).join(", ");
  db.prepare(`UPDATE players SET ${sets} WHERE id = ${id}`).run(fields as Record<string, unknown>);
}

export function grantPacks(id: number, size: "small" | "standard" | "grand", count: number) {
  const p = getPlayerById(id);
  if (!p) return;
  const packs = JSON.parse(p.packs || "{}");
  packs[size] = (packs[size] ?? 0) + count;
  updatePlayer(id, { packs: JSON.stringify(packs) });
}

export function addXpGold(id: number, gold: number, xp: number, won: boolean): { levelUps: number; level: number } {
  const p = getPlayerById(id)!;
  let level = p.level;
  let curXp = p.xp + xp;
  let levelUps = 0;
  while (curXp >= 100 * level) {
    curXp -= 100 * level;
    level += 1;
    levelUps += 1;
  }
  updatePlayer(id, {
    gold: p.gold + gold, xp: curXp, level,
    wins: p.wins + (won ? 1 : 0), losses: p.losses + (won ? 0 : 1),
  });
  if (levelUps > 0) grantPacks(id, "standard", levelUps);
  return { levelUps, level };
}

/** Elo update; returns delta applied to `a` (b gets -delta). */
export function applyElo(aId: number, bId: number, aWon: boolean, k = 32): number {
  const a = getPlayerById(aId)!;
  const b = getPlayerById(bId)!;
  const expA = 1 / (1 + Math.pow(10, (b.rating - a.rating) / 400));
  const delta = Math.round(k * ((aWon ? 1 : 0) - expA));
  const newA = Math.max(400, a.rating + delta);
  const newB = Math.max(400, b.rating - delta);
  updatePlayer(aId, { rating: newA, league: leagueFor(newA) });
  updatePlayer(bId, { rating: newB, league: leagueFor(newB) });
  return delta;
}
