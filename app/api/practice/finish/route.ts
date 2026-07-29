import { NextResponse } from "next/server";
import { sessionPlayer } from "@/lib/server/session";
import { addXpGold, claimDailyCounter, getPlayerById } from "@/lib/server/players";

/** Practice match rewards — same amounts as the local profile's
 *  applyMatchResult, capped per UTC day by an atomic counter on the player
 *  doc, claimed before any credit. */
export const dynamic = "force-dynamic";

const REWARDS_PER_DAY = 10;

export async function POST(req: Request) {
  const player = await sessionPlayer();
  if (!player) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const { won } = (await req.json().catch(() => ({}))) as { won?: boolean };
  const ok = await claimDailyCounter(player.id, "practiceDay", "practiceCount", REWARDS_PER_DAY);
  if (!ok) {
    return NextResponse.json(
      { error: "Daily practice reward limit reached", granted: { gold: 0, xp: 0, levelUps: 0 } },
      { status: 409 },
    );
  }
  const gold = won ? 40 : 15;
  const xp = won ? 60 : 25;
  const { levelUps } = await addXpGold(player.id, gold, xp, Boolean(won), "practice_reward");
  const fresh = (await getPlayerById(player.id))!;
  return NextResponse.json({
    wallet: { gold: fresh.gold, shards: fresh.shards },
    granted: { gold, xp, levelUps },
  });
}
