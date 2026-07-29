import { NextResponse } from "next/server";
import { sessionPlayer } from "@/lib/server/session";
import { activeMatchesFor } from "@/lib/server/match";
import { campaignProgressCol, playersCol } from "@/lib/server/db";
import { logTxn } from "@/lib/server/players";
import { CARD_POOL } from "@/lib/game/pool";

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
      lastFreeClaim: player.lastFreeClaim,
    },
    activeMatches: await activeMatchesFor(player.id),
    campaignCleared: clearedRows.map((r) => r.nodeId),
    flags: { demoGrants: process.env.DEMO_GRANTS === "1" },
  });
}

/** One-time import of the local (guest) profile after first login.
 *  Everything is clamped/validated server-side — the body is untrusted. */
export async function POST(req: Request) {
  const player = await sessionPlayer();
  if (!player) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  const body = await req.json();

  const byId = new Map(CARD_POOL.map((c) => [c.id, c]));
  const collection: Record<string, number> = {};
  const collectionEntries = Object.entries(
    (body.collection ?? {}) as Record<string, unknown>,
  ).slice(0, 500);
  for (const [id, copies] of collectionEntries) {
    const card = byId.get(id);
    const n = Math.floor(Number(copies));
    if (!card || !Number.isFinite(n) || n < 1) continue;
    collection[id] = Math.min(n, card.rarity === "legendary" ? 1 : 3);
  }
  const decks: Record<string, string[]> = {};
  const deckEntries = Object.entries((body.decks ?? {}) as Record<string, unknown>).slice(0, 20);
  for (const [name, list] of deckEntries) {
    if (
      Array.isArray(list) && list.length <= 60 &&
      list.every((id) => typeof id === "string" && byId.has(id))
    ) {
      decks[name] = list as string[];
    }
  }
  // A fresh device has nothing to import — don't burn the one-shot flag on it,
  // so the real guest profile can still be imported from another device later.
  if (Object.keys(collection).length === 0 && Object.keys(decks).length === 0) {
    return NextResponse.json({ imported: false });
  }
  const fields = {
    gold: Math.max(player.gold, Math.min(5000, Number(body.gold) || 0)),
    shards: Math.max(player.shards, Math.min(200, Number(body.shards) || 0)),
    xp: Math.min(50_000, Math.max(0, Number(body.xp) || 0)),
    level: Math.max(player.level, Math.min(20, Number(body.level) || 1)),
    collection, decks,
  };
  const res = await (await playersCol()).updateOne(
    { _id: player.id, imported: { $ne: true } },
    { $set: { ...fields, imported: true } },
  );
  if (res.matchedCount === 0) return NextResponse.json({ imported: false });
  await logTxn(player.id, {
    kind: "guest_import", currency: null, amount: 0,
    meta: {
      gold: fields.gold, shards: fields.shards, xp: fields.xp, level: fields.level,
      cards: Object.keys(collection).length, decks: Object.keys(decks),
    },
  });
  return NextResponse.json({ imported: true });
}
