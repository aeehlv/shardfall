import { NextResponse } from "next/server";
import { sessionPlayer } from "@/lib/server/session";
import { logTxn } from "@/lib/server/players";
import { playersCol } from "@/lib/server/db";
import { rollPack } from "@/lib/game/packs";
import { CARD_POOL } from "@/lib/game/pool";

export const dynamic = "force-dynamic";
const SIZES: Record<string, number> = { small: 3, standard: 5, grand: 10 };

export async function POST(req: Request) {
  const player = await sessionPlayer();
  if (!player) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const { size } = await req.json();
  if (!SIZES[size]) return NextResponse.json({ error: "Unknown pack" }, { status: 400 });
  const col = await playersCol();
  const doc = await col.findOneAndUpdate(
    { _id: player.id, [`packs.${size}`]: { $gte: 1 } },
    { $inc: { [`packs.${size}`]: -1 } },
    { returnDocument: "after" },
  );
  if (!doc) return NextResponse.json({ error: "No packs of that size" }, { status: 409 });
  const cards = rollPack(CARD_POOL, SIZES[size]);
  const inc: Record<string, number> = {};
  for (const id of cards) inc[`collection.${id}`] = (inc[`collection.${id}`] ?? 0) + 1;
  await col.updateOne({ _id: player.id }, { $inc: inc });
  await logTxn(player.id, {
    kind: "pack_open", currency: null, amount: 0, itemId: size, meta: { cards },
  });
  return NextResponse.json({ cards, packs: doc.packs ?? {} });
}
