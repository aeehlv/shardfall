import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/admin";
import { playersCol } from "@/lib/server/db";
import { toPlayerRow } from "@/lib/server/players";
import { authUsersById } from "@/lib/server/users";

export const dynamic = "force-dynamic";

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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
  const users = await authUsersById(
    docs.map((d) => d.userId).filter((id): id is string => !!id),
  );

  const players = docs.map((doc) => {
    const row = toPlayerRow(doc);
    return {
      id: row.id,
      name: row.name,
      email: row.userId ? users.get(row.userId)?.email ?? null : null,
      verified: row.userId ? users.get(row.userId)?.verified ?? false : false,
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
