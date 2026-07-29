import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireAdmin } from "@/lib/server/admin";
import { getDb, playersCol } from "@/lib/server/db";
import { toPlayerRow } from "@/lib/server/players";

export const dynamic = "force-dynamic";

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** userId → email from better-auth's `user` collection (mongodbAdapter, usePlural=false).
 *  Best-effort: any lookup failure just leaves emails null. */
async function emailsByUserId(userIds: string[]): Promise<Map<string, string>> {
  const emails = new Map<string, string>();
  const ids = userIds.filter((id) => ObjectId.isValid(id));
  if (!ids.length) return emails;
  try {
    const users = await (await getDb())
      .collection("user")
      .find({ _id: { $in: ids.map((id) => new ObjectId(id)) } }, { projection: { email: 1 } })
      .toArray();
    for (const u of users) {
      const email = (u as { email?: unknown }).email;
      if (typeof email === "string") emails.set(String(u._id), email);
    }
  } catch {
    // fall through — the panel shows email as null
  }
  return emails;
}

export async function GET(req: Request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const params = new URL(req.url).searchParams;
  const q = (params.get("q") ?? "").trim();
  const limit = Math.min(200, Math.max(1, Number(params.get("limit")) || 50));
  const filter = q ? { name: { $regex: escapeRegex(q), $options: "i" } } : {};

  const docs = await (await playersCol())
    .find(filter, { sort: { createdAt: -1, _id: -1 }, limit })
    .toArray();
  const emails = await emailsByUserId(
    docs.map((d) => d.userId).filter((id): id is string => !!id),
  );

  const players = docs.map((doc) => {
    const row = toPlayerRow(doc);
    return {
      id: row.id,
      name: row.name,
      email: row.userId ? emails.get(row.userId) ?? null : null,
      level: row.level,
      league: row.league,
      rating: row.rating,
      gold: row.gold,
      shards: row.shards,
      wins: row.wins,
      losses: row.losses,
      createdAt: row.createdAt,
    };
  });
  return NextResponse.json({ players });
}
