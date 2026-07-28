import { leagueFor, nextPlayerId, playersCol, type PlayerDoc } from "./db";

/** App-level view of a player document. `id` mirrors the Mongo `_id`.
 *  packs / collection / decks are REAL OBJECTS (they were JSON strings under SQLite). */
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
  packs: Record<string, number>;
  collection: Record<string, number>;
  decks: Record<string, string[]>;
  createdAt?: number;
}

/** Fields a caller may hand to updatePlayer (everything except the id). */
export type PlayerUpdate = Partial<Omit<PlayerRow, "id">>;

export const PLAYER_DEFAULTS = {
  isBot: 0,
  rating: 1000,
  league: "Bronze",
  gold: 300,
  shards: 20,
  xp: 0,
  level: 1,
  wins: 0,
  losses: 0,
} as const;

/** _id → id, plus defaults for documents written before a field existed. */
export function toPlayerRow(doc: PlayerDoc): PlayerRow {
  return {
    id: doc._id,
    userId: doc.userId ?? null,
    name: doc.name,
    isBot: doc.isBot ?? 0,
    rating: doc.rating ?? PLAYER_DEFAULTS.rating,
    league: doc.league ?? leagueFor(doc.rating ?? PLAYER_DEFAULTS.rating),
    gold: doc.gold ?? PLAYER_DEFAULTS.gold,
    shards: doc.shards ?? PLAYER_DEFAULTS.shards,
    xp: doc.xp ?? 0,
    level: doc.level ?? 1,
    wins: doc.wins ?? 0,
    losses: doc.losses ?? 0,
    packs: doc.packs ?? {},
    collection: doc.collection ?? {},
    decks: doc.decks ?? {},
    createdAt: doc.createdAt,
  };
}

export async function getPlayerByUserId(userId: string): Promise<PlayerRow | undefined> {
  const doc = await (await playersCol()).findOne({ userId });
  return doc ? toPlayerRow(doc) : undefined;
}

export async function getPlayerById(id: number): Promise<PlayerRow | undefined> {
  const doc = await (await playersCol()).findOne({ _id: id });
  return doc ? toPlayerRow(doc) : undefined;
}

export async function ensurePlayerForUser(userId: string, name: string): Promise<PlayerRow> {
  const existing = await getPlayerByUserId(userId);
  if (existing) return existing;

  const doc: PlayerDoc = {
    _id: await nextPlayerId(),
    userId,
    name: name.slice(0, 24) || "Duelist",
    ...PLAYER_DEFAULTS,
    packs: {},
    collection: {},
    decks: {},
    createdAt: Date.now(),
  };
  try {
    await (await playersCol()).insertOne(doc);
  } catch (err) {
    // Two concurrent requests for a brand-new user: the unique userId index wins,
    // the loser just reads the row the winner wrote.
    if ((err as { code?: number }).code !== 11000) throw err;
    const raced = await getPlayerByUserId(userId);
    if (raced) return raced;
    throw err;
  }
  return toPlayerRow(doc);
}

export async function updatePlayer(id: number, fields: PlayerUpdate): Promise<void> {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  await (await playersCol()).updateOne({ _id: id }, { $set: fields as Partial<PlayerDoc> });
}

export async function grantPacks(
  id: number, size: "small" | "standard" | "grand", count: number,
): Promise<void> {
  await (await playersCol()).updateOne({ _id: id }, { $inc: { [`packs.${size}`]: count } });
}

export async function addXpGold(
  id: number, gold: number, xp: number, won: boolean,
): Promise<{ levelUps: number; level: number }> {
  const p = (await getPlayerById(id))!;
  let level = p.level;
  let curXp = p.xp + xp;
  let levelUps = 0;
  while (curXp >= 100 * level) {
    curXp -= 100 * level;
    level += 1;
    levelUps += 1;
  }
  await updatePlayer(id, {
    gold: p.gold + gold, xp: curXp, level,
    wins: p.wins + (won ? 1 : 0), losses: p.losses + (won ? 0 : 1),
  });
  if (levelUps > 0) await grantPacks(id, "standard", levelUps);
  return { levelUps, level };
}

/** Elo update; returns delta applied to `a` (b gets -delta). */
export async function applyElo(aId: number, bId: number, aWon: boolean, k = 32): Promise<number> {
  const a = (await getPlayerById(aId))!;
  const b = (await getPlayerById(bId))!;
  const expA = 1 / (1 + Math.pow(10, (b.rating - a.rating) / 400));
  const delta = Math.round(k * ((aWon ? 1 : 0) - expA));
  const newA = Math.max(400, a.rating + delta);
  const newB = Math.max(400, b.rating - delta);
  await updatePlayer(aId, { rating: newA, league: leagueFor(newA) });
  await updatePlayer(bId, { rating: newB, league: leagueFor(newB) });
  return delta;
}
