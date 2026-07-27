import { NextResponse } from "next/server";
import { sessionPlayer } from "@/lib/server/session";
import { applyPlayerAction, getMatch, playerIndexIn, resign, stateView } from "@/lib/server/match";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const player = await sessionPlayer();
  if (!player) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const { id } = await params;
  const m = getMatch(id);
  if (!m || playerIndexIn(m, player.id) === -1) return NextResponse.json({ error: "Match not found" }, { status: 404 });
  const body = await req.json();
  if (body.resign) {
    resign(m, player.id);
    return NextResponse.json(stateView(getMatch(id)!, player.id, Number(body.since ?? -1)));
  }
  const r = applyPlayerAction(m, player.id, body.action);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json(stateView(getMatch(id)!, player.id, Number(body.since ?? -1)));
}
