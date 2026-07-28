/** Wipe every Shardfall collection (players, matches, auth, progress) so the
 *  world can be re-seeded from scratch.
 *  Run: npx tsx --env-file=.env.local scripts/reset-db.ts */

import { getDb, getMongoClient } from "../lib/server/db";

async function main() {
  const db = await getDb();
  const cols = await db.listCollections().toArray();
  if (cols.length === 0) {
    console.log("database already empty");
  }
  for (const c of cols) {
    const res = await db.collection(c.name).deleteMany({});
    console.log(`cleared ${c.name}: ${res.deletedCount}`);
  }
  await getMongoClient().close();
}

main().catch(async (err) => {
  console.error(err);
  await getMongoClient().close().catch(() => {});
  process.exit(1);
});
