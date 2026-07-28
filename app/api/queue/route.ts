import { NextResponse } from "next/server";
import { sessionPlayer } from "@/lib/server/session";
import { playersCol, queueCol } from "@/lib/server/db";
import { createMatch } from "@/lib/server/match";
import type { FactionId } from "@/lib/game/types";

export const dynamic = "force-dynamic";
const BOT_FALLBACK_MS = 15_000;

const factions: FactionId[] = ["pyre", "abyss", "verdant"];
const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

export async function POST(req: Request) {
  const player = await sessionPlayer();
  if (!player) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const { faction } = await req.json();
  const queue = await queueCol();
  // queue + queue_meta merged into a single ticket document keyed by player id.
  await queue.replaceOne(
    { _id: player.id },
    {
      rating: player.rating,
      since: Date.now(),
      matchId: null,
      faction: factions.includes(faction) ? faction : "pyre",
    },
    { upsert: true },
  );
  return NextResponse.json({ queued: true });
}

export async function GET() {
  const player = await sessionPlayer();
  if (!player) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const queue = await queueCol();
  const row = await queue.findOne({ _id: player.id });
  if (!row) return NextResponse.json({ queued: false });
  if (row.matchId) {
    await queue.deleteOne({ _id: player.id });
    return NextResponse.json({ matchId: row.matchId });
  }
  const myFaction = (row.faction ?? "pyre") as FactionId;
  const waited = Date.now() - row.since;
  const window = 150 + Math.floor(waited / 5000) * 100;
  // try to pair with another queued human
  const other = await queue.findOne(
    {
      _id: { $ne: player.id },
      matchId: null,
      rating: { $gte: row.rating - window, $lte: row.rating + window },
    },
    { sort: { since: 1 } },
  );
  if (other) {
    const otherFaction = (other.faction ?? "pyre") as FactionId;
    const m = await createMatch({ kind: "ranked", p0: other._id, p1: player.id, p0Faction: otherFaction, p1Faction: myFaction });
    await queue.updateOne({ _id: other._id }, { $set: { matchId: m.id } });
    await queue.deleteOne({ _id: player.id });
    return NextResponse.json({ matchId: m.id });
  }
  // bot fallback after 15s: closest-rated bot
  if (waited >= BOT_FALLBACK_MS) {
    const players = await playersCol();
    // Two index-backed probes (the {isBot, rating} index) beat scanning for MIN(ABS(diff)).
    const [above, below] = await Promise.all([
      players.findOne(
        { isBot: 1, _id: { $ne: 1 }, rating: { $gte: row.rating } },
        { projection: { rating: 1 }, sort: { rating: 1 } },
      ),
      players.findOne(
        { isBot: 1, _id: { $ne: 1 }, rating: { $lt: row.rating } },
        { projection: { rating: 1 }, sort: { rating: -1 } },
      ),
    ]);
    const candidates = [above, below].filter((b) => b !== null);
    const bot = candidates.sort(
      (x, y) => Math.abs(x.rating - row.rating) - Math.abs(y.rating - row.rating),
    )[0];
    if (bot) {
      const m = await createMatch({ kind: "ranked", p0: player.id, p1: bot._id, p0Faction: myFaction, p1Faction: pick(factions) });
      await queue.deleteOne({ _id: player.id });
      return NextResponse.json({ matchId: m.id });
    }
  }
  return NextResponse.json({ queued: true, waited });
}

export async function DELETE() {
  const player = await sessionPlayer();
  if (!player) return NextResponse.json({ error: "Login required" }, { status: 401 });
  await (await queueCol()).deleteOne({ _id: player.id });
  return NextResponse.json({ left: true });
}
