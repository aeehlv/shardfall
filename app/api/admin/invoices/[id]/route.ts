import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireAdmin } from "@/lib/server/admin";
import { getPlayerById } from "@/lib/server/players";
import { transactionsCol } from "@/lib/server/db";
import { authUsersById } from "@/lib/server/users";
import { invoiceFilename, renderInvoiceHtml } from "@/lib/server/invoices";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  if (!ObjectId.isValid(id)) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  const txn = await (await transactionsCol()).findOne({ _id: new ObjectId(id) });
  if (!txn) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  const player = await getPlayerById(Number(txn.playerId));
  const email = player?.userId
    ? (await authUsersById([player.userId])).get(player.userId)?.email ?? null
    : null;

  const html = renderInvoiceHtml(txn, { name: player?.name ?? `Player ${txn.playerId}`, email });
  const resHeaders: Record<string, string> = { "Content-Type": "text/html; charset=utf-8" };
  if (new URL(req.url).searchParams.get("download") === "1") {
    resHeaders["Content-Disposition"] = `attachment; filename="${invoiceFilename(txn)}"`;
  }
  return new NextResponse(html, { headers: resHeaders });
}
