"use client";

/** Shardfall FRIENDS — allies roster, friend requests, and friendly battle invites. */

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import type { FactionId } from "@/lib/game/types";
import "@/app/menu.css";
import "./friends.css";

type Player = {
  id: number; name: string; rating: number; league: string;
  gold: number; shards: number; level: number; wins: number; losses: number;
};
type Friend = { id: number; name: string; rating: number; league: string; isBot: number };
type FriendRequest = { fromId: number; name: string; rating: number; league: string };
type BattleInvite = { id: number; fromId: number; name: string };
type OutgoingInvite = { id: number; toId: number; name: string; status: string; matchId: number | null };
type Social = { friends: Friend[]; requests: FriendRequest[]; invites: BattleInvite[]; outgoing: OutgoingInvite[] };

const LEAGUE_COLORS: Record<string, string> = {
  bronze: "#a97142", silver: "#9c93a8", gold: "#e3a44a", diamond: "#4e8ee9", legend: "#ff5c8a",
};
const leagueColor = (league?: string) => LEAGUE_COLORS[(league ?? "").toLowerCase()] ?? "#9c93a8";

const FACTIONS: { id: FactionId; name: string; color: string }[] = [
  { id: "pyre", name: "Pyre", color: "#e0562f" },
  { id: "abyss", name: "Abyss", color: "#45c4b8" },
  { id: "verdant", name: "Verdant", color: "#8cc152" },
];

const JSON_HEADERS = { "Content-Type": "application/json" };

function LeagueBadge({ league }: { league?: string }) {
  if (!league) return null;
  return (
    <span className="leagueBadge" style={{ "--lg": leagueColor(league) } as CSSProperties}>
      {league}
    </span>
  );
}

function FactionPick({ label, onPick }: { label: string; onPick: (f: FactionId) => void }) {
  return (
    <div className="factionPick">
      <span className="pickLabel">{label}</span>
      {FACTIONS.map((f) => (
        <button
          key={f.id}
          className="factionBtn"
          data-testid={`faction-${f.id}`}
          style={{ "--fc": f.color } as CSSProperties}
          onClick={() => onPick(f.id)}
        >
          {f.name}
        </button>
      ))}
    </div>
  );
}

export default function FriendsPage() {
  const router = useRouter();
  const [me, setMe] = useState<Player | null | undefined>(undefined);
  const [social, setSocial] = useState<Social | null>(null);
  const [addName, setAddName] = useState("");
  const [adding, setAdding] = useState(false);
  const [plaque, setPlaque] = useState<{ ok: boolean; text: string } | null>(null);
  const [picker, setPicker] = useState<{ kind: "challenge" | "invite"; id: number } | null>(null);

  const plaqueTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingOutgoing = useRef<Set<number>>(new Set());
  const navigated = useRef(false);

  const goToMatch = useCallback((matchId: number | string) => {
    if (navigated.current) return;
    navigated.current = true;
    router.push(`/play?match=${matchId}`);
  }, [router]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/friends");
      if (!res.ok) return;
      const data: Social = await res.json();
      // an outgoing invite we saw as pending now has a match → the battle started
      for (const o of data.outgoing ?? []) {
        if (o.status === "accepted" && o.matchId != null && pendingOutgoing.current.has(o.id)) {
          goToMatch(o.matchId);
        }
        if (o.status === "pending") pendingOutgoing.current.add(o.id);
      }
      setSocial(data);
    } catch {
      /* transient network error — next poll retries */
    }
  }, [goToMatch]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/me");
        const data = await res.json();
        if (!alive) return;
        setMe(data.player ?? null);
        if (data.player) refresh();
      } catch {
        if (alive) setMe(null);
      }
    })();
    return () => { alive = false; };
  }, [refresh]);

  // live invites: poll every 5s while logged in
  useEffect(() => {
    if (!me) return;
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [me, refresh]);

  useEffect(() => () => { if (plaqueTimer.current) clearTimeout(plaqueTimer.current); }, []);

  const showPlaque = (ok: boolean, text: string) => {
    if (plaqueTimer.current) clearTimeout(plaqueTimer.current);
    setPlaque({ ok, text });
    plaqueTimer.current = setTimeout(() => setPlaque(null), 3500);
  };

  const addFriend = async () => {
    const name = addName.trim();
    if (!name || adding) return;
    setAdding(true);
    try {
      const res = await fetch("/api/friends", {
        method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showPlaque(false, data.error ?? "Something went wrong"); return; }
      if (data.accepted) showPlaque(true, `${name} joined your ranks!`);
      else showPlaque(true, `Request sent to ${name}.`);
      setAddName("");
      refresh();
    } catch {
      showPlaque(false, "Something went wrong");
    } finally {
      setAdding(false);
    }
  };

  const answerRequest = async (fromId: number, accept: boolean) => {
    try {
      await fetch("/api/friends", {
        method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify({ fromId, accept }),
      });
    } catch { /* refresh below re-syncs */ }
    refresh();
  };

  const sendChallenge = async (toId: number, faction: FactionId) => {
    setPicker(null);
    try {
      const res = await fetch("/api/friends/battle", {
        method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ toId, faction }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showPlaque(false, data.error ?? "Challenge failed"); return; }
      if (data.matchId != null) { goToMatch(data.matchId); return; }
      showPlaque(true, "Challenge sent — awaiting their answer.");
      refresh();
    } catch {
      showPlaque(false, "Challenge failed");
    }
  };

  const answerInvite = async (id: number, accept: boolean, faction?: FactionId) => {
    setPicker(null);
    try {
      const res = await fetch("/api/friends/battle", {
        method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify({ id, accept, faction }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showPlaque(false, data.error ?? "Could not answer the invite"); refresh(); return; }
      if (accept && data.matchId != null) { goToMatch(data.matchId); return; }
      refresh();
    } catch {
      showPlaque(false, "Could not answer the invite");
    }
  };

  const signOut = async () => {
    await authClient.signOut();
    setMe(null);
    setSocial(null);
  };

  const pendingTo = new Set(
    (social?.outgoing ?? []).filter((o) => o.status === "pending").map((o) => o.toId),
  );

  return (
    <main className="friendsMain">
      <div className="menuBackdrop" aria-hidden="true" />
      <Link className="friendsBack" href="/">← Menu</Link>

      <header className="friendsHeader">
        <h1>Friends</h1>
        <p>Rally allies across Kelvarrow — and settle scores in friendly battle.</p>
      </header>

      {me && (
        <div className="walletBar" data-testid="friends-id">
          <span className="lvl">{me.name}</span>
          <LeagueBadge league={me.league} />
          <span className="record">{me.rating} rating · {me.wins}W · {me.losses}L</span>
          <button className="signOutBtn" onClick={signOut}>Sign out</button>
        </div>
      )}

      {me === undefined && <div className="friendsLoading">Consulting the ledger…</div>}

      {me === null && (
        <section className="fPanel loginPanel" data-testid="login-required">
          <h2>Adventurer, halt</h2>
          <p>Only sworn wardens of the Shardfall may keep a roster of allies. Sign in to continue.</p>
          <Link className="goldBtn" href="/login">Log in</Link>
        </section>
      )}

      {me && (
        <div className="friendsCol">
          {/* ---- add friend ---- */}
          <section className="fPanel">
            <h2>Forge an alliance</h2>
            <div className="addRow">
              <input
                data-testid="friend-name"
                value={addName}
                placeholder="Exact player name…"
                onChange={(e) => setAddName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addFriend(); }}
              />
              <button className="goldBtn" data-testid="friend-add" onClick={addFriend}
                disabled={adding || !addName.trim()}>
                Add friend
              </button>
            </div>
            {plaque && (
              <div className={`plaque ${plaque.ok ? "ok" : "err"}`} data-testid="friend-plaque">
                {plaque.text}
              </div>
            )}
          </section>

          {/* ---- incoming battle invites ---- */}
          {(social?.invites.length ?? 0) > 0 && (
            <section className="fPanel">
              <h2>Battle invites <span className="fCount">{social!.invites.length}</span></h2>
              <div className="fList">
                {social!.invites.map((inv) => (
                  <div className="fRow" key={inv.id}>
                    <span className="fName">{inv.name}</span>
                    <span className="fRating">challenges you to a friendly battle</span>
                    <div className="fActions">
                      <button className="goldBtn sm" data-testid={`invite-accept-${inv.id}`}
                        onClick={() =>
                          setPicker((p) => (p?.kind === "invite" && p.id === inv.id ? null : { kind: "invite", id: inv.id }))
                        }>
                        Accept
                      </button>
                      <button className="darkBtn sm" data-testid={`invite-decline-${inv.id}`}
                        onClick={() => answerInvite(inv.id, false)}>
                        Decline
                      </button>
                    </div>
                    {picker?.kind === "invite" && picker.id === inv.id && (
                      <FactionPick label="Fight as" onPick={(f) => answerInvite(inv.id, true, f)} />
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ---- incoming friend requests ---- */}
          {(social?.requests.length ?? 0) > 0 && (
            <section className="fPanel">
              <h2>Friend requests <span className="fCount">{social!.requests.length}</span></h2>
              <div className="fList">
                {social!.requests.map((r) => (
                  <div className="fRow" key={r.fromId}>
                    <span className="fName">{r.name}</span>
                    <LeagueBadge league={r.league} />
                    <span className="fRating"><b>{r.rating}</b> rating</span>
                    <div className="fActions">
                      <button className="goldBtn sm" data-testid={`request-accept-${r.fromId}`}
                        onClick={() => answerRequest(r.fromId, true)}>
                        Accept
                      </button>
                      <button className="darkBtn sm" data-testid={`request-decline-${r.fromId}`}
                        onClick={() => answerRequest(r.fromId, false)}>
                        Decline
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ---- friends roster ---- */}
          <section className="fPanel">
            <h2>Allies <span className="fCount">{social?.friends.length ?? 0}</span></h2>
            <div className="fList" data-testid="friends-list">
              {social && social.friends.length === 0 && (
                <div className="fEmpty">No allies yet — add a friend by their exact name.</div>
              )}
              {social?.friends.map((f) => (
                <div className="fRow" key={f.id}>
                  <span className="fName">{f.name}</span>
                  {!!f.isBot && <span className="botTag">Bot</span>}
                  <LeagueBadge league={f.league} />
                  <span className="fRating"><b>{f.rating}</b> rating</span>
                  <div className="fActions">
                    {pendingTo.has(f.id) ? (
                      <span className="invitedTag">Invite sent…</span>
                    ) : (
                      <button className="darkBtn sm" data-testid={`challenge-${f.id}`}
                        onClick={() =>
                          setPicker((p) => (p?.kind === "challenge" && p.id === f.id ? null : { kind: "challenge", id: f.id }))
                        }>
                        Challenge
                      </button>
                    )}
                  </div>
                  {picker?.kind === "challenge" && picker.id === f.id && (
                    <FactionPick label="Fight as" onPick={(fac) => sendChallenge(f.id, fac)} />
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
