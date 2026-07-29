import { NextResponse } from "next/server";
import { sessionPlayer } from "@/lib/server/session";
import { claimDailyCounter, creditWallet } from "@/lib/server/players";

/** Demo top-up used by the menu's dev buttons. Server-side so it works on the
 *  hosted build, where the wallet lives in MongoDB rather than localStorage.
 *  Only exists when DEMO_GRANTS=1, and each kind is capped per UTC day by an
 *  atomic counter on the player doc, claimed before any credit. */
export const dynamic = "force-dynamic";

const GRANTS_PER_DAY = 5;

export async function POST(req: Request) {
  if (process.env.DEMO_GRANTS !== "1") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const player = await sessionPlayer();
  if (!player) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const { kind } = (await req.json()) as { kind?: string };
  if (kind !== "gold" && kind !== "shards") {
    return NextResponse.json({ error: "Unknown grant" }, { status: 400 });
  }
  // Both kinds share grantDay, so a new day must reset the other kind's counter too.
  const ok = kind === "gold"
    ? await claimDailyCounter(player.id, "grantDay", "grantGoldCount", GRANTS_PER_DAY, ["grantShardCount"])
    : await claimDailyCounter(player.id, "grantDay", "grantShardCount", GRANTS_PER_DAY, ["grantGoldCount"]);
  if (!ok) {
    return NextResponse.json({ error: "Daily grant limit reached" }, { status: 409 });
  }
  const doc = await creditWallet(
    player.id,
    kind === "gold" ? { gold: 500 } : { shards: 50 },
    { kind: "demo_grant", itemId: kind },
  );
  return NextResponse.json({ gold: doc.gold, shards: doc.shards });
}
