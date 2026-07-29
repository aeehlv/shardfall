import { NextResponse } from "next/server";
import { sessionPlayer } from "@/lib/server/session";
import { StoreError, topUpDemo } from "@/lib/server/store";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const player = await sessionPlayer();
  if (!player) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { id?: string };
  try {
    return NextResponse.json(await topUpDemo(player.id, String(body.id ?? "")));
  } catch (err) {
    if (err instanceof StoreError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
