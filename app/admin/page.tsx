"use client";

/** Shardfall ADMIN — the warden's ledger of Kelvarrow.
 *  Allowlist-gated (ADMIN_EMAILS): stats tiles, searchable player table, per-row
 *  expand with the player's recent transactions and gold/shard grant controls. */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import "@/app/menu.css";
import "./admin.css";

type Stats = {
  players: number;
  matches: { active: number; finished: number };
  txns24h: number;
  topups24h: number;
};
type AdminPlayer = {
  id: number; name: string; email: string | null; level: number; league: string;
  rating: number; gold: number; shards: number; wins: number; losses: number;
  createdAt?: number;
};
type Txn = {
  ts: number; kind: string; currency: "gold" | "shards" | null; amount: number;
  itemId?: string; balanceAfter?: number;
};

const fmt = (n: number) => n.toLocaleString("en-US");
const fmtWhen = (ts: number) =>
  new Date(ts).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  });

function TxnLine({ txn }: { txn: Txn }) {
  const signed = txn.amount > 0 ? `+${fmt(txn.amount)}` : fmt(txn.amount);
  return (
    <li className="admTxn">
      <span className="admTxnWhen">{fmtWhen(txn.ts)}</span>
      <span className="admTxnKind">{txn.kind}{txn.itemId ? ` · ${txn.itemId}` : ""}</span>
      <span className={`admTxnAmt${txn.amount < 0 ? " neg" : ""}`}>
        {txn.currency ? `${signed} ${txn.currency}` : "—"}
      </span>
    </li>
  );
}

/** Expanded drawer under a player row: recent ledger + grant controls. */
function PlayerDrawer({
  player, onGranted,
}: {
  player: AdminPlayer;
  onGranted: (wallet: { gold: number; shards: number }) => void;
}) {
  const [txns, setTxns] = useState<Txn[] | null>(null);
  const [txnsFailed, setTxnsFailed] = useState(false);
  const [gold, setGold] = useState("");
  const [shards, setShards] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    void (async () => {
      try {
        const res = await fetch(`/api/admin/transactions?playerId=${player.id}&limit=15`, {
          cache: "no-store", signal: ctrl.signal,
        });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const json = (await res.json()) as { transactions: Txn[] };
        if (!ctrl.signal.aborted) setTxns(json.transactions);
      } catch {
        if (!ctrl.signal.aborted) setTxnsFailed(true);
      }
    })();
    return () => ctrl.abort();
  }, [player.id, reloadKey]);

  const grant = async () => {
    const g = Math.max(0, Math.trunc(Number(gold) || 0));
    const s = Math.max(0, Math.trunc(Number(shards) || 0));
    if (!g && !s) {
      setNote({ ok: false, text: "Enter an amount first." });
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/admin/grant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: player.id, gold: g, shards: s }),
      });
      const json = (await res.json()) as { wallet?: { gold: number; shards: number }; error?: string };
      if (!res.ok || !json.wallet) throw new Error(json.error || `status ${res.status}`);
      onGranted(json.wallet);
      setGold("");
      setShards("");
      setNote({ ok: true, text: "Granted." });
      setTxns(null);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setNote({ ok: false, text: err instanceof Error ? err.message : "Grant failed." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admDrawer" data-testid={`admin-drawer-${player.id}`}>
      <div className="admDrawerCol">
        <h3>Recent transactions</h3>
        {txnsFailed ? (
          <p className="admDrawerEmpty">The ledger could not be read.</p>
        ) : txns === null ? (
          <p className="admDrawerEmpty">Consulting the ledger…</p>
        ) : txns.length === 0 ? (
          <p className="admDrawerEmpty">No transactions recorded.</p>
        ) : (
          <ul className="admTxns">
            {txns.map((t, i) => <TxnLine key={`${t.ts}-${i}`} txn={t} />)}
          </ul>
        )}
      </div>
      <div className="admDrawerCol admGrantCol">
        <h3>Grant</h3>
        <label className="admGrantField">
          <span>Gold</span>
          <input
            type="number" min={0} max={100000} step={1} value={gold} placeholder="0"
            data-testid={`admin-grant-gold-${player.id}`}
            onChange={(e) => setGold(e.target.value)}
          />
        </label>
        <label className="admGrantField">
          <span>Shards</span>
          <input
            type="number" min={0} max={100000} step={1} value={shards} placeholder="0"
            data-testid={`admin-grant-shards-${player.id}`}
            onChange={(e) => setShards(e.target.value)}
          />
        </label>
        <button
          className="admGrantBtn" disabled={busy}
          data-testid={`admin-grant-btn-${player.id}`}
          onClick={() => void grant()}
        >
          {busy ? "Granting…" : "Grant"}
        </button>
        {note && (
          <p className={`admGrantNote${note.ok ? " ok" : ""}`}>{note.text}</p>
        )}
      </div>
    </div>
  );
}

export default function AdminPage() {
  const [denied, setDenied] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [players, setPlayers] = useState<AdminPlayer[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const qRef = useRef("");

  // debounce the search box (~300ms)
  useEffect(() => {
    const t = setTimeout(() => {
      const next = search.trim();
      if (next === qRef.current) return;
      qRef.current = next;
      setQ(next);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const ctrl = new AbortController();
    void (async () => {
      try {
        const res = await fetch("/api/admin/stats", { cache: "no-store", signal: ctrl.signal });
        if (res.status === 403) {
          if (!ctrl.signal.aborted) setDenied(true);
          return;
        }
        if (!res.ok) throw new Error(`status ${res.status}`);
        const json = (await res.json()) as Stats;
        if (!ctrl.signal.aborted) setStats(json);
      } catch {
        if (!ctrl.signal.aborted) setFailed(true);
      }
    })();
    return () => ctrl.abort();
  }, []);

  useEffect(() => {
    if (denied) return;
    const ctrl = new AbortController();
    const params = new URLSearchParams({ limit: "100" });
    if (q) params.set("q", q);
    void (async () => {
      try {
        const res = await fetch(`/api/admin/players?${params.toString()}`, {
          cache: "no-store", signal: ctrl.signal,
        });
        if (res.status === 403) {
          if (!ctrl.signal.aborted) setDenied(true);
          return;
        }
        if (!res.ok) throw new Error(`status ${res.status}`);
        const json = (await res.json()) as { players: AdminPlayer[] };
        if (!ctrl.signal.aborted) setPlayers(json.players);
      } catch {
        if (!ctrl.signal.aborted) setFailed(true);
      }
    })();
    return () => ctrl.abort();
  }, [q, denied]);

  if (denied) {
    return (
      <main className="admMain" data-testid="admin-denied">
        <div className="menuBackdrop" aria-hidden="true" />
        <div className="admDenied">
          <h1>Not authorized</h1>
          <p>This ledger is sealed to all but the wardens of Kelvarrow.</p>
          <Link className="admBack admDeniedBack" href="/">← Back to the menu</Link>
        </div>
      </main>
    );
  }

  const applyWallet = (id: number, wallet: { gold: number; shards: number }) => {
    setPlayers((prev) =>
      prev?.map((p) => (p.id === id ? { ...p, gold: wallet.gold, shards: wallet.shards } : p)) ?? prev);
  };

  return (
    <main className="admMain" data-testid="admin-page">
      <div className="menuBackdrop" aria-hidden="true" />
      <Link className="admBack" href="/">← Menu</Link>

      <header className="admHeader">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="admTitleArt" src="/ui/title-wardens-ledger.png" alt="Warden's Ledger" />
        <p>Every duelist, every shard, every grant — under one seal.</p>
      </header>

      {/* eslint-disable @next/next/no-img-element */}
      <section className="admTiles" data-testid="admin-stats">
        <div className="admTile">
          <img className="admTileIcon" src="/ui/icon-duelists.png" alt="" />
          <div className="admTileText">
            <b>{stats ? fmt(stats.players) : "—"}</b>
            <span>Players</span>
          </div>
        </div>
        <div className="admTile">
          <img className="admTileIcon" src="/ui/icon-battles.png" alt="" />
          <div className="admTileText">
            <b>{stats ? fmt(stats.matches.active) : "—"}</b>
            <span>Active matches</span>
          </div>
        </div>
        <div className="admTile">
          <img className="admTileIcon" src="/ui/icon-victories.png" alt="" />
          <div className="admTileText">
            <b>{stats ? fmt(stats.matches.finished) : "—"}</b>
            <span>Finished matches</span>
          </div>
        </div>
        <div className="admTile">
          <img className="admTileIcon" src="/ui/icon-ledger.png" alt="" />
          <div className="admTileText">
            <b>{stats ? fmt(stats.txns24h) : "—"}</b>
            <span>Txns · 24h</span>
          </div>
        </div>
        <div className="admTile">
          <img className="admTileIcon" src="/ui/shard.png" alt="" />
          <div className="admTileText">
            <b>{stats ? fmt(stats.topups24h) : "—"}</b>
            <span>Top-ups · 24h</span>
          </div>
        </div>
      </section>
      {/* eslint-enable @next/next/no-img-element */}

      <div className="admControls">
        <label className="admSearch">
          <span className="admSearchIcon" aria-hidden="true">⌕</span>
          <input
            type="search"
            value={search}
            placeholder="Search players…"
            aria-label="Search players by name"
            data-testid="admin-search"
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>

      <section className="admPanel">
        <div className="admTableWrap">
          <table className="admTable">
            <thead>
              <tr>
                <th className="cId">ID</th>
                <th>Name</th>
                <th>Email</th>
                <th className="cNum">Lvl</th>
                <th>League</th>
                <th className="cNum">Gold</th>
                <th className="cNum">Shards</th>
                <th className="cNum">W / L</th>
              </tr>
            </thead>
            <tbody data-testid="admin-players">
              {(players ?? []).map((p) => [
                <tr
                  key={p.id}
                  className={`admRow${expanded === p.id ? " open" : ""}`}
                  data-testid={`admin-row-${p.id}`}
                  onClick={() => setExpanded((cur) => (cur === p.id ? null : p.id))}
                >
                  <td className="cId">{p.id}</td>
                  <td className="cName">{p.name}</td>
                  <td className="cEmail">{p.email ?? <span className="admNull">—</span>}</td>
                  <td className="cNum">{p.level}</td>
                  <td className="cLeague">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="admCrest" src={`/ui/leagues/${p.league.toLowerCase()}.png`} alt="" />
                    {p.league}
                  </td>
                  <td className="cNum gold">{fmt(p.gold)}</td>
                  <td className="cNum shards">{fmt(p.shards)}</td>
                  <td className="cNum">{p.wins} / {p.losses}</td>
                </tr>,
                expanded === p.id && (
                  <tr key={`${p.id}-drawer`} className="admDrawerRow">
                    <td colSpan={8}>
                      <PlayerDrawer
                        player={p}
                        onGranted={(wallet) => applyWallet(p.id, wallet)}
                      />
                    </td>
                  </tr>
                ),
              ])}
            </tbody>
          </table>
        </div>
        {(!players || players.length === 0) && (
          <p className="admEmpty">
            {failed ? "The ledger could not be read — try again in a moment."
              : players === null ? "Consulting the ledger…"
                : "No player by that name is inscribed."}
          </p>
        )}
      </section>
    </main>
  );
}
