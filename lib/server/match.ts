/** Server-authoritative matches: persistent, resumable, lazy turn-deadline enforcement. */

import { randomUUID } from "crypto";
import { db } from "./db";
import { addXpGold, applyElo, getPlayerById, grantPacks, updatePlayer } from "./players";
import { applyAction, newGame } from "@/lib/game/engine";
import { aiTakeTurn } from "@/lib/game/ai";
import { buildStarterDeck } from "@/lib/game/decks";
import { CARD_POOL } from "@/lib/game/pool";
import { CAMPAIGN, chapterName, isUnlocked, nodeById } from "@/lib/game/campaign";
import {
  chapterCompletionReward, chapterProgress, isChapterComplete, isEmptyReward, mergeRewards,
  nodeSlot, objectivesFor, rewardFor, starsEarned, STARS_PER_NODE,
  totalStarsEarned, totalStarsPossible,
} from "@/lib/game/campaign-rewards";
import type { MatchSummary, NodeReward, PackSize } from "@/lib/game/campaign-rewards";
import type { FactionId, GameEvent, GameState } from "@/lib/game/types";

export const TURN_MS = 75_000;

export interface MatchRow {
  id: string; kind: string; p0: number; p1: number;
  state: string; seq: number; status: string; winner: number | null;
  turnDeadline: number; campaignNode: string | null; rewards: string | null;
  /** Running tallies maintained by the match layer (the engine stays rules-pure). */
  p0Spells: number; p0UnitsLost: number;
}

export interface RewardPack { size: PackSize; count: number }
export interface StarDetail { label: string; achieved: boolean }
export interface ChapterCompleteRewards {
  chapter: number; name: string;
  gold: number; shards: number; packs: RewardPack[]; card?: string;
}

export interface FinishRewards {
  won: boolean; gold: number; xp: number; levelUps: number;
  /** Always present; 0 / [] outside the campaign. */
  shards: number; packs: RewardPack[];
  ratingDelta?: number; rating?: number; league?: string;
  /** Legacy single-pack field kept for the existing end-of-match panel. */
  pack?: string; firstClear?: boolean;
  /** Campaign only (P0). `stars` is this run; `bestStars` is the record now stored. */
  stars?: number; bestStars?: number; maxStars?: number; starDetails?: StarDetail[];
  nodeId?: string; nodeName?: string; chapter?: number; chapterName?: string;
  card?: string;
  chapterComplete?: ChapterCompleteRewards;
}

function saveEvents(matchId: string, seq: number, events: GameEvent[]) {
  db.prepare("INSERT OR REPLACE INTO match_events (matchId, seq, events) VALUES (?, ?, ?)")
    .run(matchId, seq, JSON.stringify(events));
}

/** Per-step tally of the two things the star objectives need but the state does not carry. */
function tallyP0(events: GameEvent[]): { spells: number; unitsLost: number } {
  let spells = 0;
  let unitsLost = 0;
  for (const e of events) {
    if (e.type === "SPELL_CAST" && e.player === 0) spells += 1;
    else if (e.type === "DEATH" && e.player === 0) unitsLost += 1;
  }
  return { spells, unitsLost };
}

/** Everything `campaign-rewards` needs to score a finished match, from P0's side. */
export function matchSummary(m: MatchRow, state: GameState): MatchSummary {
  const p0 = state.players[0];
  return {
    won: state.winner === 0,
    heroHp: Math.max(0, p0.hp),
    // The scorer counts the campaign player's OWN turns, not the global counter.
    turns: p0.turnsTaken || state.turn,
    unitsAlive: p0.board.length,
    unitsLost: m.p0UnitsLost ?? 0,
    spellsPlayed: m.p0Spells ?? 0,
  };
}

/** `nodeId → best stars` for a player, as stored in campaign_progress. */
export function campaignStars(playerId: number): Record<string, number> {
  const rows = db
    .prepare("SELECT nodeId, stars FROM campaign_progress WHERE playerId=?")
    .all(playerId) as { nodeId: string; stars: number | null }[];
  const out: Record<string, number> = {};
  for (const r of rows) out[r.nodeId] = Math.min(STARS_PER_NODE, Math.max(1, r.stars ?? 1));
  return out;
}

/** Payload behind `GET /api/campaign`: per-node stars + objectives and a chapter roll-up. */
export function campaignOverview(playerId: number) {
  const stars = campaignStars(playerId);
  const cleared = new Set(Object.keys(stars));
  const claimed = new Set(
    (db.prepare("SELECT chapter FROM campaign_chapter_rewards WHERE playerId=?")
      .all(playerId) as { chapter: number }[]).map((r) => r.chapter),
  );
  return {
    nodes: CAMPAIGN.map((n) => {
      const earned = stars[n.id] ?? 0;
      return {
        ...n,
        cleared: cleared.has(n.id),
        unlocked: isUnlocked(n.id, cleared),
        stars: earned,
        maxStars: STARS_PER_NODE,
        // Stars are cumulative (★3 implies ★2), so objective i is held when i < earned.
        objectives: objectivesFor(n.id).map((o, i) => ({
          kind: o.kind, label: o.label, achieved: i < earned,
        })),
      };
    }),
    chapters: chapterProgress(stars).map((c) => ({
      ...c, name: chapterName(c.chapter), rewardClaimed: claimed.has(c.chapter),
    })),
    totalStars: totalStarsEarned(stars),
    totalStarsPossible: totalStarsPossible(),
  };
}

/** Pay a NodeReward into a player's wallet / packs / collection. */
function applyReward(playerId: number, r: NodeReward) {
  const p = getPlayerById(playerId);
  if (!p) return;
  const fields: Partial<Record<string, unknown>> = {};
  if (r.gold) fields.gold = p.gold + r.gold;
  if (r.shards) fields.shards = p.shards + r.shards;
  if (r.card) {
    const collection = JSON.parse(p.collection || "{}") as Record<string, number>;
    collection[r.card] = (collection[r.card] ?? 0) + 1;
    fields.collection = JSON.stringify(collection);
  }
  if (Object.keys(fields).length > 0) updatePlayer(playerId, fields);
  for (const pack of r.packs) grantPacks(playerId, pack.size, pack.count);
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
  const row = db.prepare("SELECT * FROM matches WHERE id = ?").get(id) as MatchRow | undefined;
  if (row) {
    // Rows written before the tally columns existed come back NULL.
    row.p0Spells = row.p0Spells ?? 0;
    row.p0UnitsLost = row.p0UnitsLost ?? 0;
  }
  return row;
}

function persist(m: MatchRow, state: GameState, eventsBatch: GameEvent[]) {
  m.seq += 1;
  m.state = JSON.stringify(state);
  saveEvents(m.id, m.seq, eventsBatch);
  // Accumulate the objective counters BEFORE handleFinish so the last batch counts.
  const tally = tallyP0(eventsBatch);
  m.p0Spells = (m.p0Spells ?? 0) + tally.spells;
  m.p0UnitsLost = (m.p0UnitsLost ?? 0) + tally.unitsLost;
  const finished = state.winner !== null;
  db.prepare(
    `UPDATE matches SET state=?, seq=?, status=?, winner=?, turnDeadline=?,
       p0Spells=?, p0UnitsLost=?, updatedAt=? WHERE id=?`,
  ).run(
    m.state, m.seq, finished ? "finished" : "active", state.winner, Date.now() + TURN_MS,
    m.p0Spells, m.p0UnitsLost, Date.now(), m.id,
  );
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

/**
 * Score a finished campaign node for P0: stars → node reward → (maybe) chapter milestone.
 * Mutates `rw` with everything the end-of-match panel needs and pays the player out.
 */
function scoreCampaignNode(
  m: MatchRow, state: GameState, pid: number, nodeId: string, won: boolean, rw: FinishRewards,
) {
  const node = nodeById(nodeId);
  const slot = nodeSlot(nodeId);
  const chapter = node?.chapter ?? slot.chapter;
  const summary = matchSummary(m, state);
  const objectives = objectivesFor(nodeId);
  const stars = won ? starsEarned(nodeId, summary) : 0;

  rw.nodeId = nodeId;
  rw.nodeName = node?.name ?? nodeId;
  rw.chapter = chapter;
  rw.chapterName = chapterName(chapter);
  rw.stars = stars;
  rw.maxStars = STARS_PER_NODE;
  rw.starDetails = objectives.map((o) => ({ label: o.label, achieved: won && o.test(summary) }));
  if (!won) return;

  // Best-ever stars: insert on first clear, raise only when this run beat the record.
  const prev = db
    .prepare("SELECT stars FROM campaign_progress WHERE playerId=? AND nodeId=?")
    .get(pid, nodeId) as { stars: number | null } | undefined;
  const firstClear = !prev;
  const best = Math.max(1, stars);
  if (firstClear) {
    db.prepare("INSERT INTO campaign_progress (playerId, nodeId, stars) VALUES (?, ?, ?)")
      .run(pid, nodeId, best);
  } else if (best > (prev.stars ?? 0)) {
    db.prepare("UPDATE campaign_progress SET stars=? WHERE playerId=? AND nodeId=?")
      .run(best, pid, nodeId);
  }
  rw.firstClear = firstClear;
  rw.bestStars = Math.max(best, prev?.stars ?? 0);

  const nodeReward = rewardFor(nodeId, stars, firstClear);
  let bonus: NodeReward | null = null;

  // Chapter milestone: every node of the chapter cleared, and never paid out before.
  const held = campaignStars(pid);
  if (isChapterComplete(chapter, held)) {
    const claimed = db
      .prepare("SELECT 1 FROM campaign_chapter_rewards WHERE playerId=? AND chapter=?")
      .get(pid, chapter);
    if (!claimed) {
      const chapterStars = chapterProgress(held).find((c) => c.chapter === chapter)?.stars ?? 0;
      const milestone = chapterCompletionReward(chapter, chapterStars);
      if (!isEmptyReward(milestone)) {
        db.prepare("INSERT OR IGNORE INTO campaign_chapter_rewards (playerId, chapter, stars) VALUES (?, ?, ?)")
          .run(pid, chapter, chapterStars);
        bonus = milestone;
        rw.chapterComplete = {
          chapter, name: chapterName(chapter),
          gold: milestone.gold, shards: milestone.shards, packs: milestone.packs, card: milestone.card,
        };
      }
    }
  }

  // Paid separately: mergeRewards keeps only the FIRST card, so a boss first clear
  // and a chapter mastery card in the same finish would lose one of the two.
  applyReward(pid, nodeReward);
  if (bonus) applyReward(pid, bonus);

  const total = bonus ? mergeRewards(nodeReward, bonus) : nodeReward;
  rw.gold += total.gold;
  rw.shards += total.shards;
  rw.packs = total.packs;
  if (nodeReward.card) rw.card = nodeReward.card;
  // Legacy field the current end panel reads.
  if (total.packs.length > 0) rw.pack = total.packs[0].size;
}

function handleFinish(m: MatchRow, state: GameState) {
  const rewards: Record<number, FinishRewards> = {};
  for (const idx of [0, 1] as const) {
    const pid = idx === 0 ? m.p0 : m.p1;
    const player = getPlayerById(pid);
    if (!player) continue;
    const won = state.winner === idx;
    const rw: FinishRewards = { won, gold: 0, xp: 0, levelUps: 0, shards: 0, packs: [] };
    if (!player.isBot && m.kind !== "friendly") {
      rw.gold = won ? 40 : 15;
      rw.xp = won ? 60 : 25;
      const res = addXpGold(pid, rw.gold, rw.xp, won);
      rw.levelUps = res.levelUps;
    }
    if (m.kind === "campaign" && idx === 0 && m.campaignNode) {
      scoreCampaignNode(m, state, pid, m.campaignNode, won, rw);
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
