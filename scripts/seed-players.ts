/** Seed the ladder into MongoDB:
 *    - the system campaign bot, id 1 ("The Shattering")
 *    - 10,000 bots with rating ~ normal(1200, 144) clamped to [700, 2400]
 *    - 220 Legend-tier elites (rating 1700-2399) — the ladder top the normal
 *      distribution can never reach, so the Legend league is not empty
 *  Reads MONGODB_URI from .env.local / .env (or whatever the environment injects).
 *  Idempotent: re-running only fills in whatever is missing.
 *  Run: npx tsx scripts/seed-players.ts */

import {
  ensureSchema, getMongoClient, leagueFor, playersCol, reservePlayerIds, type PlayerDoc,
} from "../lib/server/db";
import { uniqueBotName } from "../lib/game/bot-names";

/** Scripts run outside Next, so pull MONGODB_URI out of .env.local / .env ourselves.
 *  (db.ts reads process.env lazily, so doing this after the imports is safe.) */
for (const file of [".env.local", ".env"]) {
  try { process.loadEnvFile(file); } catch { /* optional */ }
}

const TOTAL = 10_000;
const ELITES = 220;
const BATCH = 1000;

function mulberry(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry(20260727);
/** Separate stream so the 10,000 keep their original ratings bit-for-bit. */
const eliteRand = mulberry(20260728);

function baseDoc(id: number, name: string, rating: number, wins: number, losses: number, level: number): PlayerDoc {
  return {
    _id: id,
    userId: null,
    name,
    isBot: 1,
    rating,
    league: leagueFor(rating),
    gold: 300,
    shards: 20,
    xp: 0,
    level,
    wins,
    losses,
    packs: {},
    collection: {},
    decks: {},
    createdAt: Date.now(),
  };
}

async function main() {
  await ensureSchema();
  const players = await playersCol();

  // system campaign bot occupies id 1
  const sys = await players.findOne({ _id: 1 }, { projection: { _id: 1 } });
  if (!sys) {
    await players.insertOne({
      ...baseDoc(1, "The Shattering", 1200, 0, 0, 1),
      league: "Gold",
    });
    console.log("inserted system campaign bot (id 1)");
  }

  /** insertMany in fixed-size batches; returns how many documents went in. */
  async function insertBatched(docs: PlayerDoc[], label: string): Promise<number> {
    let done = 0;
    for (let i = 0; i < docs.length; i += BATCH) {
      const slice = docs.slice(i, i + BATCH);
      await players.insertMany(slice, { ordered: false });
      done += slice.length;
      process.stdout.write(`  ${label}: ${done}/${docs.length}\r`);
    }
    if (docs.length) process.stdout.write("\n");
    return done;
  }

  const existing = await players.countDocuments({ isBot: 1 });
  const legends = await players.countDocuments({ isBot: 1, league: "Legend" });

  // ------------------------------------------------------- 10,000 ladder bots --
  if (existing > 9000) {
    console.log(`already seeded (${existing} bots)`);
  } else {
    const usedNames = new Set<string>();
    // One counter bump for the whole run: ids stay sequential and never collide with id 1.
    const firstId = await reservePlayerIds(TOTAL);
    const docs: PlayerDoc[] = [];

    for (let i = 0; i < TOTAL; i++) {
      const name = uniqueBotName(rand, usedNames);
      // rating ~ normal(1200, 250) clamped
      const r = Math.round(1200 + (rand() + rand() + rand() + rand() - 2) * 250);
      const rating = Math.max(700, Math.min(2400, r));
      const games = Math.floor(rand() * 300);
      const winRate = 0.35 + (rating - 700) / (2400 - 700) * 0.3;
      const wins = Math.round(games * winRate);
      docs.push(baseDoc(firstId + i, name, rating, wins, games - wins, 1 + Math.floor(games / 12)));
    }
    console.log(`inserted ${await insertBatched(docs, "bots")} bots`);
  }

  // ------------------------------------------------------ 220 Legend elites --
  // The four-uniform sum caps out at 1700, so the ladder above Diamond stays empty
  // unless the elites are seeded on top of it.
  if (legends >= ELITES - 20) {
    console.log(`already seeded (${legends} Legend elites)`);
  } else {
    const eliteNames = new Set<string>();
    const firstEliteId = await reservePlayerIds(ELITES);
    const docs: PlayerDoc[] = [];
    for (let i = 0; i < ELITES; i++) {
      const name = uniqueBotName(eliteRand, eliteNames);
      const rating = 1700 + Math.floor(eliteRand() * 700);
      const games = 200 + Math.floor(eliteRand() * 400);
      const wins = Math.round(games * 0.6);
      docs.push(baseDoc(firstEliteId + i, name, rating, wins, games - wins, 10 + Math.floor(games / 15)));
    }
    console.log(`inserted ${await insertBatched(docs, "elites")} Legend elites`);
  }

  const byLeague = await players
    .aggregate([
      { $match: { isBot: 1 } },
      { $group: { _id: "$league", c: { $sum: 1 } } },
      { $sort: { c: -1 } },
      { $project: { _id: 0, league: "$_id", c: 1 } },
    ])
    .toArray();
  console.log("seeded:", byLeague);
  await getMongoClient().close();
}

main().catch(async (err) => {
  console.error(err);
  await getMongoClient().close().catch(() => {});
  process.exit(1);
});
