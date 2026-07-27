import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { sessionPlayer } from "@/lib/server/session";

/** Shardfall LEADERBOARD — the public ranked ladder.
 *
 *  Rank is always computed over EVERY player (RANK() OVER (ORDER BY rating DESC, id ASC)),
 *  so a league-filtered or name-searched view still reports true global ladder positions.
 *  The logged-in player's own row is returned as `me` even when it falls outside the page. */

export const dynamic = "force-dynamic";

const LEAGUES = new Set(["Bronze", "Silver", "Gold", "Diamond", "Legend"]);
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

interface LadderRow {
  rank: number;
  id: number;
  name: string;
  rating: number;
  league: string;
  wins: number;
  losses: number;
  isBot: number;
}

const RANKED = `
WITH ranked AS (
  SELECT id, name, rating, league, wins, losses, isBot,
         RANK() OVER (ORDER BY rating DESC, id ASC) AS "rank"
  FROM players
)`;
const COLS = `"rank", id, name, rating, league, wins, losses, isBot`;
const FILTER = `
WHERE (@league IS NULL OR league = @league)
  AND (@like IS NULL OR name LIKE @like ESCAPE '\\')`;

const listStmt = db.prepare(
  `${RANKED} SELECT ${COLS} FROM ranked ${FILTER} ORDER BY "rank" LIMIT @limit OFFSET @offset`,
);
const countStmt = db.prepare(`${RANKED} SELECT COUNT(*) AS n FROM ranked ${FILTER}`);
const meStmt = db.prepare(`${RANKED} SELECT ${COLS} FROM ranked WHERE id = @id`);

function intParam(raw: string | null, fallback: number): number {
  if (raw === null || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

/** "Bronze" / "bronze" / "BRONZE" all resolve; anything else (incl. "All") means no filter. */
function normalizeLeague(raw: string): string | null {
  if (!raw) return null;
  const name = raw[0].toUpperCase() + raw.slice(1).toLowerCase();
  return LEAGUES.has(name) ? name : null;
}

/** Escape LIKE wildcards so a literal "%" or "_" in a search stays literal. */
function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;

  const league = normalizeLeague((params.get("league") ?? "").trim());
  const q = (params.get("q") ?? "").trim().slice(0, 48);
  const like = q ? likePattern(q) : null;
  const page = Math.max(0, intParam(params.get("page"), 0));
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, intParam(params.get("pageSize"), DEFAULT_PAGE_SIZE)),
  );

  const filter = { league, like };
  const rows = listStmt.all({ ...filter, limit: pageSize, offset: page * pageSize }) as LadderRow[];
  const total = (countStmt.get(filter) as { n: number }).n;

  const player = await sessionPlayer();
  const me = player ? ((meStmt.get({ id: player.id }) as LadderRow | undefined) ?? null) : null;

  return NextResponse.json({ rows, total, page, pageSize, me });
}
