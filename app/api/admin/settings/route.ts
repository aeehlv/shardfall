import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/admin";
import { getBotWaitMs, setBotWaitMs } from "@/lib/server/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ settings: { botWaitMs: await getBotWaitMs() } });
}

export async function POST(req: Request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { botWaitMs?: number };
  const ms = Number(body.botWaitMs);
  if (!Number.isFinite(ms)) {
    return NextResponse.json({ error: "Invalid wait" }, { status: 400 });
  }
  const botWaitMs = await setBotWaitMs(ms);
  return NextResponse.json({ settings: { botWaitMs } });
}
