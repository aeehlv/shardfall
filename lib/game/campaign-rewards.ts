/**
 * Campaign progression: star objectives, per-node rewards and chapter milestones.
 *
 * Pure module — no React, no IO, no randomness, no `Date`. Every function is a
 * deterministic function of its arguments (and of the static CAMPAIGN table), so
 * the server can score a finished match and the client can render the same
 * objectives/rewards preview without ever disagreeing.
 *
 * Shape of the progression:
 *   • Every node awards 1-3 stars per clear (★1 win, ★2 node challenge, ★3 harder variant).
 *   • Star 3 always implies star 2 (same challenge kind, tighter threshold), so stars are cumulative.
 *   • First clear pays the headline reward; extra stars add gold/shards; replays pay a trickle.
 *   • Clearing all 6 nodes of a chapter pays a milestone bonus scaled by stars earned (of 18).
 */

import { CAMPAIGN, nodeById } from "./campaign";

// ---------------------------------------------------------------------------
// Shape constants
// ---------------------------------------------------------------------------

export const CHAPTER_COUNT = 5;
export const NODES_PER_CHAPTER = 6;
/** Nodes with this index are chapter bosses. */
export const BOSS_INDEX = 6;
export const STARS_PER_NODE = 3;
/** 6 nodes × 3 stars. */
export const STARS_PER_CHAPTER = NODES_PER_CHAPTER * STARS_PER_NODE;

/** Stars (out of 18) needed in a chapter for the tiered completion bonuses. */
export const VETERAN_STARS = 12; // +1 chapter-tier pack
export const MASTERY_STARS = 15; // + signature card
export const PERFECT_STARS = STARS_PER_CHAPTER; // +1 grand pack

export type PackSize = "small" | "standard" | "grand";

const PACK_TIERS: PackSize[] = ["small", "standard", "grand"];

// ---------------------------------------------------------------------------
// Star objectives
// ---------------------------------------------------------------------------

/** Everything the scorer needs from a finished campaign match, from P0's point of view. */
export interface MatchSummary {
  /** Did the campaign player win? Every objective requires this. */
  won: boolean;
  /** Campaign player's hero HP at the final state (0-30). */
  heroHp: number;
  /** Turns the campaign player took (`players[0].turnsTaken`). */
  turns: number;
  /** Friendly units still on the board at the final state (0-7). */
  unitsAlive: number;
  /** Friendly units that died during the match. */
  unitsLost: number;
  /** Spells the campaign player played from hand. */
  spellsPlayed: number;
}

export interface StarObjective {
  kind: string;
  label: string;
  test: (s: MatchSummary) => boolean;
}

/** The five challenge flavours ★2/★3 rotate through (★1 is always the plain win). */
export type StarObjectiveKind = "win" | "hp" | "speed" | "board" | "attrition" | "spells";

/** Rotation order for the node-specific stars. 5 kinds over 6 nodes ⇒ each chapter starts one later. */
export const STAR_OBJECTIVE_KINDS: StarObjectiveKind[] = ["hp", "speed", "board", "attrition", "spells"];

interface KindTuning {
  /** +1 when a *larger* threshold is harder (hp/board/spells); -1 when a *smaller* one is (speed/attrition). */
  dir: 1 | -1;
  /** [★2, ★3] threshold per chapter, index 0 = chapter 1. Lenient in ch1 → strict in ch5. */
  base: [number, number][];
  /** How far one node-difficulty step shifts the threshold. */
  step: number;
  min: number;
  max: number;
  label: (n: number) => string;
  test: (n: number) => (s: MatchSummary) => boolean;
}

const KIND_TUNING: Record<Exclude<StarObjectiveKind, "win">, KindTuning> = {
  // "Win with N or more hero HP remaining" — hero cap is 30.
  hp: {
    dir: 1,
    base: [[15, 24], [17, 25], [19, 26], [21, 27], [23, 28]],
    step: 2,
    min: 5,
    max: 29,
    label: (n) => `Win with ${n} or more hero HP remaining.`,
    test: (n) => (s) => s.won && s.heroHp >= n,
  },
  // "Win by turn N" — counts the campaign player's own turns.
  speed: {
    dir: -1,
    base: [[12, 9], [11, 8], [10, 8], [10, 7], [9, 7]],
    step: 1,
    min: 4,
    max: 20,
    label: (n) => `Win by turn ${n}.`,
    test: (n) => (s) => s.won && s.turns <= n,
  },
  // "Win with N or more units alive" — board cap is 7.
  board: {
    dir: 1,
    base: [[2, 4], [3, 4], [3, 5], [4, 5], [4, 6]],
    step: 1,
    min: 1,
    max: 7,
    label: (n) => `Win with ${n} or more ${n === 1 ? "unit" : "units"} still alive.`,
    test: (n) => (s) => s.won && s.unitsAlive >= n,
  },
  // "Win without losing more than N units".
  attrition: {
    dir: -1,
    base: [[6, 3], [5, 3], [5, 2], [4, 2], [3, 1]],
    step: 1,
    min: 0,
    max: 12,
    label: (n) =>
      n === 0
        ? "Win without losing a single unit."
        : `Win without losing more than ${n} ${n === 1 ? "unit" : "units"}.`,
    test: (n) => (s) => s.won && s.unitsLost <= n,
  },
  // "Win having played N or more spells".
  spells: {
    dir: 1,
    base: [[2, 4], [3, 5], [3, 5], [4, 6], [4, 7]],
    step: 1,
    min: 1,
    max: 10,
    label: (n) => `Win having played ${n} or more ${n === 1 ? "spell" : "spells"}.`,
    test: (n) => (s) => s.won && s.spellsPlayed >= n,
  },
};

/**
 * Difficulty nudge per node index inside a chapter: the opening nodes ease off,
 * node 5 tightens, and the boss (index 6) sits back at baseline because the
 * enemy already carries the chapter HP/aether bonus.
 */
const NODE_STEP = [-1, -1, 0, 0, 1, 0];

const WIN_OBJECTIVE: StarObjective = {
  kind: "win",
  label: "Win the battle.",
  test: (s) => s.won,
};

function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}

function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface NodeSlot {
  chapter: number;
  index: number;
  /** Position in the full campaign order, 0-based — drives the objective rotation. */
  order: number;
  boss: boolean;
}

/**
 * Resolve a node id to its chapter/index slot. Known ids come from CAMPAIGN;
 * `chN-nM` ids resolve by pattern; anything else falls back to a stable hash so
 * the module never throws on unknown input.
 */
export function nodeSlot(nodeId: string): NodeSlot {
  const node = nodeById(nodeId);
  if (node) return slot(node.chapter, node.index);
  const m = /^ch(\d+)-n(\d+)$/.exec(nodeId);
  if (m) return slot(Number(m[1]), Number(m[2]));
  const h = hash32(nodeId);
  return slot((h % CHAPTER_COUNT) + 1, ((h >>> 8) % NODES_PER_CHAPTER) + 1);
}

function slot(rawChapter: number, rawIndex: number): NodeSlot {
  const chapter = clamp(Math.trunc(rawChapter) || 1, 1, CHAPTER_COUNT);
  const index = clamp(Math.trunc(rawIndex) || 1, 1, NODES_PER_CHAPTER);
  return {
    chapter,
    index,
    order: (chapter - 1) * NODES_PER_CHAPTER + (index - 1),
    boss: index === BOSS_INDEX,
  };
}

/** Which challenge kind a node's ★2/★3 use. Deterministic; rotates across chapters. */
export function objectiveKindFor(nodeId: string): Exclude<StarObjectiveKind, "win"> {
  const { order } = nodeSlot(nodeId);
  return STAR_OBJECTIVE_KINDS[order % STAR_OBJECTIVE_KINDS.length] as Exclude<StarObjectiveKind, "win">;
}

/** The [★2, ★3] thresholds for a node, already clamped and guaranteed to differ. */
export function thresholdsFor(nodeId: string): [number, number] {
  const { chapter, index } = nodeSlot(nodeId);
  const kind = objectiveKindFor(nodeId);
  const t = KIND_TUNING[kind];
  const [b2, b3] = t.base[chapter - 1];
  const shift = t.dir * t.step * NODE_STEP[index - 1];
  let v2 = clamp(b2 + shift, t.min, t.max);
  let v3 = clamp(b3 + shift, t.min, t.max);
  // Keep ★3 strictly harder than ★2 even when clamping collapsed them together.
  if (t.dir === 1) {
    v3 = Math.max(v3, v2 + 1);
    if (v3 > t.max) {
      v3 = t.max;
      v2 = Math.max(t.min, v3 - 1);
    }
  } else {
    v3 = Math.min(v3, v2 - 1);
    if (v3 < t.min) {
      v3 = t.min;
      v2 = Math.min(t.max, v3 + 1);
    }
  }
  return [v2, v3];
}

/**
 * The three objectives for a node: ★1 win, ★2 the node's challenge, ★3 the same
 * challenge at a tighter threshold (so ★3 always implies ★2).
 */
export function objectivesFor(nodeId: string): [StarObjective, StarObjective, StarObjective] {
  const kind = objectiveKindFor(nodeId);
  const t = KIND_TUNING[kind];
  const [v2, v3] = thresholdsFor(nodeId);
  return [
    WIN_OBJECTIVE,
    { kind, label: t.label(v2), test: t.test(v2) },
    { kind, label: t.label(v3), test: t.test(v3) },
  ];
}

/** Stars a match summary earns on a node: 0 on a loss, else 1-3. */
export function starsEarned(nodeId: string, summary: MatchSummary): 0 | 1 | 2 | 3 {
  if (!summary.won) return 0;
  let stars = 0;
  for (const o of objectivesFor(nodeId)) if (o.test(summary)) stars++;
  return clamp(stars, 0, STARS_PER_NODE) as 0 | 1 | 2 | 3;
}

// ---------------------------------------------------------------------------
// Rewards
// ---------------------------------------------------------------------------

export interface NodeReward {
  gold: number;
  shards: number;
  packs: { size: PackSize; count: number }[];
  card?: string;
}

/** Headline first-clear payout for node 1 of each chapter; later nodes scale up from here. */
const CHAPTER_FIRST_CLEAR: { gold: number; shards: number; pack: PackSize }[] = [
  { gold: 60, shards: 0, pack: "small" },
  { gold: 85, shards: 1, pack: "standard" },
  { gold: 115, shards: 2, pack: "standard" },
  { gold: 155, shards: 3, pack: "grand" },
  { gold: 200, shards: 5, pack: "grand" },
];

/** Gold trickle for repeat clears, by chapter. */
const REPLAY_GOLD = [18, 24, 30, 38, 48];

/** Shards granted by the third star, by chapter. */
const STAR3_SHARDS = [3, 4, 5, 6, 8];

/** ★2 bonus: +40% gold (carried through ★3). */
const STAR2_GOLD_MULT = 1.4;

/** Replay gold nudge for a well-played repeat run, by stars (index = stars). */
const REPLAY_STAR_MULT = [0, 1, 1.25, 1.5];

/** Boss first clears also hand over a signature card from the chapter's antagonist. */
const BOSS_CARD: string[] = [
  "verdant-003", // Oremma, the Undersown        — Warden of the Vale
  "pyre-003", //    Varkha Cindral, First Hammer — The First Hammer's Shadow
  "abyss-003", //   Maelvyra, the First Voice    — Echo of the First Voice
  "verdant-031", // Fenlow, the Herdfather       — Heartwood Gate
  "pyre-032", //    Firstborn of the Final Pour  — Heart of the Shattering
];

/** Chapter-completion prize for players at or above MASTERY_STARS. */
const CHAPTER_MASTERY_CARD: string[] = [
  "neutral-009", // Vantherrow, the Standing Ruin
  "pyre-031", //    Ostrekka Vhal, Cast Eternal
  "abyss-031", //   Onnavel, Keeper of the Score
  "verdant-032", // Vellathorn, the Marching Forest
  "neutral-029", // Aulmirah, Echo of the Undersun
];

const CHAPTER_COMPLETION: { gold: number; shards: number; packs: { size: PackSize; count: number }[] }[] = [
  { gold: 250, shards: 5, packs: [{ size: "standard", count: 1 }] },
  { gold: 350, shards: 8, packs: [{ size: "standard", count: 2 }] },
  { gold: 475, shards: 12, packs: [{ size: "grand", count: 1 }] },
  { gold: 625, shards: 16, packs: [{ size: "standard", count: 1 }, { size: "grand", count: 1 }] },
  { gold: 800, shards: 25, packs: [{ size: "grand", count: 3 }] },
];

const round5 = (n: number) => Math.max(0, Math.round(n / 5) * 5);

const bumpPack = (size: PackSize): PackSize =>
  PACK_TIERS[Math.min(PACK_TIERS.indexOf(size) + 1, PACK_TIERS.length - 1)];

/** Merge duplicate sizes, drop empties, order small → standard → grand. */
function normalizePacks(packs: { size: PackSize; count: number }[]): { size: PackSize; count: number }[] {
  const totals = new Map<PackSize, number>();
  for (const p of packs) {
    const count = Math.max(0, Math.trunc(p.count));
    if (count > 0) totals.set(p.size, (totals.get(p.size) ?? 0) + count);
  }
  return PACK_TIERS.filter((s) => totals.has(s)).map((s) => ({ size: s, count: totals.get(s)! }));
}

const EMPTY_REWARD = (): NodeReward => ({ gold: 0, shards: 0, packs: [] });

/**
 * Payout for finishing a campaign node.
 *
 * @param stars      stars earned this run (0 = lost, pays nothing)
 * @param firstClear true only the very first time the node is cleared
 *
 * First clear pays the chapter headline (ch1 ≈ 60g + small pack … ch5 ≈ 200g + grand pack + 5 shards),
 * scaled up slightly by node index and roughly doubled on the boss (index 6, which always packs).
 * ★2 adds +40% gold, ★3 adds shards on top. Replays pay a chapter-scaled gold trickle and no packs.
 */
export function rewardFor(nodeId: string, stars: number, firstClear: boolean): NodeReward {
  const s = clamp(Math.trunc(stars) || 0, 0, STARS_PER_NODE);
  if (s < 1) return EMPTY_REWARD(); // lost the battle — nothing at all
  const { chapter, index, boss } = nodeSlot(nodeId);
  const ch = chapter - 1;

  if (!firstClear) {
    const gold = round5(REPLAY_GOLD[ch] * (boss ? 1.5 : 1) * REPLAY_STAR_MULT[s]);
    return { gold, shards: 0, packs: [] };
  }

  const base = CHAPTER_FIRST_CLEAR[ch];
  // Later nodes in a chapter pay a little more; the boss pays roughly double.
  const indexMult = boss ? 2 : 1 + (index - 1) * 0.05;

  let gold = base.gold * indexMult;
  if (s >= 2) gold *= STAR2_GOLD_MULT;

  let shards = boss ? base.shards * 2 + 2 : base.shards;
  if (s >= 3) shards += STAR3_SHARDS[ch];

  const packs = boss
    ? [
        { size: base.pack, count: 1 },
        { size: bumpPack(base.pack), count: 1 },
      ]
    : [{ size: base.pack, count: 1 }];

  const reward: NodeReward = { gold: round5(gold), shards, packs: normalizePacks(packs) };
  if (boss) reward.card = BOSS_CARD[ch];
  return reward;
}

/**
 * Milestone bonus for clearing every node in a chapter, scaled by how many of the
 * chapter's 18 stars are held: half the pot at 6/18, the full pot at 18/18.
 * 12+ stars adds a chapter-tier pack, 15+ adds a signature card, 18/18 adds a grand pack.
 * Returns an empty reward below 6 stars (the chapter cannot actually be complete).
 */
export function chapterCompletionReward(chapter: number, totalStars: number): NodeReward {
  const ch = clamp(Math.trunc(chapter) || 1, 1, CHAPTER_COUNT) - 1;
  const stars = clamp(Math.trunc(totalStars) || 0, 0, STARS_PER_CHAPTER);
  if (stars < NODES_PER_CHAPTER) return EMPTY_REWARD();

  const base = CHAPTER_COMPLETION[ch];
  const mult = 0.5 + 0.5 * (stars / STARS_PER_CHAPTER);
  const packs = base.packs.map((p) => ({ ...p }));
  if (stars >= VETERAN_STARS) packs.push({ size: CHAPTER_FIRST_CLEAR[ch].pack, count: 1 });
  if (stars >= PERFECT_STARS) packs.push({ size: "grand", count: 1 });

  const reward: NodeReward = {
    gold: round5(base.gold * mult),
    shards: Math.round(base.shards * mult),
    packs: normalizePacks(packs),
  };
  if (stars >= MASTERY_STARS) reward.card = CHAPTER_MASTERY_CARD[ch];
  return reward;
}

/** Sum any number of rewards into one grant (packs merged, first card wins). */
export function mergeRewards(...rewards: NodeReward[]): NodeReward {
  const out: NodeReward = EMPTY_REWARD();
  const packs: { size: PackSize; count: number }[] = [];
  for (const r of rewards) {
    out.gold += r.gold;
    out.shards += r.shards;
    packs.push(...r.packs);
    if (!out.card && r.card) out.card = r.card;
  }
  out.packs = normalizePacks(packs);
  return out;
}

/** True when a reward would grant nothing at all — handy for skipping UI/DB writes. */
export function isEmptyReward(r: NodeReward): boolean {
  return r.gold === 0 && r.shards === 0 && r.packs.length === 0 && !r.card;
}

// ---------------------------------------------------------------------------
// Progress summaries
// ---------------------------------------------------------------------------

/** Every star in the campaign: 30 nodes × 3 = 90. */
export function totalStarsPossible(): number {
  return CAMPAIGN.length * STARS_PER_NODE;
}

export interface ChapterProgress {
  chapter: number;
  nodesCleared: number;
  stars: number;
  maxStars: number;
  complete: boolean;
}

/**
 * Roll a `nodeId → stars` map (as stored in `campaign_progress`) up per chapter.
 * A node counts as cleared once it holds at least one star.
 */
export function chapterProgress(cleared: Record<string, number>): ChapterProgress[] {
  const chapters: ChapterProgress[] = [];
  for (let c = 1; c <= CHAPTER_COUNT; c++) {
    const nodes = CAMPAIGN.filter((n) => n.chapter === c);
    let nodesCleared = 0;
    let stars = 0;
    for (const n of nodes) {
      const s = clamp(Math.trunc(cleared[n.id] ?? 0) || 0, 0, STARS_PER_NODE);
      if (s > 0) nodesCleared++;
      stars += s;
    }
    chapters.push({
      chapter: c,
      nodesCleared,
      stars,
      maxStars: nodes.length * STARS_PER_NODE,
      complete: nodes.length > 0 && nodesCleared === nodes.length,
    });
  }
  return chapters;
}

/** Total stars held across the whole campaign. */
export function totalStarsEarned(cleared: Record<string, number>): number {
  return chapterProgress(cleared).reduce((sum, c) => sum + c.stars, 0);
}

/** All six nodes of `chapter` cleared? */
export function isChapterComplete(chapter: number, cleared: Record<string, number>): boolean {
  return chapterProgress(cleared).find((c) => c.chapter === chapter)?.complete ?? false;
}
