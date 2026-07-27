import { NextResponse } from "next/server";
import { sessionPlayer } from "@/lib/server/session";
import { db } from "@/lib/server/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const player = await sessionPlayer();
  if (!player) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const friends = db.prepare(
    `SELECT p.id, p.name, p.rating, p.league, p.isBot FROM friends f JOIN players p ON p.id = f.b WHERE f.a = ?`,
  ).all(player.id);
  const requests = db.prepare(
    `SELECT r.fromId, p.name, p.rating, p.league FROM friend_requests r JOIN players p ON p.id = r.fromId WHERE r.toId = ?`,
  ).all(player.id);
  const invites = db.prepare(
    `SELECT i.id, i.fromId, i.matchId, i.status, p.name FROM battle_invites i JOIN players p ON p.id = i.fromId WHERE i.toId = ? AND i.status = 'pending'`,
  ).all(player.id);
  const outgoing = db.prepare(
    `SELECT i.id, i.toId, i.matchId, i.status, p.name FROM battle_invites i JOIN players p ON p.id = i.toId WHERE i.fromId = ? AND i.createdAt > ? ORDER BY i.createdAt DESC LIMIT 5`,
  ).all(player.id, Date.now() - 3600_000);
  return NextResponse.json({ friends, requests, invites, outgoing });
}

export async function POST(req: Request) {
  const player = await sessionPlayer();
  if (!player) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const { name } = await req.json();
  const target = db.prepare("SELECT id, isBot FROM players WHERE name = ? COLLATE NOCASE").get(String(name)) as { id: number; isBot: number } | undefined;
  if (!target) return NextResponse.json({ error: "No player with that name" }, { status: 404 });
  if (target.id === player.id) return NextResponse.json({ error: "That's you" }, { status: 400 });
  db.prepare("INSERT OR IGNORE INTO friend_requests (fromId, toId) VALUES (?, ?)").run(player.id, target.id);
  // bots auto-accept so the feature is testable locally
  if (target.isBot) {
    db.prepare("DELETE FROM friend_requests WHERE fromId=? AND toId=?").run(player.id, target.id);
    db.prepare("INSERT OR IGNORE INTO friends (a, b) VALUES (?, ?)").run(player.id, target.id);
    db.prepare("INSERT OR IGNORE INTO friends (a, b) VALUES (?, ?)").run(target.id, player.id);
    return NextResponse.json({ accepted: true });
  }
  return NextResponse.json({ requested: true });
}

export async function PATCH(req: Request) {
  const player = await sessionPlayer();
  if (!player) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const { fromId, accept } = await req.json();
  db.prepare("DELETE FROM friend_requests WHERE fromId=? AND toId=?").run(fromId, player.id);
  if (accept) {
    db.prepare("INSERT OR IGNORE INTO friends (a, b) VALUES (?, ?)").run(player.id, fromId);
    db.prepare("INSERT OR IGNORE INTO friends (a, b) VALUES (?, ?)").run(fromId, player.id);
  }
  return NextResponse.json({ ok: true });
}
