import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/admin";
import { auth } from "@/lib/auth";
import { ensurePlayerForUser } from "@/lib/server/players";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Manually create a passwordless account (the user signs in later via magic link).
 *  Uses better-auth's internal adapter — the same call its magic-link sign-up makes. */
export async function POST(req: Request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as {
    email?: string; name?: string; verified?: boolean;
  };
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }
  const name = String(body.name ?? "").trim().slice(0, 24) || email.split("@")[0];
  const verified = body.verified !== false;

  const ctx = await auth.$context;
  const existing = await ctx.internalAdapter.findUserByEmail(email);
  if (existing) {
    return NextResponse.json({ error: "Email already registered" }, { status: 409 });
  }
  const user = await ctx.internalAdapter.createUser({ email, name, emailVerified: verified });
  const player = await ensurePlayerForUser(user.id, name);
  return NextResponse.json({ playerId: player.id, email: user.email, verified });
}
