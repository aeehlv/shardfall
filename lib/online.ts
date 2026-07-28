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
  opponent: { name: string; rating: number; league: string } | null;
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

/** Apply a single event to a client-side view state so the board can animate
 *  incrementally instead of jumping to the final state. Best-effort: the
 *  authoritative state from the server is reconciled at the end of the batch. */
export function applyEventToView(state: GameState, ev: GameEvent, getCard: (id: string) => {
  attack?: number; health?: number; keywords?: string[]; igniteX?: number;
}): GameState {
  const s = structuredClone(state);
  const findUnit = (uid: number) => {
    for (const p of [0, 1] as const) {
      const u = s.players[p].board.find((x) => x.uid === uid);
      if (u) return u;
    }
    return undefined;
  };
  switch (ev.type) {
    case "UNIT_SUMMONED": {
      if (findUnit(ev.uid)) break;
      const card = getCard(ev.cardId);
      s.players[ev.player].board.push({
        uid: ev.uid, cardId: ev.cardId,
        attack: card.attack ?? 0, health: card.health ?? 1, maxHealth: card.health ?? 1,
        keywords: [...((card.keywords ?? []) as never[])],
        igniteX: card.igniteX,
        enteredTurn: s.turn, attacksLeft: (card.keywords ?? []).includes("rush") ? 1 : 0,
      });
      break;
    }
    case "DAMAGE": {
      if (ev.targetUid !== undefined) { const u = findUnit(ev.targetUid); if (u) u.health -= ev.amount; }
      else if (ev.player !== undefined) s.players[ev.player].hp -= ev.amount;
      break;
    }
    case "HEAL": {
      if (ev.targetUid !== undefined) { const u = findUnit(ev.targetUid); if (u) u.health += ev.amount; }
      else if (ev.player !== undefined) s.players[ev.player].hp += ev.amount;
      break;
    }
    case "BUFF": {
      const u = findUnit(ev.targetUid);
      if (u) { u.attack += ev.attack; u.health += ev.health; u.maxHealth += ev.health; }
      break;
    }
    case "DEATH":
    case "RETURNED":
      s.players[ev.player].board = s.players[ev.player].board.filter((u) => u.uid !== ev.uid);
      break;
    case "ATTACK": {
      const a = findUnit(ev.attackerUid);
      if (a) a.attacksLeft = Math.max(0, a.attacksLeft - 1);
      break;
    }
    case "DRAW":
      if (!ev.burned) s.players[ev.player].hand.push(ev.cardId ?? "hidden");
      break;
    case "TURN_START":
      s.active = ev.player;
      s.turn = ev.turn;
      for (const u of s.players[ev.player].board) u.attacksLeft = 1;
      break;
    case "GAME_OVER":
      s.winner = ev.winner;
      break;
  }
  return s;
}
