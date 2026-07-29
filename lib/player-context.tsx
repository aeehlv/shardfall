"use client";

/** Signed-in player state — single source of truth for wallet/collection UI.
 *  Wraps the better-auth session and GET /api/me; guests keep using lib/profile. */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import "@/app/tooltip.css";

/** Mirrors the `player` payload of GET /api/me. */
export interface PlayerInfo {
  id: number;
  name: string;
  rating: number;
  league: string;
  gold: number;
  shards: number;
  xp: number;
  level: number;
  wins: number;
  losses: number;
  packs: Record<string, number>;
  collection: Record<string, number>;
  decks: Record<string, string[]>;
  /** ms timestamp of the last free daily claim — present once /api/me exposes it */
  lastFreeClaim?: number;
}

export interface PlayerState {
  signedIn: boolean;
  sessionLoading: boolean;
  player: PlayerInfo | null;
  activeMatches: { id: string; kind: string }[];
  campaignCleared: string[];
  flags: { demoGrants: boolean };
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const NO_FLAGS = { demoGrants: false };

const PlayerContext = createContext<PlayerState | null>(null);

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const { data: session, isPending: sessionLoading } = authClient.useSession();
  const signedIn = Boolean(session?.user);
  const [player, setPlayer] = useState<PlayerInfo | null>(null);
  const [activeMatches, setActiveMatches] = useState<{ id: string; kind: string }[]>([]);
  const [campaignCleared, setCampaignCleared] = useState<string[]>([]);
  const [flags, setFlags] = useState(NO_FLAGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Monotonic token: only the newest in-flight /api/me response may apply state.
  const reqToken = useRef(0);
  const signedInRef = useRef(signedIn);
  useEffect(() => { signedInRef.current = signedIn; }, [signedIn]);

  const refresh = useCallback(async () => {
    if (!signedIn) return;
    const token = ++reqToken.current;
    try {
      const r = await fetch("/api/me", { cache: "no-store" });
      if (token !== reqToken.current || !signedInRef.current) return;
      if (!r.ok) { setError(`Account unavailable (${r.status})`); return; }
      const j = await r.json();
      if (token !== reqToken.current || !signedInRef.current) return;
      setPlayer(j.player ?? null);
      setActiveMatches(j.activeMatches ?? []);
      setCampaignCleared(j.campaignCleared ?? []);
      setFlags(j.flags ?? NO_FLAGS);
      setError(null);
    } catch {
      if (token !== reqToken.current || !signedInRef.current) return;
      setError("Account unavailable — check your connection");
    }
  }, [signedIn]);

  // Safety net: returning to the tab re-syncs the wallet (at most every 10s).
  const lastVisRefresh = useRef(0);
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      const t = Date.now();
      if (t - lastVisRefresh.current < 10_000) return;
      lastVisRefresh.current = t;
      void refresh();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [refresh]);

  useEffect(() => {
    if (sessionLoading) return;
    if (!signedIn) {
      reqToken.current++; // invalidate any in-flight refresh
      setPlayer(null);
      setActiveMatches([]);
      setCampaignCleared([]);
      setFlags(NO_FLAGS);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    void refresh().finally(() => setLoading(false));
  }, [sessionLoading, signedIn, refresh]);

  const value = useMemo<PlayerState>(
    () => ({ signedIn, sessionLoading, player, activeMatches, campaignCleared, flags, loading, error, refresh }),
    [signedIn, sessionLoading, player, activeMatches, campaignCleared, flags, loading, error, refresh],
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer(): PlayerState {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used inside <PlayerProvider>");
  return ctx;
}

/* eslint-disable @next/next/no-img-element */

/** Hover card explaining a currency — where gold comes from, where shards are bought.
 *  The tip element lives OUTSIDE any data-testid span so e2e text reads stay clean. */
export function CurrencyHint({ kind, children }: { kind: "gold" | "shards"; children: ReactNode }) {
  return (
    <span className="curHint" tabIndex={0}>
      {children}
      <span className="curTip" role="tooltip">
        {kind === "gold" ? (
          <>
            <b>Gold</b>
            <em>Earned in battle — win matches (+40), clear campaign nodes, and claim daily rewards.</em>
          </>
        ) : (
          <>
            <b>Aethershards</b>
            <em>The premium currency of Kelvarrow — fuels hot deals and featured singles.</em>
            <Link className="curTipLink" href="/store">Get more in the Store →</Link>
          </>
        )}
      </span>
    </span>
  );
}

/** The menu wallet chips, fed by the server wallet — never localStorage numbers. */
export function WalletBar() {
  const { player, error, refresh } = usePlayer();
  if (!player) {
    if (error) {
      return (
        <div className="walletBar" data-testid="wallet">
          <span className="wRecord">Account data unavailable</span>
          <button className="menuSmall" onClick={() => void refresh()}>Retry</button>
        </div>
      );
    }
    return (
      <div className="walletBar" data-testid="wallet">
        <span className="wRes"><img src="/ui/gold.png" alt="gold" /><b className="wDim">···</b></span>
        <span className="wRes"><img src="/ui/shard.png" alt="shards" /><b className="wDim">···</b></span>
        <span className="wLevel"><img src="/ui/emblem.png" alt="" /><i className="wDim">·</i></span>
        <span className="wRecord wDim">···</span>
      </div>
    );
  }
  return (
    <div className="walletBar" data-testid="wallet">
      <span className="wRes">
        <CurrencyHint kind="gold"><img src="/ui/gold.png" alt="gold" /><b>{player.gold}</b></CurrencyHint>
      </span>
      <span className="wRes">
        <CurrencyHint kind="shards"><img src="/ui/shard.png" alt="shards" /><b>{player.shards}</b></CurrencyHint>
      </span>
      <span className="wLevel"><img src="/ui/emblem.png" alt="" /><i>{player.level}</i></span>
      <span className="wRecord">{player.wins}W · {player.losses}L</span>
    </div>
  );
}
/* eslint-enable @next/next/no-img-element */
