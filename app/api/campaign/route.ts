import { NextResponse } from "next/server";
import { sessionPlayer } from "@/lib/server/session";
import { isUnlocked, nodeById } from "@/lib/game/campaign";
import { abandonMatch, campaignOverview, campaignStars, createMatch } from "@/lib/server/match";
import { matchesCol } from "@/lib/server/db";
import type { FactionId } from "@/lib/game/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const player = await sessionPlayer();
  if (!player) return NextResponse.json({ error: "Login required" }, { status: 401 });
  return NextResponse.json(await campaignOverview(player.id));
}

export async function POST(req: Request) {
  const player = await sessionPlayer();
  if (!player) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const { nodeId, faction } = await req.json();
  const node = nodeById(nodeId);
  if (!node) return NextResponse.json({ error: "Unknown node" }, { status: 400 });
  const cleared = new Set(Object.keys(await campaignStars(player.id)));
  if (!isUnlocked(nodeId, cleared)) return NextResponse.json({ error: "Node locked" }, { status: 400 });
  const f: FactionId = ["pyre", "abyss", "verdant"].includes(faction) ? faction : "pyre";
  // One campaign run at a time: resume the same node, abandon any other node's run.
  const running = await (await matchesCol())
    .find({ p0: player.id, kind: "campaign", status: "active" }, { projection: { campaignNode: 1 } })
    .toArray();
  let resumeId: string | null = null;
  for (const doc of running) {
    if (doc.campaignNode === nodeId && !resumeId) resumeId = doc._id;
    else await abandonMatch(doc._id, player.id);
  }
  if (resumeId) return NextResponse.json({ matchId: resumeId });
  const m = await createMatch({ kind: "campaign", p0: player.id, p1: 1, p0Faction: f, p1Faction: node.enemyFaction, campaignNode: nodeId });
  // Concurrent POSTs can both pass the scan above and create two runs. Self-heal here:
  // every racer keeps the same (lowest) match id and abandons the rest.
  const dupes = await (await matchesCol())
    .find({ p0: player.id, kind: "campaign", status: "active" }, { projection: { _id: 1 } })
    .toArray();
  if (dupes.length > 1) {
    const ids = dupes.map((d) => d._id).sort();
    for (const dupId of ids.slice(1)) await abandonMatch(dupId, player.id);
    return NextResponse.json({ matchId: ids[0] });
  }
  return NextResponse.json({ matchId: m.id });
}
