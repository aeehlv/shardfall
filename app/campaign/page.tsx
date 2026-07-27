"use client";

/**
 * Shardfall CAMPAIGN — 5 chapters × 6 nodes across Kelvarrow.
 *
 * Built around the star progression in `lib/game/campaign-rewards.ts`: every node
 * carries three objectives (★1 win, ★2 the node challenge, ★3 the same challenge
 * tightened), stars roll up per chapter, and clearing a whole chapter pays a
 * milestone bonus that scales with the stars held. All of that is a pure function
 * of the node id + the player's `nodeId → stars` map, so the page renders the same
 * numbers the server will pay out.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";
import { CARD_POOL } from "@/lib/game/pool";
import type { FactionId, GameCard, Rarity } from "@/lib/game/types";
import { CAMPAIGN, isUnlocked } from "@/lib/game/campaign";
import { CHAPTER_INTRO, NODE_STORY } from "@/lib/game/campaign-story";
import {
  MASTERY_STARS, NODES_PER_CHAPTER, PERFECT_STARS, STARS_PER_CHAPTER, STARS_PER_NODE, VETERAN_STARS,
  chapterCompletionReward, chapterProgress, objectivesFor, rewardFor, totalStarsPossible,
  type NodeReward,
} from "@/lib/game/campaign-rewards";
import FramedCard from "@/components/play/FramedCard";
import StoryCard from "@/components/campaign/StoryCard";
import "@/app/menu.css";
import "@/app/play/play.css";
import "./campaign.css";

type PackSize = "small" | "standard" | "grand";
type DeckFaction = "pyre" | "abyss" | "verdant";

/** What `/api/campaign` sends back per node — everything past `id` is optional. */
interface CampaignNodeDto {
  id: string;
  cleared?: boolean;
  unlocked?: boolean;
  stars?: number;
  objectives?: { kind?: string; label: string; achieved?: boolean }[];
}

/** Chapter roll-up from the same payload (used for the claimed state of the bonus). */
interface CampaignChapterDto {
  chapter: number;
  nodesCleared?: number;
  stars?: number;
  maxStars?: number;
  complete?: boolean;
  name?: string;
  rewardClaimed?: boolean;
}

/** A node as this page renders it: static campaign data + the player's progress. */
interface NodeView {
  id: string;
  chapter: number;
  index: number;
  name: string;
  enemyFaction: FactionId;
  board: string;
  enemyHpBonus: number;
  replayGold: number;
  stars: number;
  cleared: boolean;
  unlocked: boolean;
  /** three objective labels, server-sent when available */
  objectives: { label: string; achieved: boolean }[];
}

interface PlayerDto {
  id: number;
  name: string;
  gold: number;
  shards: number;
  level: number;
  wins: number;
  losses: number;
  packs: Partial<Record<PackSize, number>>;
}

const CHAPTER_NAMES: Record<number, string> = {
  1: "The Glasswake",
  2: "The Cinderreach",
  3: "The Sunken Antiphon",
  4: "The Greatgraft",
  5: "The Heartwound",
};
const ROMAN = ["", "I", "II", "III", "IV", "V"];

const FACTIONS: { id: DeckFaction; name: string; accent: string }[] = [
  { id: "pyre", name: "Pyre Dominion", accent: "#e0562f" },
  { id: "abyss", name: "Abyssal Choir", accent: "#45c4b8" },
  { id: "verdant", name: "Verdant Compact", accent: "#8cc152" },
];
const FACTION_INFO: Record<string, { name: string; accent: string }> = {
  pyre: { name: "Pyre Dominion", accent: "#e0562f" },
  abyss: { name: "Abyssal Choir", accent: "#45c4b8" },
  verdant: { name: "Verdant Compact", accent: "#8cc152" },
  neutral: { name: "Unaligned", accent: "#9c93a8" },
};

const PACK_META: { id: PackSize; name: string; cards: number; art: string }[] = [
  { id: "small", name: "Small Pack", cards: 3, art: "/store/pack-small.png" },
  { id: "standard", name: "Standard Pack", cards: 5, art: "/store/pack-standard.png" },
  { id: "grand", name: "Grand Pack", cards: 10, art: "/store/pack-grand.png" },
];
const PACK_NAME: Record<string, string> = {
  small: "Small Pack", standard: "Standard Pack", grand: "Grand Pack",
};

const RARITY_GLOW: Record<Rarity, string> = {
  common: "#9c93a8", rare: "#4e8ee9", epic: "#a45ae0", legendary: "#e3a44a",
  mythic: "#ff5c8a",
};

const TOTAL_NODES = CAMPAIGN.length;
const TOTAL_STARS = totalStarsPossible();

const cardName = (id?: string) => (id ? CARD_POOL.find((c) => c.id === id)?.name ?? id : "");

type Opening = { packName: string; cards: GameCard[] };

/** Three little stars — the shared readout under medallions and in headers. */
function StarRow({ stars, size = "sm", testId }: { stars: number; size?: "sm" | "md"; testId?: string }) {
  return (
    <span className={`starRow ${size}`} data-testid={testId} aria-label={`${stars} of 3 stars`}>
      {[0, 1, 2].map((i) => (
        <i key={i} className={`starPip${i < stars ? " on" : ""}`} aria-hidden="true">★</i>
      ))}
    </span>
  );
}

/** gold / shard / pack / card chips for any NodeReward. */
function RewardChips({ reward, muted = false }: { reward: NodeReward; muted?: boolean }) {
  /* eslint-disable @next/next/no-img-element */
  return (
    <span className={`rewardChips${muted ? " muted" : ""}`}>
      {reward.gold > 0 && (
        <span className="rwChip"><img src="/ui/gold.png" alt="gold" />{reward.gold}</span>
      )}
      {reward.shards > 0 && (
        <span className="rwChip"><img src="/ui/shard.png" alt="shards" />{reward.shards}</span>
      )}
      {reward.packs.map((p) => (
        <span className="rwChip" key={p.size}>
          <img className="rwPack" src={`/store/pack-${p.size}.png`} alt="" />
          ×{p.count} {PACK_NAME[p.size] ?? p.size}
        </span>
      ))}
      {reward.card && (
        <span className="rwChip card">
          <img src="/ui/emblem.png" alt="" />
          {cardName(reward.card)}
        </span>
      )}
    </span>
  );
  /* eslint-enable @next/next/no-img-element */
}

export default function CampaignPage() {
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [player, setPlayer] = useState<PlayerDto | null>(null);
  const [dto, setDto] = useState<CampaignNodeDto[]>([]);
  const [chapterDto, setChapterDto] = useState<CampaignChapterDto[]>([]);
  const [modalId, setModalId] = useState<string | null>(null);
  const [storyId, setStoryId] = useState<string | null>(null);
  const [introChapter, setIntroChapter] = useState<number | null>(null);
  const [faction, setFaction] = useState<DeckFaction>("pyre");
  const [starting, setStarting] = useState(false);
  const [startErr, setStartErr] = useState<string | null>(null);
  const [openingBusy, setOpeningBusy] = useState(false);
  const [opening, setOpening] = useState<Opening | null>(null);
  const [flipped, setFlipped] = useState<boolean[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const meRes = await fetch("/api/me");
        const me = await meRes.json();
        if (cancelled) return;
        setPlayer(me.player ?? null);
        if (me.player) {
          const cRes = await fetch("/api/campaign");
          if (cRes.ok) {
            const c = await cRes.json();
            if (!cancelled) {
              setDto(Array.isArray(c.nodes) ? c.nodes : []);
              setChapterDto(Array.isArray(c.chapters) ? c.chapters : []);
            }
          }
        }
      } catch {
        /* server unreachable — treated as logged out */
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // auto-flip revealed cards one by one
  useEffect(() => {
    if (!opening) return;
    const timers = opening.cards.map((_, i) =>
      setTimeout(() => {
        setFlipped((f) => f.map((v, j) => (j === i ? true : v)));
      }, 550 + i * 380),
    );
    return () => timers.forEach(clearTimeout);
  }, [opening]);

  /* ---- progress: merge the static campaign with whatever the server sent ---- */
  const { nodes, byId, starsMap } = useMemo(() => {
    const serverById = new Map(dto.map((n) => [n.id, n]));
    const stars: Record<string, number> = {};
    for (const n of CAMPAIGN) {
      const s = serverById.get(n.id);
      stars[n.id] = Math.max(0, Math.min(STARS_PER_NODE, Math.trunc(s?.stars ?? (s?.cleared ? 1 : 0)) || 0));
    }
    const clearedSet = new Set(CAMPAIGN.filter((n) => stars[n.id] > 0).map((n) => n.id));
    const list: NodeView[] = CAMPAIGN.map((n) => {
      const dtoNode = serverById.get(n.id);
      const earned = stars[n.id];
      const objectives = (dtoNode?.objectives?.length
        ? dtoNode.objectives.map((o, i) => ({ label: o.label, achieved: o.achieved ?? i < earned }))
        : objectivesFor(n.id).map((o, i) => ({ label: o.label, achieved: i < earned }))
      ).slice(0, STARS_PER_NODE);
      return {
        id: n.id,
        chapter: n.chapter,
        index: n.index,
        name: n.name,
        enemyFaction: n.enemyFaction,
        board: n.board,
        enemyHpBonus: n.enemyHpBonus,
        replayGold: n.replayGold,
        stars: earned,
        cleared: earned > 0,
        unlocked: dtoNode?.unlocked ?? isUnlocked(n.id, clearedSet),
        objectives,
      };
    });
    return {
      nodes: list,
      byId: new Map(list.map((n) => [n.id, n])),
      starsMap: stars,
    };
  }, [dto]);

  const progress = useMemo(() => {
    const chapters = chapterProgress(starsMap);
    const nodesCleared = chapters.reduce((s, c) => s + c.nodesCleared, 0);
    const starsEarned = chapters.reduce((s, c) => s + c.stars, 0);
    const current = chapters.find((c) => !c.complete)?.chapter ?? chapters.length;
    return { chapters, nodesCleared, starsEarned, current };
  }, [starsMap]);

  const modalNode = modalId ? byId.get(modalId) ?? null : null;
  const storyNode = storyId ? byId.get(storyId) ?? null : null;

  const openNodeModal = (node: NodeView) => {
    if (!node.unlocked) return;
    setStartErr(null);
    setModalId(node.id);
  };

  /** deck picked → show the story briefing (the battle starts from there) */
  const openStory = () => {
    if (!modalNode) return;
    setStartErr(null);
    setStoryId(modalNode.id);
    setModalId(null);
  };

  /** story "Back" → return to the deck picker for the same node */
  const backFromStory = () => {
    if (starting) return;
    const id = storyId;
    setStoryId(null);
    setStartErr(null);
    if (id) setModalId(id);
  };

  const startNode = async () => {
    if (!storyNode || starting) return;
    setStarting(true);
    setStartErr(null);
    try {
      const res = await fetch("/api/campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeId: storyNode.id, faction }),
      });
      const data = await res.json();
      if (res.ok && data.matchId) {
        router.push(`/play?match=${data.matchId}`);
        return;
      }
      setStartErr(data.error ?? "Could not start the battle");
    } catch {
      setStartErr("Could not start the battle");
    }
    setStarting(false);
  };

  const openPack = async (size: PackSize) => {
    if (!player || openingBusy) return;
    if ((player.packs[size] ?? 0) < 1) return;
    setOpeningBusy(true);
    try {
      const res = await fetch("/api/packs/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ size }),
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data.cards)) {
        const byCardId = new Map(CARD_POOL.map((c) => [c.id, c]));
        const cards = data.cards
          .map((id: string) => byCardId.get(id))
          .filter((c: GameCard | undefined): c is GameCard => Boolean(c));
        setPlayer((p) => (p ? { ...p, packs: data.packs ?? p.packs } : p));
        setFlipped(cards.map(() => false));
        const meta = PACK_META.find((m) => m.id === size);
        setOpening({ packName: meta?.name ?? "Pack", cards });
      }
    } catch {
      /* ignore — counts stay untouched */
    }
    setOpeningBusy(false);
  };

  const flipOne = (i: number) =>
    setFlipped((f) => f.map((v, j) => (j === i ? true : v)));

  /* ---- story briefing shown between the deck pick and the battle ---- */
  const story = storyNode ? NODE_STORY[storyNode.id] : undefined;
  const storyEnemyFaction = storyNode ? FACTION_INFO[storyNode.enemyFaction] : undefined;
  const introStory = introChapter != null ? CHAPTER_INTRO[introChapter] : undefined;

  const chapters = [1, 2, 3, 4, 5].map((ch) => ({
    num: ch,
    name: CHAPTER_NAMES[ch],
    nodes: nodes.filter((n) => n.chapter === ch),
    stats: progress.chapters.find((c) => c.chapter === ch),
    claimed: chapterDto.find((c) => c.chapter === ch)?.rewardClaimed,
  }));

  /* ---- node modal derived data ---- */
  const modalObjectives = modalNode ? modalNode.objectives : null;
  const first1 = modalNode ? rewardFor(modalNode.id, 1, true) : null;
  const first2 = modalNode ? rewardFor(modalNode.id, 2, true) : null;
  const first3 = modalNode ? rewardFor(modalNode.id, 3, true) : null;
  const replay = modalNode ? rewardFor(modalNode.id, Math.max(1, modalNode.stars), false) : null;

  /* eslint-disable @next/next/no-img-element */
  return (
    <main className="campMain">
      <div className="menuBackdrop" aria-hidden="true" />
      <Link className="campBack" href="/" data-testid="campaign-back">← Menu</Link>

      <header className="campHeader">
        <h1>Campaign</h1>
        <p>The long road through shattered Kelvarrow</p>
      </header>

      {!loaded && <p className="campLoading">Consulting the shard-maps…</p>}

      {loaded && !player && (
        <section className="campPanel loginPanel" data-testid="login-required">
          <h2>Login Required</h2>
          <p>
            The campaign remembers every march you make across Kelvarrow.
            Sign in so the shards can keep the score.
          </p>
          <Link className="campBtn" href="/login" data-testid="login-link">Log in</Link>
        </section>
      )}

      {loaded && player && (
        <>
          <div className="walletBar" data-testid="wallet">
            <span data-testid="wallet-gold"><img src="/ui/gold.png" alt="gold" />{player.gold}</span>
            <span data-testid="wallet-shards"><img src="/ui/shard.png" alt="shards" />{player.shards}</span>
            <span className="lvl">Level {player.level}</span>
          </div>

          {/* ---- journey banner: the whole road at a glance ---- */}
          <section className="journeyBanner" data-testid="journey-banner">
            <div className="journeyCrest" aria-hidden="true">
              <img src="/ui/emblem.png" alt="" />
            </div>
            <div className="journeyBody">
              <div className="journeyTop">
                <span className="journeyTag">Your Journey</span>
                <span className="journeyChapter" data-testid="journey-chapter">
                  Chapter {ROMAN[progress.current]} · {CHAPTER_NAMES[progress.current]}
                </span>
              </div>

              <div className="journeyStats">
                <span className="jStat" data-testid="journey-nodes">
                  <b>{progress.nodesCleared}</b> / {TOTAL_NODES}
                  <em>nodes cleared</em>
                </span>
                <span className="jDivider" aria-hidden="true" />
                <span className="jStat gold" data-testid="journey-stars">
                  <i className="jStarGlyph" aria-hidden="true">★</i>
                  <b>{progress.starsEarned}</b> / {TOTAL_STARS}
                  <em>stars earned</em>
                </span>
              </div>

              {/* one segment per node, grouped by chapter, lit by stars */}
              <div className="journeyBar" data-testid="journey-bar">
                {chapters.map((ch) => (
                  <div className="jGroup" key={ch.num} title={`Chapter ${ROMAN[ch.num]} — ${ch.name}`}>
                    {ch.nodes.map((n) => (
                      <span
                        key={n.id}
                        className={`jSeg s${n.stars}${n.unlocked ? " open" : ""}`}
                        data-stars={n.stars}
                      />
                    ))}
                    <span className="jGroupTick">{ROMAN[ch.num]}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ---- your packs ---- */}
          <section className="packsBar" data-testid="packs-bar">
            <h2 className="packsBarTitle">Your Packs</h2>
            {PACK_META.map((meta) => {
              const count = player.packs[meta.id] ?? 0;
              return (
                <div className="packSlot" key={meta.id}>
                  <img className="packThumb" src={meta.art} alt="" />
                  <div className="packSlotInfo">
                    <span className="packSlotName">{meta.name}</span>
                    <span className="packSlotCount" data-testid={`pack-count-${meta.id}`}>
                      <b>{count}</b> owned · {meta.cards} cards
                    </span>
                  </div>
                  <button
                    className="campBtn"
                    data-testid={`open-${meta.id}`}
                    disabled={count < 1 || openingBusy}
                    onClick={() => openPack(meta.id)}
                  >
                    Open
                  </button>
                </div>
              );
            })}
          </section>

          {/* ---- chapters ---- */}
          {chapters.map((ch) => {
            const stats = ch.stats;
            const chStars = stats?.stars ?? 0;
            const chCleared = stats?.nodesCleared ?? 0;
            const complete = stats?.complete ?? false;
            const claimed = ch.claimed ?? complete;
            const anyUnlocked = ch.nodes.some((n) => n.unlocked);
            const board = ch.nodes[0]?.board;
            /* the bonus as it stands: at least the 6-star floor so it always shows a figure */
            const bonus = chapterCompletionReward(ch.num, Math.max(chStars, NODES_PER_CHAPTER));
            const tiers = [
              { need: VETERAN_STARS, text: "+1 chapter pack" },
              { need: MASTERY_STARS, text: "signature card" },
              { need: PERFECT_STARS, text: "+1 grand pack" },
            ];
            return (
              <section
                className={`chapterSection${anyUnlocked ? "" : " chLocked"}${complete ? " chDone" : ""}`}
                key={ch.num}
                data-testid={`chapter-${ch.num}`}
              >
                <div className="chapterPlate">
                  <span className="chapterNumeral" aria-hidden="true">{ROMAN[ch.num]}</span>

                  <div className="chapterTitleCol">
                    <span className="chapterNum">Chapter {ROMAN[ch.num]}</span>
                    <h2>{ch.name}</h2>
                    <div className="chapterMeta">
                      <span className="chapterProgress" data-testid={`chapter-nodes-${ch.num}`}>
                        {chCleared} / {ch.nodes.length} nodes
                      </span>
                      <span className="chapterStars" data-testid={`chapter-stars-${ch.num}`}>
                        <i aria-hidden="true">★</i> {chStars} / {STARS_PER_CHAPTER}
                      </span>
                      {CHAPTER_INTRO[ch.num] && (
                        <button
                          type="button"
                          className="chapterIntroLink"
                          data-testid={`chapter-intro-${ch.num}`}
                          onClick={() => setIntroChapter(ch.num)}
                        >
                          Read chapter intro
                        </button>
                      )}
                    </div>
                    <div className="chapterBar" aria-hidden="true">
                      <span className="chapterBarFill" style={{ width: `${(chStars / STARS_PER_CHAPTER) * 100}%` }} />
                    </div>
                  </div>

                  {/* ---- chapter completion reward ---- */}
                  <div
                    className={`chapterBonus${claimed ? " claimed" : ""}`}
                    data-testid={`chapter-bonus-${ch.num}`}
                  >
                    <div className="cbHead">
                      <span className="cbTag">Chapter Bonus</span>
                      <span className={`cbState${claimed ? " ok" : ""}`}>
                        {claimed
                          ? "Claimed"
                          : complete
                            ? "Ready to claim"
                            : `${ch.nodes.length - chCleared} node${ch.nodes.length - chCleared === 1 ? "" : "s"} to go`}
                      </span>
                    </div>
                    <RewardChips reward={bonus} muted={!claimed} />
                    <div className="cbTiers">
                      {tiers.map((t) => (
                        <span key={t.need} className={`cbTier${chStars >= t.need ? " hit" : ""}`}>
                          <i aria-hidden="true">★</i>{t.need}+ {t.text}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {board && (
                  <div className="chapterBanner">
                    <img src={`/board/${board}.jpg`} alt="" />
                  </div>
                )}

                <div className="nodePath">
                  {ch.nodes.map((node) => {
                    const state = node.cleared ? "cleared" : node.unlocked ? "unlocked" : "locked";
                    const objectives = node.objectives;
                    const boss = node.index === NODES_PER_CHAPTER;
                    return (
                      <div
                        className={`nodeStep ${state}${node.unlocked ? " reached" : ""}${boss ? " boss" : ""}`}
                        key={node.id}
                      >
                        <button
                          className={`campNode ${state}${boss ? " boss" : ""}`}
                          data-testid={`node-${node.id}`}
                          disabled={!node.unlocked}
                          aria-label={`${node.name}${node.cleared ? ` (cleared, ${node.stars} of 3 stars)` : node.unlocked ? "" : " (locked)"}`}
                          onClick={() => openNodeModal(node)}
                        >
                          {node.cleared
                            ? <span className="nodeCheck" aria-hidden="true">{boss ? "✦" : "✓"}</span>
                            : node.unlocked ? node.index
                            : <span className="nodeLock" aria-hidden="true">🔒</span>}
                        </button>

                        <StarRow stars={node.stars} testId={`node-stars-${node.id}`} />
                        <span className="nodeLabel">{node.name}</span>

                        {/* hover / focus: the node's three objectives */}
                        <div className="nodeTip" role="tooltip">
                          <span className="nodeTipTitle">{node.name}</span>
                          <ul className="objList">
                            {objectives.map((o, i) => (
                              <li key={i} className={o.achieved ? "done" : ""}>
                                <i className="objMark" aria-hidden="true">{o.achieved ? "✓" : "★"}</i>
                                {o.label}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </>
      )}

      {/* ---- node modal ---- */}
      {modalNode && modalObjectives && first1 && first2 && first3 && replay && (
        <div className="campModalWrap" data-testid="node-modal" onClick={() => !starting && setModalId(null)}>
          <div className="campPanel campModal" onClick={(e) => e.stopPropagation()}>
            <h3>{modalNode.name}</h3>
            <p className="campModalSub">
              Chapter {ROMAN[modalNode.chapter]} · {CHAPTER_NAMES[modalNode.chapter]} · Node {modalNode.index}
            </p>
            {modalNode.cleared && (
              <StarRow stars={modalNode.stars} size="md" testId="modal-stars" />
            )}

            {/* ---- rewards ---- */}
            <div className="rewardBox" data-testid="modal-rewards">
              <div className={`rewardRow${modalNode.cleared ? " spent" : ""}`}>
                <span className="rewardTag">{modalNode.cleared ? "First clear ✓" : "First clear"}</span>
                <RewardChips reward={first1} muted={modalNode.cleared} />
              </div>
              {first2.gold > first1.gold && (
                <div className={`rewardRow${modalNode.stars >= 2 ? " spent" : ""}`}>
                  <span className="rewardTag">★★ bonus</span>
                  <span className="rewardChips">
                    <span className="rwChip"><img src="/ui/gold.png" alt="gold" />+{first2.gold - first1.gold}</span>
                  </span>
                </div>
              )}
              {first3.shards > first2.shards && (
                <div className={`rewardRow${modalNode.stars >= 3 ? " spent" : ""}`}>
                  <span className="rewardTag">★★★ bonus</span>
                  <span className="rewardChips">
                    <span className="rwChip"><img src="/ui/shard.png" alt="shards" />+{first3.shards - first2.shards}</span>
                  </span>
                </div>
              )}
              <div className="rewardRow">
                <span className="rewardTag">Replay</span>
                <span className="rewardChips">
                  <span className="rwChip"><img src="/ui/gold.png" alt="gold" />{replay.gold}</span>
                  <span className="rwNote">per win at {Math.max(1, modalNode.stars)}★</span>
                </span>
              </div>
            </div>

            {/* ---- star objectives ---- */}
            <div className="objBox" data-testid="modal-objectives">
              <span className="objBoxTitle">Star objectives</span>
              <ul className="objList">
                {modalObjectives.map((o, i) => (
                  <li key={i} className={o.achieved ? "done" : ""}>
                    <i className="objMark" aria-hidden="true">{o.achieved ? "✓" : "★"}</i>
                    {o.label}
                  </li>
                ))}
              </ul>
            </div>

            {/* ---- enemy ---- */}
            <div
              className="enemyCard"
              style={{ "--fac": FACTION_INFO[modalNode.enemyFaction]?.accent ?? "#e3a44a" } as CSSProperties}
            >
              <img
                className="enemyPortrait"
                src={FACTION_INFO[modalNode.enemyFaction] && modalNode.enemyFaction !== "neutral"
                  ? `/cards/art/${modalNode.enemyFaction}.jpg` : "/ui/emblem.png"}
                alt=""
              />
              <span className="enemyText">
                <em>Opposing you</em>
                <b>{FACTION_INFO[modalNode.enemyFaction]?.name ?? modalNode.enemyFaction}</b>
                {modalNode.enemyHpBonus > 0 && (
                  <span className="enemyHp">+{modalNode.enemyHpBonus} hero HP</span>
                )}
              </span>
            </div>

            <p className="deckPickTitle">Choose your deck</p>
            <div className="factionRow">
              {FACTIONS.map((f) => (
                <button
                  key={f.id}
                  className={`factionBtn${faction === f.id ? " selected" : ""}`}
                  style={{ "--fac": f.accent } as CSSProperties}
                  data-testid={`pick-${f.id}`}
                  onClick={() => setFaction(f.id)}
                >
                  <img src={`/cards/art/${f.id}.jpg`} alt="" />
                  {f.name}
                </button>
              ))}
            </div>

            {startErr && <div className="campErr">{startErr}</div>}
            <button
              className="campBtn startBtn"
              data-testid="start-node"
              disabled={starting}
              onClick={openStory}
            >
              Continue
            </button>
            <button className="campBtnDark cancelBtn" onClick={() => setModalId(null)} disabled={starting}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ---- story briefing (pre-battle) ---- */}
      {storyNode && (
        <StoryCard
          chapterTitle={
            story?.chapterTitle ??
            `Chapter ${ROMAN[storyNode.chapter]} — ${CHAPTER_NAMES[storyNode.chapter]}`
          }
          title={story?.title ?? storyNode.name}
          subtitle={
            story?.subtitle ??
            `Node ${storyNode.index} on the road through ${CHAPTER_NAMES[storyNode.chapter]}.`
          }
          body={
            story?.body ?? [
              `The road through ${CHAPTER_NAMES[storyNode.chapter]} narrows to a single crossing here, and someone is standing in it. No histories were written about this one. You will have to make your own.`,
            ]
          }
          enemy={{
            name: story?.enemyName ?? storyEnemyFaction?.name ?? storyNode.enemyFaction,
            title: story?.enemyTitle ?? `Champion of ${storyEnemyFaction?.name ?? "Kelvarrow"}`,
            faction: storyNode.enemyFaction,
            factionName: storyEnemyFaction?.name,
            accent: storyEnemyFaction?.accent,
            hpBonus: storyNode.enemyHpBonus,
          }}
          stakes={
            story?.stakes ??
            (storyNode.cleared
              ? `Win again and the node pays ${rewardFor(storyNode.id, Math.max(1, storyNode.stars), false).gold} gold; lose and it costs you only pride.`
              : `Win and the node yields ${rewardFor(storyNode.id, 1, true).gold} gold and a pack; take all three stars and it pays far more.`)
          }
          busy={starting}
          error={startErr}
          onBegin={startNode}
          onBack={backFromStory}
        />
      )}

      {/* ---- chapter intro (prologue) ---- */}
      {introChapter != null && introStory && (
        <StoryCard
          mode="intro"
          chapterTitle={`Chapter ${ROMAN[introChapter]} · Prologue`}
          title={CHAPTER_NAMES[introChapter] ?? introStory.title}
          body={introStory.body}
          onBack={() => setIntroChapter(null)}
        />
      )}

      {/* ---- pack opening overlay ---- */}
      {opening && (
        <div className="campOverlay" data-testid="pack-overlay">
          <h2 className="campOverlayTitle">{opening.packName}</h2>
          <p className="campOverlayHint">The shards settle…</p>
          <div className="campRevealRow">
            {opening.cards.map((card, i) => (
              <div
                key={`${card.id}-${i}`}
                className={`campFlip${flipped[i] ? " flipped" : ""}`}
                style={{ "--glow": RARITY_GLOW[card.rarity], "--i": i } as CSSProperties}
                onClick={() => flipOne(i)}
              >
                <div className="campFlipInner">
                  <div className="campFlipFace campFlipBack">
                    <img src="/cards/back.jpg" alt="card back" draggable={false} />
                  </div>
                  <div className="campFlipFace campFlipFront">
                    <FramedCard card={card} />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <button className="campBtn campDoneBtn" data-testid="pack-done" onClick={() => setOpening(null)}>
            Done
          </button>
        </div>
      )}
    </main>
  );
  /* eslint-enable @next/next/no-img-element */
}
