import { NextResponse } from "next/server";
import { sessionPlayer } from "@/lib/server/session";
import { db } from "@/lib/server/db";
import { createMatch } from "@/lib/server/match";
import { getPlayerById } from "@/lib/server/players";
import type { FactionId } from "@/lib/game/types";

export const dynamic = "force-dynamic";
const F = (x: unknown): FactionId => (["pyre", "abyss", "verdant"].includes(String(x)) ? (x as FactionId) : "pyre");

export async function POST(req: Request) {
  const player = await sessionPlayer();
  if (!player) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const { toId, faction } = await req.json();
  try { db.prepare("ALTER TABLE battle_invites ADD COLUMN faction TEXT").run(); } catch { /* exists */ }
  const target = getPlayerById(Number(toId));
  if (!target) return NextResponse.json({ error: "Unknown player" }, { status: 404 });
  // bots accept instantly → match right away (testable offline)
  if (target.isBot) {
    const m = createMatch({ kind: "friendly", p0: player.id, p1: target.id, p0Faction: F(faction), p1Faction: "abyss" });
    return NextResponse.json({ matchId: m.id });
  }
  db.prepare("INSERT INTO battle_invites (fromId, toId, faction) VALUES (?, ?, ?)").run(player.id, toId, F(faction));
  return NextResponse.json({ invited: true });
}

export async function PATCH(req: Request) {
  const player = await sessionPlayer();
  if (!player) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const { id, accept, faction } = await req.json();
  const invite = db.prepare("SELECT * FROM battle_invites WHERE id=? AND toId=?").get(id, player.id) as
    { id: number; fromId: number; faction?: string } | undefined;
  if (!invite) return NextResponse.json({ error: "No such invite" }, { status: 404 });
  if (!accept) {
    db.prepare("UPDATE battle_invites SET status='declined' WHERE id=?").run(id);
    return NextResponse.json({ declined: true });
  }
  const m = createMatch({
    kind: "friendly", p0: invite.fromId, p1: player.id,
    p0Faction: F(invite.faction), p1Faction: F(faction),
  });
  db.prepare("UPDATE battle_invites SET status='accepted', matchId=? WHERE id=?").run(m.id, id);
  return NextResponse.json({ matchId: m.id });
}
