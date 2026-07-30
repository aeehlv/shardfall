import { NextResponse } from "next/server";
import { sessionPlayer } from "@/lib/server/session";
import { transactionsCol } from "@/lib/server/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const player = await sessionPlayer();
  if (!player) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const limit = Math.min(
    200, Math.max(1, Number(new URL(req.url).searchParams.get("limit")) || 50),
  );
  const docs = await (await transactionsCol())
    .find(
      { playerId: String(player.id) },
      {
        sort: { ts: -1 }, limit,
        // Whitelist: meta can hold internals (e.g. admin identity on grants).
        projection: {
          ts: 1, kind: 1, currency: 1, amount: 1, itemId: 1, balanceAfter: 1,
          label: 1, invoiceNo: 1,
        },
      },
    )
    .toArray();
  const transactions = docs.map(({ _id, ...rest }) => ({ id: String(_id), ...rest }));
  return NextResponse.json({ transactions });
}
