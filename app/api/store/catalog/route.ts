import { NextResponse } from "next/server";
import { getEffectivePricing } from "@/lib/server/pricing";

export const dynamic = "force-dynamic";

/** Public store catalog — effective prices (defaults + admin overrides). */
export async function GET() {
  return NextResponse.json(await getEffectivePricing(), {
    headers: { "Cache-Control": "no-store" },
  });
}
