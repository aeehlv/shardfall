import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { sessionPlayer } from "@/lib/server/session";
import { battleInvitesCol } from "@/lib/server/db";
import { createMatch } from "@/lib/server/match";
import { getPlayerById } from "@/lib/server/players";
import type { FactionId } from "@/lib/game/types";

export const dynamic = "force-dynamic";
const F = (x: unknown): FactionId => (["pyre", "abyss", "verdant"].includes(String(x)) ? (x as FactionId) : "pyre");

/** Invite ids travel to the client as ObjectId hex strings. */
function toObjectId(raw: unknown): ObjectId | null {
  const s = String(raw ?? "");
  return ObjectId.isValid(s) ? new ObjectId(s) : null;
}

export async function POST(req: Request) {
  const player = await sessionPlayer();
  if (!player) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const { toId, faction } = await req.json();
  const target = await getPlayerById(Number(toId));
  if (!target) return NextResponse.json({ error: "Unknown player" }, { status: 404 });
  // bots accept instantly → match right away (testable offline)
  if (target.isBot) {
    const m = await createMatch({ kind: "friendly", p0: player.id, p1: target.id, p0Faction: F(faction), p1Faction: "abyss" });
    return NextResponse.json({ matchId: m.id });
  }
  await (await battleInvitesCol()).insertOne({
    fromId: player.id,
    toId: Number(toId),
    matchId: null,
    status: "pending",
    faction: F(faction),
    createdAt: Date.now(),
  });
  return NextResponse.json({ invited: true });
}

export async function PATCH(req: Request) {
  const player = await sessionPlayer();
  if (!player) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const { id, accept, faction } = await req.json();
  const oid = toObjectId(id);
  if (!oid) return NextResponse.json({ error: "No such invite" }, { status: 404 });
  const invites = await battleInvitesCol();
  const invite = await invites.findOne({ _id: oid, toId: player.id });
  if (!invite) return NextResponse.json({ error: "No such invite" }, { status: 404 });
  if (!accept) {
    await invites.updateOne({ _id: oid }, { $set: { status: "declined" } });
    return NextResponse.json({ declined: true });
  }
  const m = await createMatch({
    kind: "friendly", p0: invite.fromId, p1: player.id,
    p0Faction: F(invite.faction), p1Faction: F(faction),
  });
  await invites.updateOne({ _id: oid }, { $set: { status: "accepted", matchId: m.id } });
  return NextResponse.json({ matchId: m.id });
}
