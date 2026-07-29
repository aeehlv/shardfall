import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/admin";
import { matchesCol, playersCol, transactionsCol } from "@/lib/server/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const [players, matches, transactions] = await Promise.all([
    playersCol(), matchesCol(), transactionsCol(),
  ]);
  const [playerCount, active, finished, txns24h, topups24h] = await Promise.all([
    players.countDocuments({}),
    matches.countDocuments({ status: "active" }),
    matches.countDocuments({ status: "finished" }),
    transactions.countDocuments({ ts: { $gt: cutoff } }),
    transactions.countDocuments({ kind: "topup_demo", ts: { $gt: cutoff } }),
  ]);

  return NextResponse.json({
    players: playerCount,
    matches: { active, finished },
    txns24h,
    topups24h,
  });
}
