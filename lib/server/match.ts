/** Server-authoritative matches: persistent, resumable, lazy turn-deadline enforcement.
 *  Backed by MongoDB — every db-touching export is async. */

import { randomUUID } from "crypto";
import type { Filter } from "mongodb";
import {
  campaignChapterRewardsCol, campaignProgressCol, matchEventsCol, matchesCol, playersCol,
  type MatchDoc,
} from "./db";
import { addXpGold, applyElo, creditWallet, getPlayerById, grantPacks } from "./players";
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
  /** The live GameState — a real object (it was a JSON string under SQLite). */
  state: GameState; seq: number; status: string; winner: number | null;
  turnDeadline: number; campaignNode: string | null;
  rewards: Record<number, FinishRewards> | null;
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

function toMatchRow(doc: MatchDoc): MatchRow {
  return {
    id: doc._id,
    kind: doc.kind,
    p0: doc.p0,
    p1: doc.p1,
    state: doc.state,
    seq: doc.seq ?? 0,
    status: doc.status ?? "active",
    winner: doc.winner ?? null,
    turnDeadline: doc.turnDeadline,
    campaignNode: doc.campaignNode ?? null,
    rewards: (doc.rewards as Record<number, FinishRewards> | null) ?? null,
    // Documents written before the tally fields existed come back undefined.
    p0Spells: doc.p0Spells ?? 0,
    p0UnitsLost: doc.p0UnitsLost ?? 0,
  };
}

/** Insert-only: the unique {matchId, seq} index is the write lock for a step.
 *  False = another writer already recorded this seq (concurrent advance). */
async function saveEvents(matchId: string, seq: number, events: GameEvent[]): Promise<boolean> {
  try {
    await (await matchEventsCol()).insertOne({ matchId, seq, events });
    return true;
  } catch (err) {
    if ((err as { code?: number }).code === 11000) return false;
    throw err;
  }
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
export async function campaignStars(playerId: number): Promise<Record<string, number>> {
  const rows = await (await campaignProgressCol())
    .find({ playerId }, { projection: { nodeId: 1, stars: 1 } })
    .toArray();
  const out: Record<string, number> = {};
  for (const r of rows) out[r.nodeId] = Math.min(STARS_PER_NODE, Math.max(1, r.stars ?? 1));
  return out;
}

/** Payload behind `GET /api/campaign`: per-node stars + objectives and a chapter roll-up. */
export async function campaignOverview(playerId: number) {
  const stars = await campaignStars(playerId);
  const cleared = new Set(Object.keys(stars));
  const claimedRows = await (await campaignChapterRewardsCol())
    .find({ playerId }, { projection: { chapter: 1 } })
    .toArray();
  const claimed = new Set(claimedRows.map((r) => r.chapter));
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

/** Pay a NodeReward into a player's wallet / packs / collection — atomic $incs only. */
async function applyReward(playerId: number, r: NodeReward) {
  if (r.gold || r.shards) {
    await creditWallet(
      playerId,
      { gold: r.gold || undefined, shards: r.shards || undefined },
      { kind: "campaign_reward" },
    );
  }
  if (r.card) {
    await (await playersCol()).updateOne(
      { _id: playerId },
      { $inc: { [`collection.${r.card}`]: 1 } },
    );
  }
  for (const pack of r.packs) await grantPacks(playerId, pack.size, pack.count);
}

export async function createMatch(opts: {
  kind: "ranked" | "friendly" | "campaign";
  p0: number; p1: number;
  p0Faction: FactionId; p1Faction: FactionId;
  campaignNode?: string;
}): Promise<MatchRow> {
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
  const now = Date.now();
  const doc: MatchDoc = {
    _id: id,
    kind: opts.kind,
    p0: opts.p0,
    p1: opts.p1,
    state,
    seq: 0,
    status: "active",
    winner: null,
    turnDeadline: now + TURN_MS,
    campaignNode: opts.campaignNode ?? null,
    rewards: null,
    p0Spells: 0,
    p0UnitsLost: 0,
    createdAt: now,
    updatedAt: now,
  };
  await (await matchesCol()).insertOne(doc);
  return toMatchRow(doc);
}

export async function getMatch(id: string): Promise<MatchRow | undefined> {
  const doc = await (await matchesCol()).findOne({ _id: id });
  return doc ? toMatchRow(doc) : undefined;
}

/** CAS write of one step (events insert + seq-guarded match update).
 *  False = the in-memory row was stale: another writer advanced the match first.
 *  `m` is only mutated on success, so callers can reload and retry cleanly. */
async function persist(
  m: MatchRow, state: GameState, eventsBatch: GameEvent[], opts: { skipFinish?: boolean } = {},
): Promise<boolean> {
  const nextSeq = m.seq + 1;
  if (!(await saveEvents(m.id, nextSeq, eventsBatch))) {
    // A row at nextSeq already exists. Either a concurrent writer advanced the match
    // (its seq moved past ours), or a writer died between its events insert and the
    // state CAS below, leaving an orphan row that would dup-key every future persist.
    // If the stored seq still equals ours, it's an orphan: take the row over — the
    // seq-guarded state update remains the real lock.
    const stored = await (await matchesCol()).findOne({ _id: m.id }, { projection: { seq: 1 } });
    if ((stored?.seq ?? 0) !== m.seq) return false;
    await (await matchEventsCol()).replaceOne(
      { matchId: m.id, seq: nextSeq },
      { matchId: m.id, seq: nextSeq, events: eventsBatch },
    );
  }
  // Accumulate the objective counters BEFORE handleFinish so the last batch counts.
  const tally = tallyP0(eventsBatch);
  const p0Spells = (m.p0Spells ?? 0) + tally.spells;
  const p0UnitsLost = (m.p0UnitsLost ?? 0) + tally.unitsLost;
  const finished = state.winner !== null;
  const now = Date.now();
  const turnDeadline = now + TURN_MS;
  const res = await (await matchesCol()).updateOne(
    { _id: m.id, seq: m.seq },
    {
      $set: {
        state, seq: nextSeq,
        status: finished ? "finished" : "active",
        winner: state.winner,
        turnDeadline,
        p0Spells, p0UnitsLost,
        updatedAt: now,
        // Abandons pay nothing: mark settlement done in the same atomic write so the
        // finished-with-no-rewards recovery in stateView never pays them later.
        ...(finished && opts.skipFinish ? { rewardsSettled: true } : {}),
      },
    },
  );
  if (res.matchedCount === 0) return false;
  const wasFinished = m.status === "finished";
  m.seq = nextSeq;
  m.state = state;
  m.p0Spells = p0Spells;
  m.p0UnitsLost = p0UnitsLost;
  m.turnDeadline = turnDeadline;
  m.winner = state.winner;
  m.status = finished ? "finished" : "active";
  if (finished && !wasFinished && !opts.skipFinish) await handleFinish(m, state);
  return true;
}

/** Bot plays while it's the bot's turn. Returns events. */
async function botPlay(m: MatchRow, state: GameState): Promise<{ state: GameState; events: GameEvent[] }> {
  let cur = state;
  const events: GameEvent[] = [];
  const p1Bot = (await getPlayerById(m.p1))?.isBot;
  const p0Bot = p1Bot ? 0 : (await getPlayerById(m.p0))?.isBot;
  const botIndex = p1Bot ? 1 : p0Bot ? 0 : -1;
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

/** Enforce expired turn deadlines (auto END_TURN), including bot replies.
 *  A lost CAS just means another request already advanced the match — reload and
 *  re-check once; never throw on that benign race. */
export async function enforceDeadlines(m: MatchRow): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (m.status !== "active") return;
    let state = structuredClone(m.state);
    let changed = false;
    const events: GameEvent[] = [];
    let guard = 0;
    let deadline = m.turnDeadline;
    while (state.winner === null && Date.now() > deadline && guard++ < 8) {
      const r = applyAction(state, { type: "END_TURN" });
      if (r.error) break;
      events.push(...r.events);
      state = r.state;
      const bot = await botPlay(m, state);
      events.push(...bot.events);
      state = bot.state;
      changed = true;
      deadline = Date.now() + TURN_MS;
    }
    if (!changed) return;
    if (await persist(m, state, events)) return;
    const fresh = await getMatch(m.id);
    if (!fresh) return;
    Object.assign(m, fresh);
  }
}

export function playerIndexIn(m: MatchRow, playerId: number): 0 | 1 | -1 {
  if (m.p0 === playerId) return 0;
  if (m.p1 === playerId) return 1;
  return -1;
}

export async function applyPlayerAction(
  m: MatchRow, playerId: number, action: Parameters<typeof applyAction>[1],
): Promise<{ ok: boolean; error?: string }> {
  await enforceDeadlines(m);
  for (let attempt = 0; attempt < 2; attempt++) {
    const fresh = await getMatch(m.id);
    if (!fresh) return { ok: false, error: "Match not found" };
    Object.assign(m, fresh);
    if (m.status !== "active") return { ok: false, error: "Match is over" };
    const idx = playerIndexIn(m, playerId);
    if (idx === -1) return { ok: false, error: "Not your match" };
    let state = structuredClone(m.state);
    if (state.active !== idx) return { ok: false, error: "Not your turn" };
    const r = applyAction(state, action);
    if (r.error) return { ok: false, error: r.error };
    const events = [...r.events];
    state = r.state;
    const bot = await botPlay(m, state);
    events.push(...bot.events);
    state = bot.state;
    if (await persist(m, state, events)) return { ok: true };
  }
  return { ok: false, error: "Match updated concurrently — try again" };
}

export async function resign(m: MatchRow, playerId: number): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (m.status !== "active") return;
    const idx = playerIndexIn(m, playerId);
    if (idx === -1) return;
    const state = structuredClone(m.state);
    state.winner = (1 - idx) as 0 | 1;
    if (await persist(m, state, [{ type: "GAME_OVER", winner: state.winner }])) return;
    const fresh = await getMatch(m.id);
    if (!fresh) return;
    Object.assign(m, fresh);
  }
}

/** Force-finish a match with `byPlayerId` as the loser: no rewards, rating untouched. */
export async function abandonMatch(matchId: string, byPlayerId: number | string): Promise<void> {
  const pid = Number(byPlayerId);
  for (let attempt = 0; attempt < 2; attempt++) {
    const m = await getMatch(matchId);
    if (!m || m.status !== "active") return;
    const idx = playerIndexIn(m, pid);
    if (idx === -1) return;
    const state = structuredClone(m.state);
    state.winner = (1 - idx) as 0 | 1;
    if (await persist(m, state, [{ type: "GAME_OVER", winner: state.winner }], { skipFinish: true })) return;
  }
}

/**
 * Score a finished campaign node for P0: stars → node reward → (maybe) chapter milestone.
 * Mutates `rw` with everything the end-of-match panel needs and pays the player out.
 */
async function scoreCampaignNode(
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

  const progress = await campaignProgressCol();
  // Best-ever stars: insert on first clear, raise only when this run beat the record.
  const prev = await progress.findOne({ playerId: pid, nodeId }, { projection: { stars: 1 } });
  const firstClear = !prev;
  const best = Math.max(1, stars);
  if (firstClear) {
    await progress.updateOne(
      { playerId: pid, nodeId },
      { $set: { stars: best }, $setOnInsert: { clearedAt: Date.now() } },
      { upsert: true },
    );
  } else if (best > (prev.stars ?? 0)) {
    await progress.updateOne({ playerId: pid, nodeId }, { $set: { stars: best } });
  }
  rw.firstClear = firstClear;
  rw.bestStars = Math.max(best, prev?.stars ?? 0);

  const nodeReward = rewardFor(nodeId, stars, firstClear);
  let bonus: NodeReward | null = null;

  // Chapter milestone: every node of the chapter cleared, and never paid out before.
  const held = await campaignStars(pid);
  if (isChapterComplete(chapter, held)) {
    const chapterRewards = await campaignChapterRewardsCol();
    const claimed = await chapterRewards.findOne({ playerId: pid, chapter }, { projection: { _id: 1 } });
    if (!claimed) {
      const chapterStars = chapterProgress(held).find((c) => c.chapter === chapter)?.stars ?? 0;
      const milestone = chapterCompletionReward(chapter, chapterStars);
      if (!isEmptyReward(milestone)) {
        // Upsert == INSERT OR IGNORE: the unique {playerId, chapter} index makes it idempotent.
        await chapterRewards.updateOne(
          { playerId: pid, chapter },
          { $setOnInsert: { stars: chapterStars, grantedAt: Date.now() } },
          { upsert: true },
        );
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
  await applyReward(pid, nodeReward);
  if (bonus) await applyReward(pid, bonus);

  const total = bonus ? mergeRewards(nodeReward, bonus) : nodeReward;
  rw.gold += total.gold;
  rw.shards += total.shards;
  rw.packs = total.packs;
  if (nodeReward.card) rw.card = nodeReward.card;
  // Legacy field the current end panel reads.
  if (total.packs.length > 0) rw.pack = total.packs[0].size;
}

async function handleFinish(m: MatchRow, state: GameState) {
  // The payouts below are not atomic: claim the once-flag first so a crash mid-way
  // stays retryable (stateView re-invokes) while concurrent callers can never double-pay.
  // `rewardsSettled` deliberately stays out of MatchDoc — it is settlement plumbing.
  const claim = await (await matchesCol()).findOneAndUpdate(
    { _id: m.id, status: "finished", rewardsSettled: { $ne: true } } as Filter<MatchDoc>,
    { $set: { rewardsSettled: true } },
  );
  if (!claim) return;
  const rewards: Record<number, FinishRewards> = {};
  for (const idx of [0, 1] as const) {
    const pid = idx === 0 ? m.p0 : m.p1;
    const player = await getPlayerById(pid);
    if (!player) continue;
    const won = state.winner === idx;
    const rw: FinishRewards = { won, gold: 0, xp: 0, levelUps: 0, shards: 0, packs: [] };
    if (!player.isBot && m.kind !== "friendly") {
      rw.gold = won ? 40 : 15;
      rw.xp = won ? 60 : 25;
      const res = await addXpGold(pid, rw.gold, rw.xp, won);
      rw.levelUps = res.levelUps;
    }
    if (m.kind === "campaign" && idx === 0 && m.campaignNode) {
      await scoreCampaignNode(m, state, pid, m.campaignNode, won, rw);
    }
    rewards[idx] = rw;
  }
  if (m.kind === "ranked") {
    const delta = await applyElo(m.p0, m.p1, state.winner === 0);
    const p0 = (await getPlayerById(m.p0))!;
    const p1 = (await getPlayerById(m.p1))!;
    rewards[0] = { ...rewards[0], ratingDelta: delta, rating: p0.rating, league: p0.league };
    rewards[1] = { ...rewards[1], ratingDelta: -delta, rating: p1.rating, league: p1.league };
  }
  await (await matchesCol()).updateOne({ _id: m.id }, { $set: { rewards } });
  m.rewards = rewards;
}

/** Client view: hide opponent hand ids and both deck contents; collect events since `since`. */
export async function stateView(m: MatchRow, playerId: number, since: number) {
  await enforceDeadlines(m);
  const fresh = (await getMatch(m.id))!;
  // A crash between the finish CAS and settlement strands a finished match without
  // rewards; re-invoke settlement (its once-flag makes this a no-op when already done
  // or when the match was abandoned).
  if (fresh.status === "finished" && !fresh.rewards) await handleFinish(fresh, fresh.state);
  const idx = playerIndexIn(fresh, playerId);
  const view = structuredClone(fresh.state);
  const foe = idx === 0 ? 1 : 0;
  view.players[foe].hand = view.players[foe].hand.map(() => "hidden");
  view.players[0].deck = view.players[0].deck.map(() => "hidden");
  view.players[1].deck = view.players[1].deck.map(() => "hidden");
  // `$lte: fresh.seq` keeps orphan rows from dead writers (seq ahead of the match doc)
  // out of the client's event stream.
  const rows = await (await matchEventsCol())
    .find(
      { matchId: fresh.id, seq: { $gt: since, $lte: fresh.seq } },
      { projection: { events: 1, seq: 1 }, sort: { seq: 1 } },
    )
    .toArray();
  const events: GameEvent[] = rows.flatMap((r) => r.events ?? [])
    .map((e) => (e.type === "DRAW" && e.player === foe ? { ...e, cardId: undefined } : e));
  const rewards = fresh.rewards ? fresh.rewards[idx] : undefined;
  const opp = await getPlayerById(idx === 0 ? fresh.p1 : fresh.p0);
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
    // Opponents are presented identically whether human or AI-driven.
    opponent: opp ? { name: opp.name, rating: opp.rating, league: opp.league } : null,
  };
}

export async function activeMatchesFor(playerId: number): Promise<{ id: string; kind: string }[]> {
  const rows = await (await matchesCol())
    .find(
      { status: "active", $or: [{ p0: playerId }, { p1: playerId }] },
      { projection: { kind: 1 }, sort: { updatedAt: -1 } },
    )
    .toArray();
  return rows.map((r) => ({ id: r._id, kind: r.kind }));
}
