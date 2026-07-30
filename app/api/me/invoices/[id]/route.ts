import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { ObjectId } from "mongodb";
import { auth } from "@/lib/auth";
import { getPlayerByUserId } from "@/lib/server/players";
import { transactionsCol } from "@/lib/server/db";
import { invoiceFilename, renderInvoiceHtml } from "@/lib/server/invoices";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const player = await getPlayerByUserId(session.user.id);
  if (!player) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  const { id } = await params;
  if (!ObjectId.isValid(id)) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  const txn = await (await transactionsCol()).findOne({
    _id: new ObjectId(id), playerId: String(player.id),
  });
  if (!txn) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  const html = renderInvoiceHtml(txn, { name: player.name, email: session.user.email });
  const resHeaders: Record<string, string> = { "Content-Type": "text/html; charset=utf-8" };
  if (new URL(req.url).searchParams.get("download") === "1") {
    resHeaders["Content-Disposition"] = `attachment; filename="${invoiceFilename(txn)}"`;
  }
  return new NextResponse(html, { headers: resHeaders });
}
