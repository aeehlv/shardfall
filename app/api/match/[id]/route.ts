import { NextResponse } from "next/server";
import { sessionPlayer } from "@/lib/server/session";
import { getMatch, playerIndexIn, stateView } from "@/lib/server/match";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const player = await sessionPlayer();
  if (!player) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const { id } = await params;
  const m = getMatch(id);
  if (!m || playerIndexIn(m, player.id) === -1) return NextResponse.json({ error: "Match not found" }, { status: 404 });
  const since = Number(new URL(req.url).searchParams.get("since") ?? -1);
  return NextResponse.json(stateView(m, player.id, since));
}
