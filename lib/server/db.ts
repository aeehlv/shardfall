/** Shardfall data layer — MongoDB (Atlas) for Vercel serverless.
 *
 *  Serverless-safe: the driver client and its `connect()` promise are cached on
 *  `globalThis`, so warm lambda invocations (and Next dev HMR) reuse one pool
 *  instead of opening a connection per request. Index creation runs at most once
 *  per process, guarded by a module-level promise.
 */

import { MongoClient, type Collection, type Db } from "mongodb";
import type { GameEvent, GameState } from "@/lib/game/types";

// ---------------------------------------------------------------- documents --

/** A player. `_id` is a sequential number (id 1 is the system campaign bot). */
export interface PlayerDoc {
  _id: number;
  /** better-auth user id; `null` for bots. */
  userId: string | null;
  name: string;
  /** 0 | 1 — kept numeric so existing `isBot=1` style checks keep working. */
  isBot: number;
  rating: number;
  league: string;
  gold: number;
  shards: number;
  xp: number;
  level: number;
  wins: number;
  losses: number;
  /** {"small":n,"standard":n,"grand":n} — a real object, not a JSON string. */
  packs: Record<string, number>;
  /** {cardId: copies} */
  collection: Record<string, number>;
  /** {deckName: [cardIds]} */
  decks: Record<string, string[]>;
  createdAt: number;
}

/** Per-player finish rewards, keyed by seat index ("0" / "1"). Shape lives in match.ts. */
export type MatchRewardsDoc = Record<string, unknown>;

export interface MatchDoc {
  /** uuid */
  _id: string;
  kind: string;
  p0: number;
  p1: number;
  /** The GameState stored as a real BSON document (not a JSON string). */
  state: GameState;
  seq: number;
  status: string;
  winner: number | null;
  turnDeadline: number;
  campaignNode: string | null;
  rewards: MatchRewardsDoc | null;
  /** Running tallies maintained by the match layer (the engine stays rules-pure). */
  p0Spells: number;
  p0UnitsLost: number;
  createdAt: number;
  updatedAt: number;
}

export interface MatchEventDoc {
  matchId: string;
  seq: number;
  events: GameEvent[];
}

/** Ranked queue ticket. `_id` is the player id (the old queue + queue_meta rows merged). */
export interface QueueDoc {
  _id: number;
  rating: number;
  since: number;
  matchId: string | null;
  faction: string;
}

export interface FriendDoc {
  a: number;
  b: number;
}

export interface FriendRequestDoc {
  fromId: number;
  toId: number;
  createdAt: number;
}

export interface BattleInviteDoc {
  /** auto ObjectId, surfaced to clients as a hex string */
  fromId: number;
  toId: number;
  matchId: string | null;
  status: string;
  faction: string;
  createdAt: number;
}

export interface CampaignProgressDoc {
  playerId: number;
  nodeId: string;
  stars: number;
  clearedAt: number;
}

export interface CampaignChapterRewardDoc {
  playerId: number;
  chapter: number;
  stars: number;
  grantedAt: number;
}

export interface CounterDoc {
  _id: string;
  seq: number;
}

// ------------------------------------------------------------------- client --

declare global {
  // eslint-disable-next-line no-var
  var __shardfallMongoClient: MongoClient | undefined;
  // eslint-disable-next-line no-var
  var __shardfallMongoClientPromise: Promise<MongoClient> | undefined;
  // eslint-disable-next-line no-var
  var __shardfallMongoSchema: Promise<void> | undefined;
}

function mongoUri(): string {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      "MONGODB_URI is not set — add the Atlas connection string to .env.local / the Vercel project.",
    );
  }
  return uri;
}

/** Database name: `MONGODB_DB`, else the path in the URI, else "shardfall". */
function dbName(): string {
  if (process.env.MONGODB_DB) return process.env.MONGODB_DB;
  const path = mongoUri().split("?")[0].split("/")[3];
  return path && path.length > 0 ? decodeURIComponent(path) : "shardfall";
}

/** The (lazily constructed) driver client. Constructing it does not connect. */
export function getMongoClient(): MongoClient {
  if (!globalThis.__shardfallMongoClient) {
    globalThis.__shardfallMongoClient = new MongoClient(mongoUri(), {
      maxPoolSize: 10,
      minPoolSize: 0,
      // Match JSON.stringify semantics: drop undefined instead of storing null.
      ignoreUndefined: true,
      retryWrites: true,
      serverSelectionTimeoutMS: 15_000,
    });
  }
  return globalThis.__shardfallMongoClient;
}

/** The cached connect() promise — the thing that must survive across invocations. */
export function getClientPromise(): Promise<MongoClient> {
  if (!globalThis.__shardfallMongoClientPromise) {
    globalThis.__shardfallMongoClientPromise = getMongoClient()
      .connect()
      .catch((err) => {
        // Never cache a rejected connection: let the next request retry.
        globalThis.__shardfallMongoClientPromise = undefined;
        globalThis.__shardfallMongoClient = undefined;
        throw err;
      });
  }
  return globalThis.__shardfallMongoClientPromise;
}

/** Connected Db WITHOUT the schema guarantee — only ensureSchema() may use this. */
async function rawDb(): Promise<Db> {
  return (await getClientPromise()).db(dbName());
}

/** Synchronous Db handle (the driver connects lazily on first operation).
 *  Needed by better-auth's mongodbAdapter, which wants a `Db` up front. */
export function getDbSync(): Db {
  return getMongoClient().db(dbName());
}

// ------------------------------------------------------------------- schema --

const PLAYER_COUNTER = "players";

async function buildSchema(): Promise<void> {
  const db = await rawDb();
  await Promise.all([
    db.collection<PlayerDoc>("players").createIndexes([
      // "sparse unique" done properly: null/missing userIds (bots) must not collide.
      { key: { userId: 1 }, name: "userId_unique", unique: true, partialFilterExpression: { userId: { $type: "string" } } },
      { key: { rating: -1 }, name: "rating_desc" },
      { key: { isBot: 1, rating: 1 }, name: "bot_rating" },
      { key: { name: 1 }, name: "name_idx" },
    ]),
    db.collection<MatchDoc>("matches").createIndexes([
      { key: { p0: 1, status: 1 }, name: "p0_status" },
      { key: { p1: 1, status: 1 }, name: "p1_status" },
      { key: { updatedAt: -1 }, name: "updatedAt_desc" },
    ]),
    db.collection<MatchEventDoc>("match_events").createIndexes([
      { key: { matchId: 1, seq: 1 }, name: "match_seq_unique", unique: true },
    ]),
    db.collection<QueueDoc>("queue").createIndexes([
      { key: { matchId: 1, rating: 1 }, name: "pairing" },
      { key: { since: 1 }, name: "since_idx" },
    ]),
    db.collection<FriendDoc>("friends").createIndexes([
      { key: { a: 1, b: 1 }, name: "friend_pair_unique", unique: true },
    ]),
    db.collection<FriendRequestDoc>("friend_requests").createIndexes([
      { key: { fromId: 1, toId: 1 }, name: "request_pair_unique", unique: true },
      { key: { toId: 1 }, name: "to_idx" },
    ]),
    db.collection<BattleInviteDoc>("battle_invites").createIndexes([
      { key: { toId: 1, status: 1 }, name: "to_status" },
      { key: { fromId: 1, createdAt: -1 }, name: "from_created" },
    ]),
    db.collection<CampaignProgressDoc>("campaign_progress").createIndexes([
      { key: { playerId: 1, nodeId: 1 }, name: "player_node_unique", unique: true },
    ]),
    db.collection<CampaignChapterRewardDoc>("campaign_chapter_rewards").createIndexes([
      { key: { playerId: 1, chapter: 1 }, name: "player_chapter_unique", unique: true },
    ]),
  ]);

  // Sequential player ids: never hand out an id at or below the highest one in use,
  // and never hand out 1 (reserved for the system campaign bot "The Shattering").
  const top = await db
    .collection<PlayerDoc>("players")
    .find({}, { projection: { _id: 1 }, sort: { _id: -1 }, limit: 1 })
    .next();
  const floor = Math.max(1, top?._id ?? 0);
  await db
    .collection<CounterDoc>("counters")
    .updateOne({ _id: PLAYER_COUNTER }, { $max: { seq: floor } }, { upsert: true });
}

/** Create indexes / seed counters exactly once per process. Safe to call anywhere. */
export function ensureSchema(): Promise<void> {
  if (!globalThis.__shardfallMongoSchema) {
    globalThis.__shardfallMongoSchema = buildSchema().catch((err) => {
      globalThis.__shardfallMongoSchema = undefined;
      throw err;
    });
  }
  return globalThis.__shardfallMongoSchema;
}

/** Connected database with indexes guaranteed. */
export async function getDb(): Promise<Db> {
  await ensureSchema();
  return rawDb();
}

// ------------------------------------------------------ collection accessors --

export async function playersCol(): Promise<Collection<PlayerDoc>> {
  return (await getDb()).collection<PlayerDoc>("players");
}
export async function matchesCol(): Promise<Collection<MatchDoc>> {
  return (await getDb()).collection<MatchDoc>("matches");
}
export async function matchEventsCol(): Promise<Collection<MatchEventDoc>> {
  return (await getDb()).collection<MatchEventDoc>("match_events");
}
export async function queueCol(): Promise<Collection<QueueDoc>> {
  return (await getDb()).collection<QueueDoc>("queue");
}
export async function friendsCol(): Promise<Collection<FriendDoc>> {
  return (await getDb()).collection<FriendDoc>("friends");
}
export async function friendRequestsCol(): Promise<Collection<FriendRequestDoc>> {
  return (await getDb()).collection<FriendRequestDoc>("friend_requests");
}
export async function battleInvitesCol(): Promise<Collection<BattleInviteDoc>> {
  return (await getDb()).collection<BattleInviteDoc>("battle_invites");
}
export async function campaignProgressCol(): Promise<Collection<CampaignProgressDoc>> {
  return (await getDb()).collection<CampaignProgressDoc>("campaign_progress");
}
export async function campaignChapterRewardsCol(): Promise<Collection<CampaignChapterRewardDoc>> {
  return (await getDb()).collection<CampaignChapterRewardDoc>("campaign_chapter_rewards");
}
export async function countersCol(): Promise<Collection<CounterDoc>> {
  return (await getDb()).collection<CounterDoc>("counters");
}

// ------------------------------------------------------------------ counters --

/** Reserve a contiguous block of player ids; returns the FIRST id of the block. */
export async function reservePlayerIds(count: number): Promise<number> {
  const counters = await countersCol();
  const doc = await counters.findOneAndUpdate(
    { _id: PLAYER_COUNTER },
    { $inc: { seq: count } },
    { upsert: true, returnDocument: "after" },
  );
  const seq = doc?.seq ?? count;
  return seq - count + 1;
}

/** Next sequential player id (always >= 2 — id 1 is the system campaign bot). */
export async function nextPlayerId(): Promise<number> {
  return reservePlayerIds(1);
}

// -------------------------------------------------------------------- ladder --

export function leagueFor(rating: number): string {
  if (rating < 1100) return "Bronze";
  if (rating < 1300) return "Silver";
  if (rating < 1500) return "Gold";
  if (rating < 1700) return "Diamond";
  return "Legend";
}
