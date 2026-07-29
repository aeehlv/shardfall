import type { Filter } from "mongodb";
import {
  leagueFor, nextPlayerId, playersCol, transactionsCol, type PlayerDoc,
} from "./db";
import { CARD_POOL } from "@/lib/game/pool";
import { buildStarterDeck, starterDeckName } from "@/lib/game/decks";
import type { FactionId } from "@/lib/game/types";

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
  lastFreeClaim?: number;
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
    lastFreeClaim: doc.lastFreeClaim,
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
  if (existing) {
    // Keep the player name in sync with better-auth renames (account page updateUser).
    const fresh = name.slice(0, 24);
    if (fresh && fresh !== existing.name) {
      await (await playersCol()).updateOne({ _id: Number(existing.id) }, { $set: { name: fresh } });
      return { ...existing, name: fresh };
    }
    return existing;
  }

  // Same starter grant the menu applies to guest profiles: the three faction
  // decks plus one copy of each unique card in them, so direct signups don't
  // land on an empty collection.
  const collection: Record<string, number> = {};
  const decks: Record<string, string[]> = {};
  for (const f of ["pyre", "abyss", "verdant"] as FactionId[]) {
    const deck = buildStarterDeck(CARD_POOL, f);
    decks[starterDeckName(f)] = deck;
    for (const id of new Set(deck)) collection[id] = (collection[id] ?? 0) + 1;
  }

  const doc: PlayerDoc = {
    _id: await nextPlayerId(),
    userId,
    name: name.slice(0, 24) || "Duelist",
    ...PLAYER_DEFAULTS,
    packs: {},
    collection,
    decks,
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
  await logTxn(doc._id, {
    kind: "starter_grant", currency: null, amount: 0,
    meta: { decks: Object.keys(decks) },
  });
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

/** Current UTC day as a yyyymmdd int, for per-day counters on the player doc. */
export function utcDayInt(now = new Date()): number {
  return now.getUTCFullYear() * 10_000 + (now.getUTCMonth() + 1) * 100 + now.getUTCDate();
}

/** Atomically claim one use of a per-UTC-day counter stored on the player doc.
 *  A single guarded write: matches when the stored day is not today (fresh day —
 *  counter resets to 1, `resetFields` reset to 0) or the counter is still below
 *  `cap` (increments). Returns false when today's cap is already spent, so the
 *  caller can 409 BEFORE crediting anything — the ledger stays audit-only. */
export async function claimDailyCounter(
  playerId: number,
  dayField: string,
  countField: string,
  cap: number,
  resetFields: string[] = [],
): Promise<boolean> {
  const day = utcDayInt();
  const sameDay = { $eq: [`$${dayField}`, day] };
  const doc = await (await playersCol()).findOneAndUpdate(
    {
      _id: playerId,
      $or: [{ [dayField]: { $ne: day } }, { [countField]: { $lt: cap } }],
    } as Filter<PlayerDoc>,
    [{
      $set: {
        [countField]: { $cond: [sameDay, { $add: [{ $ifNull: [`$${countField}`, 0] }, 1] }, 1] },
        ...Object.fromEntries(resetFields.map((f) => [
          f, { $cond: [sameDay, { $ifNull: [`$${f}`, 0] }, 0] },
        ])),
        [dayField]: day,
      },
    }],
  );
  return doc !== null;
}

// ------------------------------------------------------------------- ledger --

export interface WalletTxn {
  kind: string;
  itemId?: string;
  meta?: Record<string, unknown>;
}

/** Low-level ledger insert — every economy mutation leaves exactly one row. */
export async function logTxn(
  playerId: number | string,
  txn: {
    kind: string;
    currency: "gold" | "shards" | null;
    amount: number;
    itemId?: string;
    balanceAfter?: number;
    meta?: Record<string, unknown>;
  },
): Promise<void> {
  await (await transactionsCol()).insertOne({ playerId: String(playerId), ts: Date.now(), ...txn });
}

/** Atomic wallet credit ($inc) + ledger row. Returns the fresh player document. */
export async function creditWallet(
  id: number | string,
  delta: { gold?: number; shards?: number },
  txn: WalletTxn,
): Promise<PlayerDoc> {
  const inc: Record<string, number> = {};
  if (delta.gold) inc.gold = delta.gold;
  if (delta.shards) inc.shards = delta.shards;
  const col = await playersCol();
  const doc = Object.keys(inc).length
    ? await col.findOneAndUpdate({ _id: Number(id) }, { $inc: inc }, { returnDocument: "after" })
    : await col.findOne({ _id: Number(id) });
  if (!doc) throw new Error(`No player ${id}`);
  const currency = delta.gold ? "gold" : delta.shards ? "shards" : null;
  await logTxn(doc._id, {
    kind: txn.kind,
    currency,
    amount: delta.gold ?? delta.shards ?? 0,
    itemId: txn.itemId,
    balanceAfter: currency === "gold" ? doc.gold : currency === "shards" ? doc.shards : undefined,
    meta: delta.gold && delta.shards ? { ...txn.meta, shards: delta.shards } : txn.meta,
  });
  return doc;
}

/** Atomic conditional debit — null when funds are insufficient (no partial spend).
 *  Writes the ledger row only on success. */
export async function debitWallet(
  id: number | string,
  cost: { gold?: number; shards?: number },
  txn: WalletTxn,
): Promise<PlayerDoc | null> {
  const inc: Record<string, number> = {};
  if (cost.gold) inc.gold = -cost.gold;
  if (cost.shards) inc.shards = -cost.shards;
  const col = await playersCol();
  const doc = Object.keys(inc).length
    ? await col.findOneAndUpdate(
        {
          _id: Number(id),
          ...(cost.gold ? { gold: { $gte: cost.gold } } : {}),
          ...(cost.shards ? { shards: { $gte: cost.shards } } : {}),
        },
        { $inc: inc },
        { returnDocument: "after" },
      )
    : await col.findOne({ _id: Number(id) });
  if (!doc) return null;
  const currency = cost.gold ? "gold" : cost.shards ? "shards" : null;
  await logTxn(doc._id, {
    kind: txn.kind,
    currency,
    amount: -(cost.gold ?? cost.shards ?? 0),
    itemId: txn.itemId,
    balanceAfter: currency === "gold" ? doc.gold : currency === "shards" ? doc.shards : undefined,
    meta: cost.gold && cost.shards ? { ...txn.meta, shards: -cost.shards } : txn.meta,
  });
  return doc;
}

export async function addXpGold(
  id: number, gold: number, xp: number, won: boolean, kind = "match_reward",
): Promise<{ levelUps: number; level: number }> {
  const col = await playersCol();
  const doc = await col.findOneAndUpdate(
    { _id: id },
    { $inc: { gold, xp, wins: won ? 1 : 0, losses: won ? 0 : 1 } },
    { returnDocument: "after" },
  );
  if (!doc) throw new Error(`No player ${id}`);
  let level = doc.level ?? 1;
  let curXp = doc.xp ?? 0;
  let levelUps = 0;
  while (curXp >= 100 * level) {
    curXp -= 100 * level;
    level += 1;
    levelUps += 1;
  }
  if (levelUps > 0) {
    await col.updateOne({ _id: id, level: { $lt: level } }, { $set: { level, xp: curXp } });
    await grantPacks(id, "standard", levelUps);
  }
  await logTxn(id, {
    kind, currency: "gold", amount: gold, balanceAfter: doc.gold, meta: { xp, won },
  });
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
