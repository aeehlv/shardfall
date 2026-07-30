import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/admin";
import { GAME_VERSION, RELEASES } from "@/lib/releases";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return NextResponse.json({ current: GAME_VERSION, releases: RELEASES });
}
