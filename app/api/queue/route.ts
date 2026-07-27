import { NextResponse } from "next/server";
import { sessionPlayer } from "@/lib/server/session";
import { db } from "@/lib/server/db";
import { createMatch } from "@/lib/server/match";
import { getPlayerById } from "@/lib/server/players";
import type { FactionId } from "@/lib/game/types";

export const dynamic = "force-dynamic";
const BOT_FALLBACK_MS = 15_000;

const factions: FactionId[] = ["pyre", "abyss", "verdant"];
const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

export async function POST(req: Request) {
  const player = await sessionPlayer();
  if (!player) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const { faction } = await req.json();
  db.prepare("INSERT OR REPLACE INTO queue (playerId, rating, since, matchId) VALUES (?, ?, ?, NULL)")
    .run(player.id, player.rating, Date.now());
  db.prepare("CREATE TABLE IF NOT EXISTS queue_meta (playerId INTEGER PRIMARY KEY, faction TEXT)").run();
  db.prepare("INSERT OR REPLACE INTO queue_meta (playerId, faction) VALUES (?, ?)")
    .run(player.id, factions.includes(faction) ? faction : "pyre");
  return NextResponse.json({ queued: true });
}

export async function GET() {
  const player = await sessionPlayer();
  if (!player) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const row = db.prepare("SELECT * FROM queue WHERE playerId=?").get(player.id) as
    { playerId: number; rating: number; since: number; matchId: string | null } | undefined;
  if (!row) return NextResponse.json({ queued: false });
  if (row.matchId) {
    db.prepare("DELETE FROM queue WHERE playerId=?").run(player.id);
    return NextResponse.json({ matchId: row.matchId });
  }
  const myFaction = ((db.prepare("SELECT faction FROM queue_meta WHERE playerId=?").get(player.id) as { faction: string } | undefined)?.faction ?? "pyre") as FactionId;
  const waited = Date.now() - row.since;
  const window = 150 + Math.floor(waited / 5000) * 100;
  // try to pair with another queued human
  const other = db.prepare(
    `SELECT * FROM queue WHERE playerId != ? AND matchId IS NULL AND ABS(rating - ?) <= ? ORDER BY since LIMIT 1`,
  ).get(player.id, row.rating, window) as { playerId: number } | undefined;
  if (other) {
    const otherFaction = ((db.prepare("SELECT faction FROM queue_meta WHERE playerId=?").get(other.playerId) as { faction: string } | undefined)?.faction ?? "pyre") as FactionId;
    const m = createMatch({ kind: "ranked", p0: other.playerId, p1: player.id, p0Faction: otherFaction, p1Faction: myFaction });
    db.prepare("UPDATE queue SET matchId=? WHERE playerId=?").run(m.id, other.playerId);
    db.prepare("DELETE FROM queue WHERE playerId=?").run(player.id);
    return NextResponse.json({ matchId: m.id });
  }
  // bot fallback after 15s: closest-rated bot
  if (waited >= BOT_FALLBACK_MS) {
    const bot = db.prepare(
      "SELECT id FROM players WHERE isBot=1 AND id != 1 ORDER BY ABS(rating - ?) LIMIT 1",
    ).get(row.rating) as { id: number } | undefined;
    if (bot) {
      const botPlayer = getPlayerById(bot.id)!;
      void botPlayer;
      const m = createMatch({ kind: "ranked", p0: player.id, p1: bot.id, p0Faction: myFaction, p1Faction: pick(factions) });
      db.prepare("DELETE FROM queue WHERE playerId=?").run(player.id);
      return NextResponse.json({ matchId: m.id });
    }
  }
  return NextResponse.json({ queued: true, waited });
}

export async function DELETE() {
  const player = await sessionPlayer();
  if (!player) return NextResponse.json({ error: "Login required" }, { status: 401 });
  db.prepare("DELETE FROM queue WHERE playerId=?").run(player.id);
  return NextResponse.json({ left: true });
}
