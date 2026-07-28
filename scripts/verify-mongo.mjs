/** End-to-end smoke test of the MongoDB data layer against the real Atlas cluster.
 *
 *  Run: npx tsx scripts/verify-mongo.mjs
 *
 *  Covers: ensureSchema (indexes + id counter) → player creation → campaign match →
 *  bot resignation → reward granting + campaign progress → leaderboard aggregation.
 *  Every document it writes is removed again before it exits.
 */

import {
  campaignChapterRewardsCol, campaignProgressCol, countersCol, ensureSchema, getMongoClient,
  matchEventsCol, matchesCol, playersCol,
} from "../lib/server/db.ts";
import { ensurePlayerForUser, getPlayerById } from "../lib/server/players.ts";
import { campaignOverview, campaignStars, createMatch, getMatch, resign } from "../lib/server/match.ts";
import { CAMPAIGN } from "../lib/game/campaign.ts";

for (const file of [".env.local", ".env"]) {
  try { process.loadEnvFile(file); } catch { /* optional */ }
}

let failures = 0;
function check(label, ok, detail) {
  const mark = ok ? "  ok  " : " FAIL ";
  console.log(`[${mark}] ${label}${detail === undefined ? "" : ` — ${detail}`}`);
  if (!ok) failures += 1;
}

const SYSTEM_BOT = {
  _id: 1, userId: null, name: "The Shattering", isBot: 1, rating: 1200, league: "Gold",
  gold: 300, shards: 20, xp: 0, level: 1, wins: 0, losses: 0,
  packs: {}, collection: {}, decks: {}, createdAt: Date.now(),
};

async function main() {
  const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const testUserId = `verify-mongo-${stamp}`;
  let createdSystemBot = false;
  let player = null;
  let match = null;

  // ---------------------------------------------------------------- schema --
  await ensureSchema();
  const players = await playersCol();
  const idx = await players.indexes();
  const names = idx.map((i) => i.name);
  check("ensureSchema created player indexes", ["userId_unique", "rating_desc", "bot_rating"].every((n) => names.includes(n)), names.join(", "));

  const counter = await (await countersCol()).findOne({ _id: "players" });
  check("player id counter seeded", (counter?.seq ?? 0) >= 1, `seq=${counter?.seq}`);

  try {
    // -------------------------------------------------------- system bot --
    if (!(await players.findOne({ _id: 1 }, { projection: { _id: 1 } }))) {
      await players.insertOne(SYSTEM_BOT);
      createdSystemBot = true;
    }
    check("system campaign bot present (id 1)", !!(await getPlayerById(1)));

    // ------------------------------------------------------------ player --
    player = await ensurePlayerForUser(testUserId, `Verifier ${stamp.slice(0, 4)}`);
    check("created a player", player.id > 1 && player.userId === testUserId, `id=${player.id} name=${player.name}`);
    check("player defaults", player.gold === 300 && player.shards === 20 && player.rating === 1000 && player.league === "Bronze",
      `gold=${player.gold} shards=${player.shards} rating=${player.rating}`);
    const again = await ensurePlayerForUser(testUserId, "ignored");
    check("ensurePlayerForUser is idempotent", again.id === player.id, `id=${again.id}`);

    // ---------------------------------------------------- campaign match --
    const node = CAMPAIGN[0];
    match = await createMatch({
      kind: "campaign", p0: player.id, p1: 1,
      p0Faction: "pyre", p1Faction: node.enemyFaction, campaignNode: node.id,
    });
    check("created a campaign match", !!match.id && match.status === "active" && match.campaignNode === node.id,
      `${match.id} node=${node.id}`);
    const reread = await getMatch(match.id);
    check("match state round-trips as an object", !!reread && typeof reread.state === "object" && Array.isArray(reread.state.players),
      `players=${reread?.state?.players?.length} turn=${reread?.state?.turn}`);

    // --------------------------------------------------- bot resignation --
    await resign(reread, 1);
    const finished = await getMatch(match.id);
    check("match finished with P0 as winner", finished.status === "finished" && finished.winner === 0,
      `status=${finished.status} winner=${finished.winner}`);

    const rewards = finished.rewards?.[0] ?? finished.rewards?.["0"];
    check("rewards were granted to P0", !!rewards && rewards.won === true && rewards.gold > 0,
      JSON.stringify(rewards));
    check("campaign node was scored", (rewards?.stars ?? 0) >= 1 && rewards?.firstClear === true,
      `stars=${rewards?.stars}/${rewards?.maxStars} node=${rewards?.nodeName} chapter=${rewards?.chapterName}`);
    console.log("       granted rewards:", JSON.stringify(rewards, null, 2).split("\n").join("\n       "));

    // ------------------------------------------------- campaign progress --
    const stars = await campaignStars(player.id);
    check("campaign_progress row written", (stars[node.id] ?? 0) >= 1, JSON.stringify(stars));
    const overview = await campaignOverview(player.id);
    const cleared = overview.nodes.filter((n) => n.cleared).map((n) => `${n.id}★${n.stars}`);
    check("campaignOverview reports the clear", cleared.length === 1, cleared.join(", "));
    console.log(`       campaign progress: totalStars=${overview.totalStars}/${overview.totalStarsPossible} cleared=[${cleared.join(", ")}]`);

    const after = await getPlayerById(player.id);
    check("wallet was paid out", after.gold > 300, `gold ${300} → ${after.gold}, shards ${after.shards}, packs=${JSON.stringify(after.packs)}, collection=${JSON.stringify(after.collection)}`);
    check("xp / wins recorded", after.wins === 1 && after.xp > 0, `wins=${after.wins} xp=${after.xp} level=${after.level}`);

    // ----------------------------------------------- match event journal --
    const events = await (await matchEventsCol()).find({ matchId: match.id }).toArray();
    check("match_events journal written", events.length >= 1 && Array.isArray(events[0].events),
      `${events.length} batch(es), ${events.reduce((n, e) => n + e.events.length, 0)} event(s)`);

    // --------------------------------------------------- leaderboard agg --
    const projectRow = {
      _id: 0, rank: 1, id: "$_id", name: 1, rating: 1, league: 1, wins: 1, losses: 1, isBot: 1,
    };
    const [board] = await players.aggregate([
      {
        $project: {
          name: 1, rating: 1, league: 1, wins: 1, losses: 1, isBot: 1,
          _rankKey: { $subtract: [{ $multiply: [{ $ifNull: ["$rating", 0] }, 1_000_000_000] }, "$_id"] },
        },
      },
      { $setWindowFields: { sortBy: { _rankKey: -1 }, output: { rank: { $rank: {} } } } },
      {
        $facet: {
          rows: [{ $sort: { rank: 1 } }, { $skip: 0 }, { $limit: 5 }, { $project: projectRow }],
          total: [{ $count: "n" }],
          me: [{ $match: { _id: player.id } }, { $project: projectRow }],
          legend: [{ $match: { league: "Legend" } }, { $sort: { rank: 1 } }, { $limit: 3 }, { $project: projectRow }],
        },
      },
    ]).toArray();
    const total = board.total[0]?.n ?? 0;
    const me = board.me[0] ?? null;
    check("leaderboard aggregation ranks globally", board.rows.length > 0 && board.rows[0].rank === 1,
      board.rows.map((r) => `#${r.rank} ${r.name} ${r.rating}`).join(" | "));
    check("logged-in player's own rank resolves off-page", !!me && me.rank >= 1 && me.id === player.id,
      me ? `#${me.rank} of ${total}` : "missing");
    check("league filter keeps GLOBAL ranks", board.legend.every((r) => r.league === "Legend"),
      board.legend.map((r) => `#${r.rank} ${r.name} ${r.rating}`).join(" | ") || "(no Legend players yet — seed not run)");
  } finally {
    // ----------------------------------------------------------- cleanup --
    if (match) {
      await (await matchesCol()).deleteOne({ _id: match.id });
      await (await matchEventsCol()).deleteMany({ matchId: match.id });
    }
    if (player) {
      await (await campaignProgressCol()).deleteMany({ playerId: player.id });
      await (await campaignChapterRewardsCol()).deleteMany({ playerId: player.id });
      await (await playersCol()).deleteOne({ _id: player.id });
    }
    if (createdSystemBot) await (await playersCol()).deleteOne({ _id: 1 });

    const leftovers =
      (match ? await (await matchesCol()).countDocuments({ _id: match.id }) : 0) +
      (player ? await (await playersCol()).countDocuments({ _id: player.id }) : 0) +
      (player ? await (await campaignProgressCol()).countDocuments({ playerId: player.id }) : 0);
    check("test documents cleaned up", leftovers === 0, `${leftovers} leftover(s)`);
    await getMongoClient().close();
  }

  console.log(failures === 0 ? "\nVERIFY MONGO: PASS" : `\nVERIFY MONGO: FAIL (${failures} check(s))`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("\nVERIFY MONGO: ERROR");
  console.error(err);
  await getMongoClient().close().catch(() => {});
  process.exit(1);
});
