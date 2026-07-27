import { NextResponse } from "next/server";
import { sessionPlayer } from "@/lib/server/session";
import { activeMatchesFor } from "@/lib/server/match";
import { db } from "@/lib/server/db";
import { updatePlayer } from "@/lib/server/players";

export const dynamic = "force-dynamic";

export async function GET() {
  const player = await sessionPlayer();
  if (!player) return NextResponse.json({ player: null });
  const cleared = (db.prepare("SELECT nodeId FROM campaign_progress WHERE playerId=?").all(player.id) as { nodeId: string }[]).map(r => r.nodeId);
  return NextResponse.json({
    player: {
      id: player.id, name: player.name, rating: player.rating, league: player.league,
      gold: player.gold, shards: player.shards, xp: player.xp, level: player.level,
      wins: player.wins, losses: player.losses,
      packs: JSON.parse(player.packs || "{}"),
      collection: JSON.parse(player.collection || "{}"),
      decks: JSON.parse(player.decks || "{}"),
    },
    activeMatches: activeMatchesFor(player.id),
    campaignCleared: cleared,
  });
}

/** One-time import of the local (guest) profile after first login. */
export async function POST(req: Request) {
  const player = await sessionPlayer();
  if (!player) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  if (player.collection && player.collection !== "{}") return NextResponse.json({ imported: false });
  const body = await req.json();
  updatePlayer(player.id, {
    gold: Math.max(player.gold, Number(body.gold) || 0),
    shards: Math.max(player.shards, Number(body.shards) || 0),
    xp: Number(body.xp) || 0,
    level: Math.max(player.level, Number(body.level) || 1),
    collection: JSON.stringify(body.collection ?? {}),
    decks: JSON.stringify(body.decks ?? {}),
  });
  return NextResponse.json({ imported: true });
}
