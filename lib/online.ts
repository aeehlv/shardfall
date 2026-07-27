"use client";

/** Client helpers for server-authoritative matches. */

import type { FinishRewards } from "@/lib/server/match";
import type { GameEvent, GameState } from "@/lib/game/types";

export interface MatchView {
  matchId: string;
  kind: string;
  yourIndex: 0 | 1;
  seq: number;
  status: string;
  winner: number | null;
  turnDeadline: number;
  state: GameState;
  events: GameEvent[];
  rewards?: FinishRewards;
  opponent: { name: string; rating: number; league: string; isBot: boolean } | null;
  error?: string;
}

const flip = (p: 0 | 1): 0 | 1 => (p === 0 ? 1 : 0);

/** Remap a view so the local player is always index 0. */
export function toLocalPerspective(view: MatchView): MatchView {
  if (view.yourIndex === 0) return view;
  const s = view.state;
  const state: GameState = {
    ...s,
    active: flip(s.active),
    winner: s.winner === null ? null : flip(s.winner as 0 | 1),
    players: [s.players[1], s.players[0]],
  };
  const events = view.events.map((e) => {
    const copy = { ...e } as GameEvent & { player?: 0 | 1; winner?: 0 | 1 };
    if (typeof copy.player === "number") copy.player = flip(copy.player);
    if (typeof copy.winner === "number") copy.winner = flip(copy.winner);
    return copy as GameEvent;
  });
  return {
    ...view, state, events,
    winner: view.winner === null ? null : flip(view.winner as 0 | 1),
  };
}

export async function fetchMatch(id: string, since: number): Promise<MatchView> {
  const r = await fetch(`/api/match/${id}?since=${since}`, { cache: "no-store" });
  const j = await r.json();
  if (!r.ok) return j;
  return toLocalPerspective(j);
}

export async function postMatchAction(
  id: string, body: { action?: unknown; resign?: boolean; since: number },
): Promise<MatchView> {
  const r = await fetch(`/api/match/${id}/action`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!r.ok) return j;
  return toLocalPerspective(j);
}
