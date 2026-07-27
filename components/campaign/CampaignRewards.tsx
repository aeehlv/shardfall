"use client";

/**
 * Shardfall — CAMPAIGN REWARD SCREEN.
 *
 * Celebratory overlay shown when a campaign match ends. Three acts:
 *   1. the node's three stars pop in one by one (earned = gold burst, unearned = dim),
 *   2. the payout rows count up (gold, shards, packs, signature card),
 *   3. if the run also finished the chapter, a "Chapter N Complete" plate with its bonus.
 *
 * Every field is optional/defensive: the server payload only has to carry `stars`
 * for this screen to render something sensible. Pure client component, SSR-safe
 * (all animation happens in effects).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { CARD_POOL } from "@/lib/game/pool";
import { chapterName as campaignChapterName } from "@/lib/game/campaign";
import { objectivesFor, STARS_PER_NODE } from "@/lib/game/campaign-rewards";
import "./campaign-rewards.css";

/* ---------------------------------------------------------------- types --- */

export interface CampaignStarDetail {
  /** objective text, e.g. "Win by turn 9." */
  label: string;
  /** the server sends `achieved`; `earned` is accepted as an alias */
  achieved?: boolean;
  earned?: boolean;
  kind?: string;
}

export interface PackGrant {
  size: string;
  count: number;
}

/** Packs arrive as a list, a map or a bare list of sizes — all three are accepted. */
export type PacksInput = PackGrant[] | Record<string, number> | string[] | null | undefined;

export interface ChapterBonusInfo {
  chapter?: number;
  name?: string;
  stars?: number;
  maxStars?: number;
  gold?: number;
  shards?: number;
  packs?: PacksInput;
  card?: string;
}

export interface CampaignRewardsProps {
  won: boolean;
  /** campaign node id, e.g. "ch2-n4" — used to recover objective labels if none were sent */
  nodeId?: string;
  nodeName?: string;
  chapter?: number;
  chapterName?: string;
  /** stars earned this run, 0-3 */
  stars: number;
  /** best stars ever held on the node — shown when this run did not match the record */
  bestStars?: number;
  starDetails?: CampaignStarDetail[];
  gold?: number;
  shards?: number;
  xp?: number;
  levelUps?: number;
  packs?: PacksInput;
  /** card id granted by the node (boss signature card) */
  card?: string;
  firstClear?: boolean;
  /** `true`, or the bonus itself, when this clear also completed the chapter */
  chapterComplete?: boolean | ChapterBonusInfo | null;
  onContinue: () => void;
  onMenu: () => void;
}

/* ------------------------------------------------------------- constants --- */

const ROMAN = ["", "I", "II", "III", "IV", "V"];
const PACK_ORDER = ["small", "standard", "grand"];
const PACK_NAME: Record<string, string> = {
  small: "Small Pack",
  standard: "Standard Pack",
  grand: "Grand Pack",
};
/** ms between beats: star1, star2, star3, rewards, chapter act, actions. */
const TIMELINE = [340, 430, 430, 480, 620, 380];
const LAST_STEP = TIMELINE.length;

/* --------------------------------------------------------------- helpers --- */

function normalizePacks(input: PacksInput): PackGrant[] {
  if (!input) return [];
  const totals = new Map<string, number>();
  const add = (size: unknown, count: unknown) => {
    if (typeof size !== "string") return;
    const n = Math.trunc(Number(count) || 0);
    if (n > 0) totals.set(size, (totals.get(size) ?? 0) + n);
  };
  if (Array.isArray(input)) {
    for (const p of input) {
      if (typeof p === "string") add(p, 1);
      else if (p && typeof p === "object") add(p.size, p.count);
    }
  } else if (typeof input === "object") {
    for (const [size, count] of Object.entries(input)) add(size, count);
  }
  return [...totals.entries()]
    .map(([size, count]) => ({ size, count }))
    .sort((a, b) => PACK_ORDER.indexOf(a.size) - PACK_ORDER.indexOf(b.size));
}

const packArt = (size: string) =>
  PACK_ORDER.includes(size) ? `/store/pack-${size}.png` : "/store/pack-small.png";

function cardById(id?: string) {
  if (!id) return undefined;
  return CARD_POOL.find((c) => c.id === id);
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Ease-out count-up; renders 0 until `active`. */
function useCountUp(target: number, active: boolean, duration = 850): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!active || target <= 0) return;
    const reduce = prefersReducedMotion();
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      if (reduce) {
        setValue(target);
        return;
      }
      const p = Math.min(1, (t - t0) / duration);
      setValue(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, active, duration]);
  if (!active) return 0;
  return target <= 0 ? target : value;
}

/* ------------------------------------------------------------- sub-parts --- */

interface RewardRowProps {
  icon: string;
  iconClass?: string;
  label: string;
  amount?: number;
  text?: string;
  active: boolean;
  index: number;
  testId?: string;
}

function RewardRow({ icon, iconClass, label, amount, text, active, index, testId }: RewardRowProps) {
  const shown = useCountUp(amount ?? 0, active);
  /* eslint-disable-next-line @next/next/no-img-element */
  const art = <img className={`crRewardIcon${iconClass ? ` ${iconClass}` : ""}`} src={icon} alt="" />;
  return (
    <div
      className={`crRewardRow${active ? " in" : ""}`}
      style={{ "--i": index } as CSSProperties}
      data-testid={testId}
    >
      {art}
      <span className="crRewardLabel">{label}</span>
      <span className="crRewardValue">{amount !== undefined ? `+${shown}` : text}</span>
    </div>
  );
}

/* ------------------------------------------------------------ component --- */

export default function CampaignRewards({
  won,
  nodeId,
  nodeName,
  chapter,
  chapterName,
  stars,
  bestStars,
  starDetails,
  gold = 0,
  shards = 0,
  xp = 0,
  levelUps = 0,
  packs,
  card,
  firstClear = false,
  chapterComplete = null,
  onContinue,
  onMenu,
}: CampaignRewardsProps) {
  const [step, setStep] = useState(0);
  const skip = useCallback(() => setStep(LAST_STEP), []);

  useEffect(() => {
    if (prefersReducedMotion()) {
      const t = setTimeout(() => setStep(LAST_STEP), 0);
      return () => clearTimeout(t);
    }
    const timers: ReturnType<typeof setTimeout>[] = [];
    let acc = 0;
    TIMELINE.forEach((delay, i) => {
      acc += delay;
      timers.push(setTimeout(() => setStep((s) => (s > i + 1 ? s : i + 1)), acc));
    });
    return () => timers.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === " " || e.key === "Enter") skip();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [skip]);

  const earned = Math.max(0, Math.min(STARS_PER_NODE, Math.trunc(stars) || 0));

  /* three objective labels: from the payload, else recovered from the node id */
  const objectives = useMemo<{ label: string; earned: boolean }[]>(() => {
    const fallback: { label: string; earned: boolean }[] = nodeId
      ? objectivesFor(nodeId).map((o, i) => ({ label: o.label, earned: i < earned }))
      : [
          { label: "Win the battle.", earned: earned >= 1 },
          { label: "Complete the node challenge.", earned: earned >= 2 },
          { label: "Complete the mastery challenge.", earned: earned >= 3 },
        ];
    const list = starDetails && starDetails.length
      ? starDetails.map((d) => ({ label: d.label, earned: d.earned ?? d.achieved ?? false }))
      : fallback;
    return Array.from({ length: STARS_PER_NODE }, (_, i) => list[i] ?? fallback[i]);
  }, [nodeId, starDetails, earned]);

  const packList = useMemo(() => normalizePacks(packs), [packs]);
  const cardDef = cardById(card);

  const chapterNum = chapter ?? (nodeId ? Number(/^ch(\d+)/.exec(nodeId)?.[1]) || undefined : undefined);
  const chName =
    chapterName ?? (chapterNum ? campaignChapterName(chapterNum) || undefined : undefined);

  /* chapter act — `true` still renders the plate, just without a bonus breakdown */
  const bonus: ChapterBonusInfo | null =
    chapterComplete && typeof chapterComplete === "object"
      ? chapterComplete
      : chapterComplete === true
        ? {}
        : null;
  const bonusPacks = useMemo(() => normalizePacks(bonus?.packs), [bonus?.packs]);
  const bonusCard = cardById(bonus?.card);
  const bonusChapter = bonus?.chapter ?? chapterNum;

  const rewardsIn = step >= 4;
  const chapterIn = step >= 5;
  const actionsIn = step >= 6;

  const rows: RewardRowProps[] = [];
  if (gold > 0) {
    rows.push({ icon: "/ui/gold.png", label: "Gold", amount: gold, active: rewardsIn, index: rows.length, testId: "reward-gold" });
  }
  if (shards > 0) {
    rows.push({ icon: "/ui/shard.png", label: "Aethershards", amount: shards, active: rewardsIn, index: rows.length, testId: "reward-shards" });
  }
  for (const p of packList) {
    rows.push({
      icon: packArt(p.size),
      iconClass: "packIcon",
      label: PACK_NAME[p.size] ?? `${p.size} pack`,
      amount: p.count,
      active: rewardsIn,
      index: rows.length,
      testId: `reward-pack-${p.size}`,
    });
  }
  if (xp > 0) {
    rows.push({ icon: "/ui/emblem.png", label: "Experience", amount: xp, active: rewardsIn, index: rows.length, testId: "reward-xp" });
  }

  /* eslint-disable @next/next/no-img-element */
  return (
    <div
      className="crWrap"
      data-testid="campaign-rewards"
      role="dialog"
      aria-modal="true"
      aria-label={won ? "Node cleared" : "Defeat"}
      onClick={skip}
    >
      <div className="crVeil" aria-hidden="true" />
      {won && <div className="crRays" aria-hidden="true" />}

      <div className="crPanel" onClick={(e) => e.stopPropagation()}>
        <header className="crHead">
          {(chName || chapterNum) && (
            <span className="crChapter">
              {chapterNum ? `Chapter ${ROMAN[chapterNum] ?? chapterNum}` : "Campaign"}
              {chName ? ` · ${chName}` : ""}
            </span>
          )}
          <h1 className={`crTitle${won ? "" : " lost"}`}>{nodeName ?? "Campaign Battle"}</h1>
          <p className="crVerdict" data-testid="campaign-verdict">
            {won ? (firstClear ? "Node Cleared — First Clear" : "Node Cleared") : "The road stays shut"}
          </p>
          <div className="crRule" aria-hidden="true"><i /><span>◆</span><i /></div>
        </header>

        {bestStars !== undefined && bestStars > earned && (
          <p className="crBest">
            Best on this node: <b>{"★".repeat(bestStars)}</b>
          </p>
        )}

        {/* ---- act one: the three stars ---- */}
        <div className="crStars" data-testid="campaign-stars" data-stars={earned}>
          {objectives.map((o, i) => {
            const on = o.earned && step >= i + 1;
            const revealed = step >= i + 1;
            return (
              <div
                className={`crStar${revealed ? " in" : ""}${on ? " earned" : ""}`}
                key={i}
                style={{ "--i": i } as CSSProperties}
                data-testid={`campaign-star-${i + 1}`}
                data-earned={o.earned ? "1" : "0"}
              >
                <span className="crStarSlot" aria-hidden="true">
                  <span className="crStarGlyph">★</span>
                  <span className="crStarBurst" />
                  <span className="crStarRing" />
                </span>
                <span className="crStarLabel">{o.label}</span>
              </div>
            );
          })}
        </div>

        {/* ---- act two: the payout ---- */}
        {(rows.length > 0 || cardDef) && (
          <section className={`crRewards${rewardsIn ? " in" : ""}`} data-testid="campaign-reward-rows">
            <span className="crSectionTag">{firstClear ? "First clear reward" : "Reward"}</span>
            {rows.map((r) => (
              <RewardRow key={`${r.label}-${r.index}`} {...r} />
            ))}
            {cardDef && (
              <div
                className={`crRewardRow crCardRow${rewardsIn ? " in" : ""}`}
                style={{ "--i": rows.length } as CSSProperties}
                data-testid="reward-card"
              >
                <img className="crRewardIcon cardIcon" src={cardDef.art ?? "/ui/emblem.png"} alt="" />
                <span className="crRewardLabel">Signature card</span>
                <span className="crRewardValue crCardName">{cardDef.name}</span>
              </div>
            )}
            {levelUps > 0 && (
              <p className="crLevelUp">Level up! +{levelUps} pack{levelUps > 1 ? "s" : ""}</p>
            )}
          </section>
        )}

        {rows.length === 0 && !cardDef && (
          <p className={`crNothing${rewardsIn ? " in" : ""}`}>
            {won ? "No new spoils this run — the node has already given what it had." : "No spoils. Regroup and march again."}
          </p>
        )}

        {/* ---- act three: chapter complete ---- */}
        {bonus && (
          <section
            className={`crChapterAct${chapterIn ? " in" : ""}`}
            data-testid="campaign-chapter-complete"
          >
            <div className="crChapterCrest" aria-hidden="true">
              <img src="/ui/emblem.png" alt="" />
            </div>
            <h2 className="crChapterTitle">
              Chapter {bonusChapter ? (ROMAN[bonusChapter] ?? bonusChapter) : ""} Complete
            </h2>
            {(bonus.name ?? (bonusChapter ? campaignChapterName(bonusChapter) : "")) && (
              <p className="crChapterName">
                {bonus.name ?? (bonusChapter ? campaignChapterName(bonusChapter) : "")}
              </p>
            )}
            {bonus.stars !== undefined && (
              <p className="crChapterStars">
                <span className="crStarMini">★</span>
                {bonus.stars} / {bonus.maxStars ?? 18} chapter stars
              </p>
            )}
            <div className="crChapterRows">
              {(bonus.gold ?? 0) > 0 && (
                <span className="crChip"><img src="/ui/gold.png" alt="gold" />+{bonus.gold}</span>
              )}
              {(bonus.shards ?? 0) > 0 && (
                <span className="crChip"><img src="/ui/shard.png" alt="shards" />+{bonus.shards}</span>
              )}
              {bonusPacks.map((p) => (
                <span className="crChip" key={p.size}>
                  <img className="packIcon" src={packArt(p.size)} alt="" />
                  ×{p.count} {PACK_NAME[p.size] ?? p.size}
                </span>
              ))}
              {bonusCard && (
                <span className="crChip">
                  <img className="cardIcon" src={bonusCard.art ?? "/ui/emblem.png"} alt="" />
                  {bonusCard.name}
                </span>
              )}
            </div>
          </section>
        )}

        <div className={`crActions${actionsIn ? " in" : ""}`}>
          <button type="button" className="crBtn" data-testid="campaign-continue" onClick={onContinue}>
            Continue
          </button>
          <button type="button" className="crBtnDark" data-testid="campaign-menu" onClick={onMenu}>
            Main Menu
          </button>
        </div>
      </div>
    </div>
  );
  /* eslint-enable @next/next/no-img-element */
}
