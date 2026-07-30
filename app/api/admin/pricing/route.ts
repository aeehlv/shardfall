import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/admin";
import {
  PricingError, getEffectivePricing, getPricingOverrides, setPricingOverrides,
  type PricingPatch,
} from "@/lib/server/pricing";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({
    effective: await getEffectivePricing(),
    overrides: await getPricingOverrides(),
  });
}

/** Partial override patch: { packs?, singles?, topups? } — omitted sections stay
 *  untouched; null on a key (or a whole section) removes that override. */
export async function POST(req: Request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as PricingPatch | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  try {
    return NextResponse.json(await setPricingOverrides(body));
  } catch (err) {
    if (err instanceof PricingError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
