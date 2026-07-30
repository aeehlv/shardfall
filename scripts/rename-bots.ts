/** One-shot: regenerate every seeded bot's display name with the mixed-style
 *  generator in lib/game/bot-names.ts (the original seed used one obvious
 *  Prefix+Noun template that read as generated). Skips the system campaign
 *  bot (id 1) and all human players. Idempotent in effect — re-running just
 *  rolls fresh names. Run: npx tsx scripts/rename-bots.ts */

import { getMongoClient, playersCol } from "../lib/server/db";
import { uniqueBotName } from "../lib/game/bot-names";

for (const file of [".env.local", ".env"]) {
  try { process.loadEnvFile(file); } catch { /* optional */ }
}

function mulberry(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function main() {
  const players = await playersCol();
  const rand = mulberry(20260730);
  const used = new Set<string>();

  // Reserve every human name so a bot can't collide with a real player.
  const humans = await players.find({ isBot: { $ne: 1 } }, { projection: { name: 1 } }).toArray();
  for (const h of humans) used.add(h.name);

  const bots = await players
    .find({ isBot: 1, _id: { $ne: 1 } }, { projection: { _id: 1 } })
    .sort({ _id: 1 })
    .toArray();
  console.log(`renaming ${bots.length} bots (${humans.length} human names reserved)`);

  const BATCH = 1000;
  let done = 0;
  for (let i = 0; i < bots.length; i += BATCH) {
    const ops = bots.slice(i, i + BATCH).map((b) => ({
      updateOne: { filter: { _id: b._id }, update: { $set: { name: uniqueBotName(rand, used) } } },
    }));
    await players.bulkWrite(ops, { ordered: false });
    done += ops.length;
    process.stdout.write(`  renamed ${done}/${bots.length}\r`);
  }
  process.stdout.write("\n");

  const sample = await players
    .find({ isBot: 1, _id: { $ne: 1 } }, { projection: { name: 1, rating: 1 } })
    .sort({ rating: -1 })
    .limit(15)
    .toArray();
  console.log("new ladder top:", sample.map((s) => s.name).join(" · "));
  await getMongoClient().close();
}

main().catch(async (err) => {
  console.error(err);
  await getMongoClient().close().catch(() => {});
  process.exit(1);
});
