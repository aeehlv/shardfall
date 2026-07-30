import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/admin";
import { creditWallet } from "@/lib/server/players";

export const dynamic = "force-dynamic";

const clampAmount = (n: unknown) => Math.min(100_000, Math.max(0, Math.trunc(Number(n) || 0)));

export async function POST(req: Request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as {
    playerId?: number; gold?: number; shards?: number; label?: string;
  };
  const playerId = Number(body.playerId);
  if (!Number.isInteger(playerId) || playerId < 1) {
    return NextResponse.json({ error: "Unknown player" }, { status: 400 });
  }
  const gold = clampAmount(body.gold);
  const shards = clampAmount(body.shards);
  if (!gold && !shards) {
    return NextResponse.json({ error: "Nothing to grant" }, { status: 400 });
  }
  const label = typeof body.label === "string" ? body.label.trim().slice(0, 60) : "";

  try {
    const doc = await creditWallet(
      playerId,
      { gold: gold || undefined, shards: shards || undefined },
      { kind: "admin_grant", label: label || undefined, meta: { by: session.user.email } },
    );
    return NextResponse.json({ wallet: { gold: doc.gold, shards: doc.shards } });
  } catch {
    return NextResponse.json({ error: "Unknown player" }, { status: 400 });
  }
}
