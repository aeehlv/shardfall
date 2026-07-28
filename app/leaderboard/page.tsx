"use client";

/** Shardfall LEADERBOARD — the public ranked ladder of Kelvarrow.
 *  League tabs + debounced name search + paged table; the signed-in duelist's own
 *  standing is pinned to a sticky bar whenever it isn't on the page being viewed. */

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import "@/app/menu.css";
import "./leaderboard.css";

type Row = {
  rank: number; id: number; name: string; rating: number;
  league: string; wins: number; losses: number;
};
type Payload = { rows: Row[]; total: number; page: number; pageSize: number; me: Row | null };

const ALL = "All";
const LEAGUES = ["Bronze", "Silver", "Gold", "Diamond", "Legend"] as const;
const LEAGUE_COLORS: Record<string, string> = {
  Bronze: "#a97142", Silver: "#9c93a8", Gold: "#e3a44a", Diamond: "#4e8ee9", Legend: "#ff5c8a",
};
const PAGE_SIZE = 50;
const MEDALS = ["", "m1", "m2", "m3"];

const leagueColor = (league: string) => LEAGUE_COLORS[league] ?? "#9c93a8";
const fmt = (n: number) => n.toLocaleString("en-US");
const winRate = (w: number, l: number) => (w + l === 0 ? null : (w / (w + l)) * 100);

function LeagueBadge({ league }: { league: string }) {
  return (
    <span className="lbBadge" style={{ "--lg": leagueColor(league) } as CSSProperties}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="lbCrest" src={`/ui/leagues/${league.toLowerCase()}.png`} alt="" />
      {league}
    </span>
  );
}

function WinRate({ wins, losses }: { wins: number; losses: number }) {
  const wr = winRate(wins, losses);
  if (wr === null) return <span className="wrNone">—</span>;
  return (
    <span className="wr">
      <b className="wrNum">{Math.round(wr)}%</b>
      <span className="wrTrack"><span className="wrFill" style={{ width: `${wr}%` }} /></span>
    </span>
  );
}

/** One ladder line — bots are deliberately indistinguishable from humans. */
function LadderRow({ row, isMe }: { row: Row; isMe: boolean }) {
  const medal = row.rank <= 3 ? MEDALS[row.rank] : "";
  return (
    <tr className={isMe ? "lbRow me" : "lbRow"} data-testid={`lb-row-${row.id}`}>
      <td className="cRank">
        {medal
          ? <span className={`medal ${medal}`}>{row.rank}</span>
          : <span className="rankNum">{fmt(row.rank)}</span>}
      </td>
      <td className="cName">
        <span className="lbName">{row.name}</span>
        {isMe && <span className="youTag" data-testid="lb-you">YOU</span>}
      </td>
      <td className="cLeague"><LeagueBadge league={row.league} /></td>
      <td className="cRating"><b>{fmt(row.rating)}</b></td>
      <td className="cRecord">
        <span className="wl"><i className="w">{row.wins}</i> / <i className="l">{row.losses}</i></span>
      </td>
      <td className="cWin"><WinRate wins={row.wins} losses={row.losses} /></td>
    </tr>
  );
}

export default function LeaderboardPage() {
  const [league, setLeague] = useState<string>(ALL);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  // the payload is tagged with the filter key it answered, so "loading" is derived
  // (no cascading setState) and a stale page stays on screen, dimmed, until it lands
  const [result, setResult] = useState<{ key: string; data: Payload | null } | null>(null);
  const qRef = useRef("");
  const key = JSON.stringify([league, q, page]);

  // debounce the search box (~300ms); a new search always returns to page 1
  useEffect(() => {
    const t = setTimeout(() => {
      const next = search.trim();
      if (next === qRef.current) return;
      qRef.current = next;
      setQ(next);
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const ctrl = new AbortController();
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (league !== ALL) params.set("league", league);
    if (q) params.set("q", q);
    void (async () => {
      try {
        const res = await fetch(`/api/leaderboard?${params.toString()}`, {
          cache: "no-store", signal: ctrl.signal,
        });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const json = (await res.json()) as Payload;
        if (ctrl.signal.aborted) return;
        setResult({ key, data: json });
      } catch {
        if (ctrl.signal.aborted) return;
        setResult({ key, data: null });
      }
    })();
    return () => ctrl.abort();
  }, [key, league, q, page]);

  const pickLeague = (next: string) => {
    if (next === league) return;
    setLeague(next);
    setPage(0);
  };

  const loading = result?.key !== key;
  const failed = !!result && result.key === key && result.data === null;
  const data = result?.data ?? null;
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const me = data?.me ?? null;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const meOnPage = !!me && rows.some((r) => r.id === me.id);

  /** Clear every filter and land on the page holding your own global rank. */
  const jumpToMe = useCallback(() => {
    if (!me) return;
    setLeague(ALL);
    setSearch("");
    qRef.current = "";
    setQ("");
    setPage(Math.floor((me.rank - 1) / PAGE_SIZE));
  }, [me]);

  return (
    <main className="lbMain">
      <div className="menuBackdrop" aria-hidden="true" />
      <Link className="lbBack" href="/">← Menu</Link>

      <header className="lbHeader">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="lbTitleArt" src="/ui/title-leaderboard.png" alt="Leaderboard" />
        <p>The standing of every duelist in Kelvarrow, measured shard by shard.</p>
      </header>

      <div className="lbControls">
        <div className="lbTabs" role="tablist" aria-label="League filter">
          <button
            className={`lbTab${league === ALL ? " active" : ""}`}
            data-league="All"
            style={{ "--lg": "#e3a44a" } as CSSProperties}
            role="tab" aria-selected={league === ALL}
            data-testid={`lb-tab-${ALL}`}
            onClick={() => pickLeague(ALL)}
          >
            All
          </button>
          {LEAGUES.map((l) => (
            <button
              key={l}
              className={`lbTab${league === l ? " active" : ""}`}
              style={{ "--lg": leagueColor(l) } as CSSProperties}
              role="tab" aria-selected={league === l}
              data-league={l}
              data-testid={`lb-tab-${l}`}
              onClick={() => pickLeague(l)}
            >
              {l}
            </button>
          ))}
        </div>

        <label className="lbSearch">
          <span className="lbSearchIcon" aria-hidden="true">⌕</span>
          <input
            type="search"
            value={search}
            placeholder="Search duelists…"
            aria-label="Search duelists by name"
            data-testid="lb-search"
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>

      <p className="lbCount" data-testid="lb-total">
        {failed ? "The ledger could not be read." : `${fmt(total)} duelist${total === 1 ? "" : "s"} ranked`}
        {league !== ALL && !failed && <span className="lbCountNote"> · {league} league</span>}
        {q && !failed && <span className="lbCountNote"> · matching “{q}”</span>}
      </p>

      <section className={`lbPanel${loading ? " busy" : ""}`}>
        <div className="lbTableWrap">
          <table className="lbTable">
            <thead>
              <tr>
                <th className="cRank">Rank</th>
                <th className="cName">Duelist</th>
                <th className="cLeague">League</th>
                <th className="cRating">Rating</th>
                <th className="cRecord">W / L</th>
                <th className="cWin">Win rate</th>
              </tr>
            </thead>
            <tbody data-testid="lb-rows">
              {rows.map((r) => (
                <LadderRow key={r.id} row={r} isMe={!!me && r.id === me.id} />
              ))}
            </tbody>
          </table>
        </div>

        {rows.length === 0 && (
          <p className="lbEmpty" data-testid="lb-empty">
            {loading ? "Consulting the ledger…"
              : failed ? "The ledger could not be read — try again in a moment."
                : "No duelist by that name has entered the lists."}
          </p>
        )}
      </section>

      <nav className="lbPager" aria-label="Leaderboard pages">
        <button
          className="lbBtn" data-testid="lb-prev"
          disabled={page <= 0 || loading}
          onClick={() => setPage((p) => Math.max(0, p - 1))}
        >
          ← Prev
        </button>
        <span className="lbPageInfo" data-testid="lb-pageinfo">
          Page {fmt(page + 1)} of {fmt(totalPages)}
        </span>
        <button
          className="lbBtn" data-testid="lb-next"
          disabled={page + 1 >= totalPages || loading}
          onClick={() => setPage((p) => p + 1)}
        >
          Next →
        </button>
      </nav>

      {me && !meOnPage && (
        <div className="lbMeBar" data-testid="lb-me">
          <span className="lbMeLabel">Your rank</span>
          <span className="lbMeRank">#{fmt(me.rank)}</span>
          <span className="lbName">{me.name}</span>
          <LeagueBadge league={me.league} />
          <span className="lbMeStat"><b>{fmt(me.rating)}</b> rating</span>
          <span className="lbMeStat lbMeRecord">{me.wins}W · {me.losses}L</span>
          <button className="lbJump" data-testid="lb-me-jump" onClick={jumpToMe}>
            Find me
          </button>
        </div>
      )}
    </main>
  );
}
