/** Server-authoritative matches: persistent, resumable, lazy turn-deadline enforcement. */

import { randomUUID } from "crypto";
import { db } from "./db";
import { addXpGold, applyElo, getPlayerById, grantPacks, updatePlayer } from "./players";
import { applyAction, newGame } from "@/lib/game/engine";
import { aiTakeTurn } from "@/lib/game/ai";
import { buildStarterDeck } from "@/lib/game/decks";
import { CARD_POOL } from "@/lib/game/pool";
import { nodeById } from "@/lib/game/campaign";
import type { FactionId, GameEvent, GameState } from "@/lib/game/types";

export const TURN_MS = 75_000;

export interface MatchRow {
  id: string; kind: string; p0: number; p1: number;
  state: string; seq: number; status: string; winner: number | null;
  turnDeadline: number; campaignNode: string | null; rewards: string | null;
}

export interface FinishRewards {
  won: boolean; gold: number; xp: number; levelUps: number;
  ratingDelta?: number; rating?: number; league?: string;
  pack?: string; firstClear?: boolean;
}

function saveEvents(matchId: string, seq: number, events: GameEvent[]) {
  db.prepare("INSERT OR REPLACE INTO match_events (matchId, seq, events) VALUES (?, ?, ?)")
    .run(matchId, seq, JSON.stringify(events));
}

export function createMatch(opts: {
  kind: "ranked" | "friendly" | "campaign";
  p0: number; p1: number;
  p0Faction: FactionId; p1Faction: FactionId;
  campaignNode?: string;
}): MatchRow {
  const id = randomUUID();
  const seed = Math.floor(Math.random() * 2147483647);
  const state = newGame(
    buildStarterDeck(CARD_POOL, opts.p0Faction),
    buildStarterDeck(CARD_POOL, opts.p1Faction),
    seed, opts.p0Faction, opts.p1Faction,
  );
  // campaign difficulty knobs
  if (opts.campaignNode) {
    const node = nodeById(opts.campaignNode);
    if (node) {
      state.players[1].hp += node.enemyHpBonus;
      state.players[1].manaMax += node.enemyManaBonus;
    }
  }
  db.prepare(
    `INSERT INTO matches (id, kind, p0, p1, state, seq, turnDeadline, campaignNode)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
  ).run(id, opts.kind, opts.p0, opts.p1, JSON.stringify(state), Date.now() + TURN_MS, opts.campaignNode ?? null);
  return getMatch(id)!;
}

export function getMatch(id: string): MatchRow | undefined {
  return db.prepare("SELECT * FROM matches WHERE id = ?").get(id) as MatchRow | undefined;
}

function persist(m: MatchRow, state: GameState, eventsBatch: GameEvent[]) {
  m.seq += 1;
  m.state = JSON.stringify(state);
  saveEvents(m.id, m.seq, eventsBatch);
  const finished = state.winner !== null;
  db.prepare(
    `UPDATE matches SET state=?, seq=?, status=?, winner=?, turnDeadline=?, updatedAt=? WHERE id=?`,
  ).run(m.state, m.seq, finished ? "finished" : "active", state.winner, Date.now() + TURN_MS, Date.now(), m.id);
  if (finished && m.status !== "finished") {
    m.status = "finished";
    handleFinish(m, state);
  }
}

/** Bot plays while it's the bot's turn. Returns events. */
function botPlay(m: MatchRow, state: GameState): { state: GameState; events: GameEvent[] } {
  let cur = state;
  const events: GameEvent[] = [];
  const botIndex = getPlayerById(m.p1)?.isBot ? 1 : getPlayerById(m.p0)?.isBot ? 0 : -1;
  let guard = 0;
  while (cur.winner === null && botIndex !== -1 && cur.active === botIndex && guard++ < 3) {
    for (const step of aiTakeTurn(cur)) {
      events.push(...step.result.events);
      cur = step.result.state;
      if (cur.winner !== null) break;
    }
  }
  return { state: cur, events };
}

/** Enforce expired turn deadlines (auto END_TURN), including bot replies. */
export function enforceDeadlines(m: MatchRow): void {
  if (m.status !== "active") return;
  let state = JSON.parse(m.state) as GameState;
  let changed = false;
  const events: GameEvent[] = [];
  let guard = 0;
  while (state.winner === null && Date.now() > m.turnDeadline && guard++ < 8) {
    const r = applyAction(state, { type: "END_TURN" });
    if (r.error) break;
    events.push(...r.events);
    state = r.state;
    const bot = botPlay(m, state);
    events.push(...bot.events);
    state = bot.state;
    changed = true;
    m.turnDeadline = Date.now() + TURN_MS;
  }
  if (changed) persist(m, state, events);
}

export function playerIndexIn(m: MatchRow, playerId: number): 0 | 1 | -1 {
  if (m.p0 === playerId) return 0;
  if (m.p1 === playerId) return 1;
  return -1;
}

export function applyPlayerAction(
  m: MatchRow, playerId: number, action: Parameters<typeof applyAction>[1],
): { ok: boolean; error?: string } {
  enforceDeadlines(m);
  const fresh = getMatch(m.id)!;
  Object.assign(m, fresh);
  if (m.status !== "active") return { ok: false, error: "Match is over" };
  const idx = playerIndexIn(m, playerId);
  if (idx === -1) return { ok: false, error: "Not your match" };
  let state = JSON.parse(m.state) as GameState;
  if (state.active !== idx) return { ok: false, error: "Not your turn" };
  const r = applyAction(state, action);
  if (r.error) return { ok: false, error: r.error };
  const events = [...r.events];
  state = r.state;
  const bot = botPlay(m, state);
  events.push(...bot.events);
  state = bot.state;
  persist(m, state, events);
  return { ok: true };
}

export function resign(m: MatchRow, playerId: number) {
  if (m.status !== "active") return;
  const idx = playerIndexIn(m, playerId);
  if (idx === -1) return;
  const state = JSON.parse(m.state) as GameState;
  state.winner = (1 - idx) as 0 | 1;
  persist(m, state, [{ type: "GAME_OVER", winner: state.winner }]);
}

function handleFinish(m: MatchRow, state: GameState) {
  const rewards: Record<number, FinishRewards> = {};
  for (const idx of [0, 1] as const) {
    const pid = idx === 0 ? m.p0 : m.p1;
    const player = getPlayerById(pid);
    if (!player) continue;
    const won = state.winner === idx;
    const rw: FinishRewards = { won, gold: 0, xp: 0, levelUps: 0 };
    if (!player.isBot && m.kind !== "friendly") {
      rw.gold = won ? 40 : 15;
      rw.xp = won ? 60 : 25;
      const res = addXpGold(pid, rw.gold, rw.xp, won);
      rw.levelUps = res.levelUps;
    }
    if (m.kind === "campaign" && idx === 0 && m.campaignNode) {
      const node = nodeById(m.campaignNode);
      if (node && won) {
        const already = db.prepare("SELECT 1 FROM campaign_progress WHERE playerId=? AND nodeId=?").get(pid, m.campaignNode);
        if (!already) {
          db.prepare("INSERT INTO campaign_progress (playerId, nodeId) VALUES (?, ?)").run(pid, m.campaignNode);
          grantPacks(pid, node.firstWin.pack, 1);
          const p = getPlayerById(pid)!;
          updatePlayer(pid, { gold: p.gold + node.firstWin.gold });
          rw.gold += node.firstWin.gold;
          rw.pack = node.firstWin.pack;
          rw.firstClear = true;
        } else {
          const p = getPlayerById(pid)!;
          updatePlayer(pid, { gold: p.gold + node.replayGold });
          rw.gold += node.replayGold;
        }
      }
    }
    rewards[idx] = rw;
  }
  if (m.kind === "ranked") {
    const delta = applyElo(m.p0, m.p1, state.winner === 0);
    const p0 = getPlayerById(m.p0)!;
    const p1 = getPlayerById(m.p1)!;
    rewards[0] = { ...rewards[0], ratingDelta: delta, rating: p0.rating, league: p0.league };
    rewards[1] = { ...rewards[1], ratingDelta: -delta, rating: p1.rating, league: p1.league };
  }
  db.prepare("UPDATE matches SET rewards=? WHERE id=?").run(JSON.stringify(rewards), m.id);
  m.rewards = JSON.stringify(rewards);
}

/** Client view: hide opponent hand ids and both deck contents; collect events since `since`. */
export function stateView(m: MatchRow, playerId: number, since: number) {
  enforceDeadlines(m);
  const fresh = getMatch(m.id)!;
  const idx = playerIndexIn(fresh, playerId);
  const state = JSON.parse(fresh.state) as GameState;
  const view = structuredClone(state);
  const foe = idx === 0 ? 1 : 0;
  view.players[foe].hand = view.players[foe].hand.map(() => "hidden");
  view.players[0].deck = view.players[0].deck.map(() => "hidden");
  view.players[1].deck = view.players[1].deck.map(() => "hidden");
  const rows = db
    .prepare("SELECT seq, events FROM match_events WHERE matchId=? AND seq>? ORDER BY seq")
    .all(fresh.id, since) as { seq: number; events: string }[];
  const events: GameEvent[] = rows.flatMap((r) => JSON.parse(r.events) as GameEvent[])
    .map((e) => (e.type === "DRAW" && e.player === foe ? { ...e, cardId: undefined } : e));
  const rewards = fresh.rewards ? (JSON.parse(fresh.rewards) as Record<number, FinishRewards>)[idx] : undefined;
  const opp = getPlayerById(idx === 0 ? fresh.p1 : fresh.p0);
  return {
    matchId: fresh.id,
    kind: fresh.kind,
    yourIndex: idx,
    seq: fresh.seq,
    status: fresh.status,
    winner: fresh.winner,
    turnDeadline: fresh.turnDeadline,
    state: view,
    events,
    rewards,
    opponent: opp ? { name: opp.name, rating: opp.rating, league: opp.league, isBot: !!opp.isBot } : null,
  };
}

export function activeMatchesFor(playerId: number): { id: string; kind: string }[] {
  return db
    .prepare("SELECT id, kind FROM matches WHERE (p0=? OR p1=?) AND status='active' ORDER BY updatedAt DESC")
    .all(playerId, playerId) as { id: string; kind: string }[];
}
