import { NextResponse } from "next/server";
import { sessionPlayer } from "@/lib/server/session";
import { db } from "@/lib/server/db";
import { CAMPAIGN, isUnlocked, nodeById } from "@/lib/game/campaign";
import { createMatch } from "@/lib/server/match";
import type { FactionId } from "@/lib/game/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const player = await sessionPlayer();
  if (!player) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const cleared = new Set(
    (db.prepare("SELECT nodeId FROM campaign_progress WHERE playerId=?").all(player.id) as { nodeId: string }[]).map(r => r.nodeId),
  );
  return NextResponse.json({
    nodes: CAMPAIGN.map(n => ({ ...n, cleared: cleared.has(n.id), unlocked: isUnlocked(n.id, cleared) })),
  });
}

export async function POST(req: Request) {
  const player = await sessionPlayer();
  if (!player) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const { nodeId, faction } = await req.json();
  const node = nodeById(nodeId);
  if (!node) return NextResponse.json({ error: "Unknown node" }, { status: 400 });
  const cleared = new Set(
    (db.prepare("SELECT nodeId FROM campaign_progress WHERE playerId=?").all(player.id) as { nodeId: string }[]).map(r => r.nodeId),
  );
  if (!isUnlocked(nodeId, cleared)) return NextResponse.json({ error: "Node locked" }, { status: 400 });
  const f: FactionId = ["pyre", "abyss", "verdant"].includes(faction) ? faction : "pyre";
  const m = createMatch({ kind: "campaign", p0: player.id, p1: 1, p0Faction: f, p1Faction: node.enemyFaction, campaignNode: nodeId });
  return NextResponse.json({ matchId: m.id });
}
