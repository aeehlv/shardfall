/** Seed 10,000 bot players across leagues + the system campaign bot (id 1).
 *  Run: npx tsx scripts/seed-players.ts */

import { db, leagueFor } from "../lib/server/db";

const ADJ = ["Ember", "Shard", "Gloom", "Storm", "Iron", "Ash", "Tide", "Root", "Gold", "Pale",
  "Grim", "Swift", "Dusk", "Dawn", "Hollow", "Bright", "Silent", "Wild", "Frost", "Crag",
  "Molten", "Deep", "Verdant", "Star", "Rune", "Oath", "Blood", "Sun", "Moon", "Void"];
const NOUN = ["blade", "song", "hammer", "warden", "whisper", "fang", "crown", "seeker", "caller", "born",
  "hunter", "weaver", "keeper", "strider", "bane", "heart", "gaze", "shield", "spear", "wing",
  "howl", "root", "spark", "tide", "veil", "mark", "forge", "path", "watcher", "reign"];

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

// system campaign bot occupies id 1
const sys = db.prepare("SELECT id FROM players WHERE id = 1").get();
if (!sys) {
  db.prepare("INSERT INTO players (id, userId, name, isBot, rating, league) VALUES (1, NULL, 'The Shattering', 1, 1200, 'Gold')").run();
}

const existing = (db.prepare("SELECT COUNT(*) AS c FROM players WHERE isBot = 1").get() as { c: number }).c;
if (existing > 9000) {
  console.log(`already seeded (${existing} bots)`);
  process.exit(0);
}

const insert = db.prepare(
  "INSERT INTO players (userId, name, isBot, rating, league, wins, losses, level) VALUES (NULL, ?, 1, ?, ?, ?, ?, ?)",
);
const usedNames = new Set<string>();
const tx = db.transaction(() => {
  for (let i = 0; i < 10_000; i++) {
    let name: string;
    if (i % 2 === 0) {
      name = `player${String(10_000_000 + Math.floor(rand() * 89_999_999))}`;
    } else {
      do {
        name = `${ADJ[Math.floor(rand() * ADJ.length)]}${NOUN[Math.floor(rand() * NOUN.length)]}${rand() < 0.35 ? String(Math.floor(rand() * 99)) : ""}`;
      } while (usedNames.has(name));
      usedNames.add(name);
    }
    // rating ~ normal(1200, 250) clamped
    const r = Math.round(1200 + (rand() + rand() + rand() + rand() - 2) * 250);
    const rating = Math.max(700, Math.min(2400, r));
    const games = Math.floor(rand() * 300);
    const winRate = 0.35 + (rating - 700) / (2400 - 700) * 0.3;
    const wins = Math.round(games * winRate);
    insert.run(name, rating, leagueFor(rating), wins, games - wins, 1 + Math.floor(games / 12));
  }
});
tx();

const byLeague = db.prepare("SELECT league, COUNT(*) c FROM players WHERE isBot=1 GROUP BY league ORDER BY c DESC").all();
console.log("seeded:", byLeague);
