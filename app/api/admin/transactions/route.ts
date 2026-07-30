import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/admin";
import { transactionsCol } from "@/lib/server/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const params = new URL(req.url).searchParams;
  const playerId = (params.get("playerId") ?? "").trim();
  const limit = Math.min(200, Math.max(1, Number(params.get("limit")) || 50));

  const docs = await (await transactionsCol())
    .find(playerId ? { playerId } : {}, { sort: { ts: -1 }, limit })
    .toArray();
  const transactions = docs.map(({ _id, ...rest }) => ({ id: String(_id), ...rest }));
  return NextResponse.json({ transactions });
}
