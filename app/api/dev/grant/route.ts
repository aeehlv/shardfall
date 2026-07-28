import { NextResponse } from "next/server";
import { sessionPlayer } from "@/lib/server/session";
import { getPlayerById, updatePlayer } from "@/lib/server/players";

/** Demo top-up used by the menu's dev buttons. Server-side so it works on the
 *  hosted build, where the wallet lives in MongoDB rather than localStorage. */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const player = await sessionPlayer();
  if (!player) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const { kind } = (await req.json()) as { kind?: string };
  const fresh = await getPlayerById(player.id);
  if (!fresh) return NextResponse.json({ error: "No player" }, { status: 404 });
  if (kind === "gold") await updatePlayer(player.id, { gold: fresh.gold + 500 });
  else if (kind === "shards") await updatePlayer(player.id, { shards: fresh.shards + 50 });
  else return NextResponse.json({ error: "Unknown grant" }, { status: 400 });
  const after = await getPlayerById(player.id);
  return NextResponse.json({ gold: after?.gold, shards: after?.shards });
}
