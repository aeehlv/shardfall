import { NextResponse } from "next/server";
import { sessionPlayer } from "@/lib/server/session";
import { activeMatchesFor } from "@/lib/server/match";
import { campaignProgressCol } from "@/lib/server/db";
import { updatePlayer } from "@/lib/server/players";

export const dynamic = "force-dynamic";

export async function GET() {
  const player = await sessionPlayer();
  if (!player) return NextResponse.json({ player: null });
  const clearedRows = await (await campaignProgressCol())
    .find({ playerId: player.id }, { projection: { nodeId: 1 } })
    .toArray();
  return NextResponse.json({
    player: {
      id: player.id, name: player.name, rating: player.rating, league: player.league,
      gold: player.gold, shards: player.shards, xp: player.xp, level: player.level,
      wins: player.wins, losses: player.losses,
      packs: player.packs ?? {},
      collection: player.collection ?? {},
      decks: player.decks ?? {},
    },
    activeMatches: await activeMatchesFor(player.id),
    campaignCleared: clearedRows.map((r) => r.nodeId),
  });
}

/** One-time import of the local (guest) profile after first login. */
export async function POST(req: Request) {
  const player = await sessionPlayer();
  if (!player) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  if (Object.keys(player.collection ?? {}).length > 0) return NextResponse.json({ imported: false });
  const body = await req.json();
  await updatePlayer(player.id, {
    gold: Math.max(player.gold, Number(body.gold) || 0),
    shards: Math.max(player.shards, Number(body.shards) || 0),
    xp: Number(body.xp) || 0,
    level: Math.max(player.level, Number(body.level) || 1),
    collection: (body.collection ?? {}) as Record<string, number>,
    decks: (body.decks ?? {}) as Record<string, string[]>,
  });
  return NextResponse.json({ imported: true });
}
