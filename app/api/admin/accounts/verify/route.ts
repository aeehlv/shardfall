import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/admin";
import { auth } from "@/lib/auth";
import { getPlayerById } from "@/lib/server/players";

export const dynamic = "force-dynamic";

/** Mark the better-auth user linked to a player as email-verified. */
export async function POST(req: Request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { playerId?: number };
  const playerId = Number(body.playerId);
  if (!Number.isInteger(playerId) || playerId < 1) {
    return NextResponse.json({ error: "Unknown player" }, { status: 400 });
  }

  const player = await getPlayerById(playerId);
  if (!player?.userId) {
    return NextResponse.json({ error: "Player has no linked user" }, { status: 404 });
  }
  const ctx = await auth.$context;
  const user = await ctx.internalAdapter.findUserById(player.userId);
  if (!user) {
    return NextResponse.json({ error: "Player has no linked user" }, { status: 404 });
  }
  await ctx.internalAdapter.updateUser(player.userId, { emailVerified: true });
  return NextResponse.json({ playerId, verified: true });
}
