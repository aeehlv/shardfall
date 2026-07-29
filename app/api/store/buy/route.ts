import { NextResponse } from "next/server";
import { sessionPlayer } from "@/lib/server/session";
import {
  StoreError, buyHotDeal, buyPack, buyRotation, buySingle, claimDailyFree,
} from "@/lib/server/store";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const player = await sessionPlayer();
  if (!player) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as {
    kind?: string; id?: string; size?: string;
  };
  try {
    switch (body.kind) {
      case "pack":
        return NextResponse.json(await buyPack(player.id, String(body.size ?? body.id ?? "")));
      case "single":
        return NextResponse.json(await buySingle(player.id, String(body.id ?? "")));
      case "rotation":
        return NextResponse.json(await buyRotation(player.id, String(body.id ?? "")));
      case "daily-free":
        return NextResponse.json(await claimDailyFree(player.id));
      case "hot-deal":
        return NextResponse.json(await buyHotDeal(player.id, String(body.id ?? "")));
      default:
        return NextResponse.json({ error: "Unknown purchase kind" }, { status: 400 });
    }
  } catch (err) {
    if (err instanceof StoreError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
