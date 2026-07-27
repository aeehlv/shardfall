import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

/** Dev database (SQLite). For Vercel production swap to Postgres — see docs/GAME_PLAN.md. */

const DATA_DIR = path.join(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

declare global {
  // eslint-disable-next-line no-var
  var __shardfallDb: Database.Database | undefined;
}

export const db: Database.Database =
  globalThis.__shardfallDb ?? new Database(path.join(DATA_DIR, "shardfall.db"));
globalThis.__shardfallDb = db;

db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId TEXT UNIQUE,               -- better-auth user id (NULL for bots)
  name TEXT NOT NULL,
  isBot INTEGER NOT NULL DEFAULT 0,
  rating INTEGER NOT NULL DEFAULT 1000,
  league TEXT NOT NULL DEFAULT 'Bronze',
  gold INTEGER NOT NULL DEFAULT 300,
  shards INTEGER NOT NULL DEFAULT 20,
  xp INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  packs TEXT NOT NULL DEFAULT '{}',        -- {"small":0,"standard":0,"grand":0}
  collection TEXT NOT NULL DEFAULT '{}',   -- {cardId: copies}
  decks TEXT NOT NULL DEFAULT '{}',        -- {name: [cardIds]}
  createdAt INTEGER NOT NULL DEFAULT (unixepoch()*1000)
);
CREATE INDEX IF NOT EXISTS idx_players_rating ON players(rating);
CREATE INDEX IF NOT EXISTS idx_players_bot ON players(isBot, rating);

CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,                 -- ranked | friendly | campaign
  p0 INTEGER NOT NULL,                -- player id (P0 in state)
  p1 INTEGER NOT NULL,
  state TEXT NOT NULL,                -- GameState JSON
  seq INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',  -- active | finished
  winner INTEGER,                     -- 0 | 1
  turnDeadline INTEGER NOT NULL,
  campaignNode TEXT,
  rewards TEXT,                       -- JSON per player after finish
  createdAt INTEGER NOT NULL DEFAULT (unixepoch()*1000),
  updatedAt INTEGER NOT NULL DEFAULT (unixepoch()*1000)
);
CREATE INDEX IF NOT EXISTS idx_matches_players ON matches(p0, status);

CREATE TABLE IF NOT EXISTS match_events (
  matchId TEXT NOT NULL,
  seq INTEGER NOT NULL,
  events TEXT NOT NULL,               -- GameEvent[] JSON for this seq step
  PRIMARY KEY (matchId, seq)
);

CREATE TABLE IF NOT EXISTS queue (
  playerId INTEGER PRIMARY KEY,
  rating INTEGER NOT NULL,
  since INTEGER NOT NULL,
  matchId TEXT                        -- set when paired
);

CREATE TABLE IF NOT EXISTS friends (
  a INTEGER NOT NULL,
  b INTEGER NOT NULL,
  PRIMARY KEY (a, b)
);

CREATE TABLE IF NOT EXISTS friend_requests (
  fromId INTEGER NOT NULL,
  toId INTEGER NOT NULL,
  createdAt INTEGER NOT NULL DEFAULT (unixepoch()*1000),
  PRIMARY KEY (fromId, toId)
);

CREATE TABLE IF NOT EXISTS battle_invites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fromId INTEGER NOT NULL,
  toId INTEGER NOT NULL,
  matchId TEXT,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | accepted | declined
  createdAt INTEGER NOT NULL DEFAULT (unixepoch()*1000)
);

CREATE TABLE IF NOT EXISTS campaign_progress (
  playerId INTEGER NOT NULL,
  nodeId TEXT NOT NULL,
  stars INTEGER NOT NULL DEFAULT 1,
  clearedAt INTEGER NOT NULL DEFAULT (unixepoch()*1000),
  PRIMARY KEY (playerId, nodeId)
);
`);

export function leagueFor(rating: number): string {
  if (rating < 1100) return "Bronze";
  if (rating < 1300) return "Silver";
  if (rating < 1500) return "Gold";
  if (rating < 1700) return "Diamond";
  return "Legend";
}
