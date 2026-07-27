import { NextResponse } from "next/server";
import { sessionPlayer } from "@/lib/server/session";
import { updatePlayer, getPlayerById } from "@/lib/server/players";
import { rollPack } from "@/lib/game/packs";
import { CARD_POOL } from "@/lib/game/pool";

export const dynamic = "force-dynamic";
const SIZES: Record<string, number> = { small: 3, standard: 5, grand: 10 };

export async function POST(req: Request) {
  const player = await sessionPlayer();
  if (!player) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const { size } = await req.json();
  if (!SIZES[size]) return NextResponse.json({ error: "Unknown pack" }, { status: 400 });
  const fresh = getPlayerById(player.id)!;
  const packs = JSON.parse(fresh.packs || "{}");
  if (!packs[size] || packs[size] < 1) return NextResponse.json({ error: "No packs of that size" }, { status: 400 });
  packs[size] -= 1;
  const cards = rollPack(CARD_POOL, SIZES[size]);
  const collection = JSON.parse(fresh.collection || "{}");
  for (const id of cards) collection[id] = (collection[id] ?? 0) + 1;
  updatePlayer(player.id, { packs: JSON.stringify(packs), collection: JSON.stringify(collection) });
  return NextResponse.json({ cards, packs });
}
