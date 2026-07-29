import { headers } from "next/headers";
import { auth } from "@/lib/auth";

type SessionInfo = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;

/** Emails allowed into /admin — ADMIN_EMAILS is a comma-separated allowlist. */
function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** The better-auth session when the signed-in user is on the admin allowlist, else null.
 *  Goes through auth.api.getSession directly (sessionPlayer() drops the email). */
export async function requireAdmin(): Promise<SessionInfo | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email || !adminEmails().includes(email)) return null;
  return session;
}
