import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { ensurePlayerForUser, type PlayerRow } from "./players";

/** Resolve the logged-in user's player row, or null. */
export async function sessionPlayer(): Promise<PlayerRow | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;
  return ensurePlayerForUser(session.user.id, session.user.name || session.user.email.split("@")[0]);
}
