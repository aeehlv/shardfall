import { NextResponse } from "next/server";
import type { Document, Filter } from "mongodb";
import { playersCol, type PlayerDoc } from "@/lib/server/db";
import { sessionPlayer } from "@/lib/server/session";

/** Shardfall LEADERBOARD — the public ranked ladder.
 *
 *  Rank is always computed over EVERY player ($setWindowFields + $rank over
 *  rating DESC, id ASC — the aggregation equivalent of the old SQL window
 *  function), and the league / name filters are applied AFTER ranking, so a
 *  filtered view still reports true global ladder positions.
 *  The logged-in player's own row is returned as `me` even when it falls
 *  outside the page. */

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
}

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

/** Escape regex metacharacters so a literal "." or "*" in a search stays literal.
 *  (SQLite LIKE was case-insensitive for ASCII — hence the "i" option below.) */
function escapeRegex(q: string): string {
  return q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Shape a ranked document into the row the client expects (_id → id). */
const PROJECT_ROW: Document = {
  _id: 0,
  rank: 1,
  id: "$_id",
  name: 1,
  rating: 1,
  league: 1,
  wins: 1,
  losses: 1,
};

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;

  const league = normalizeLeague((params.get("league") ?? "").trim());
  const q = (params.get("q") ?? "").trim().slice(0, 48);
  const page = Math.max(0, intParam(params.get("page"), 0));
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, intParam(params.get("pageSize"), DEFAULT_PAGE_SIZE)),
  );

  const filter: Filter<PlayerDoc> = {};
  if (league) filter.league = league;
  if (q) filter.name = { $regex: escapeRegex(q), $options: "i" };
  const postRank: Document[] = Object.keys(filter).length > 0 ? [{ $match: filter }] : [];

  const player = await sessionPlayer();
  const players = await playersCol();

  const facet: Document = {
    // Filters run AFTER ranking, so the ranks stay global.
    rows: [
      ...postRank,
      { $sort: { rank: 1 } },
      { $skip: page * pageSize },
      { $limit: pageSize },
      { $project: PROJECT_ROW },
    ],
    total: [...postRank, { $count: "n" }],
  };
  if (player) {
    // Deliberately unfiltered: "me" must report the GLOBAL rank even when off-page.
    facet.me = [{ $match: { _id: player.id } }, { $project: PROJECT_ROW }];
  }

  const [result] = await players
    .aggregate<{ rows: LadderRow[]; total: { n: number }[]; me?: LadderRow[] }>([
      // Trim the documents before the window stage so ranking stays cheap, and fold
      // the two-key ladder order (rating DESC, id ASC) into ONE descending key —
      // $rank only accepts a single-element sortBy. Ids stay far below the 1e9
      // multiplier, so the key can never bleed across rating bands.
      {
        $project: {
          name: 1, rating: 1, league: 1, wins: 1, losses: 1,
          _rankKey: {
            $subtract: [{ $multiply: [{ $ifNull: ["$rating", 0] }, 1_000_000_000] }, "$_id"],
          },
        },
      },
      { $setWindowFields: { sortBy: { _rankKey: -1 }, output: { rank: { $rank: {} } } } },
      { $facet: facet },
    ])
    .toArray();

  const rows = result?.rows ?? [];
  const total = result?.total?.[0]?.n ?? 0;
  const me = result?.me?.[0] ?? null;

  return NextResponse.json({ rows, total, page, pageSize, me });
}
