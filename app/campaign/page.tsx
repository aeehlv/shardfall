"use client";

/** Shardfall CAMPAIGN — 5 chapters × 6 nodes across Kelvarrow, PvE with pack rewards. */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";
import { CARD_POOL } from "@/lib/game/pool";
import type { FactionId, GameCard, Rarity } from "@/lib/game/types";
import { CHAPTER_INTRO, NODE_STORY } from "@/lib/game/campaign-story";
import FramedCard from "@/components/play/FramedCard";
import StoryCard from "@/components/campaign/StoryCard";
import "@/app/menu.css";
import "@/app/play/play.css";
import "./campaign.css";

type PackSize = "small" | "standard" | "grand";
type DeckFaction = "pyre" | "abyss" | "verdant";

interface CampaignNodeDto {
  id: string;
  chapter: number;
  index: number;
  name: string;
  enemyFaction: FactionId;
  board: string;
  enemyHpBonus: number;
  firstWin: { gold: number; pack: PackSize };
  replayGold: number;
  cleared: boolean;
  unlocked: boolean;
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

const RARITY_GLOW: Record<Rarity, string> = {
  common: "#9c93a8", rare: "#4e8ee9", epic: "#a45ae0", legendary: "#e3a44a",
  mythic: "#ff5c8a",
};

type Opening = { packName: string; cards: GameCard[] };

export default function CampaignPage() {
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [player, setPlayer] = useState<PlayerDto | null>(null);
  const [nodes, setNodes] = useState<CampaignNodeDto[]>([]);
  const [modalNode, setModalNode] = useState<CampaignNodeDto | null>(null);
  const [storyNode, setStoryNode] = useState<CampaignNodeDto | null>(null);
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
            if (!cancelled) setNodes(c.nodes ?? []);
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

  const openNodeModal = (node: CampaignNodeDto) => {
    if (!node.unlocked) return;
    setStartErr(null);
    setModalNode(node);
  };

  /** deck picked → show the story briefing (the battle starts from there) */
  const openStory = () => {
    if (!modalNode) return;
    setStartErr(null);
    setStoryNode(modalNode);
    setModalNode(null);
  };

  /** story "Back" → return to the deck picker for the same node */
  const backFromStory = () => {
    if (starting) return;
    const node = storyNode;
    setStoryNode(null);
    setStartErr(null);
    if (node) setModalNode(node);
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
        const byId = new Map(CARD_POOL.map((c) => [c.id, c]));
        const cards = data.cards
          .map((id: string) => byId.get(id))
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
    nodes: nodes.filter((n) => n.chapter === ch).sort((a, b) => a.index - b.index),
  }));

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
            const clearedCount = ch.nodes.filter((n) => n.cleared).length;
            const anyUnlocked = ch.nodes.some((n) => n.unlocked);
            const board = ch.nodes[0]?.board;
            return (
              <section
                className={`chapterSection${anyUnlocked ? "" : " chLocked"}`}
                key={ch.num}
                data-testid={`chapter-${ch.num}`}
              >
                <div className="chapterHead">
                  <span className="chapterNum">Chapter {ROMAN[ch.num]}</span>
                  <h2>{ch.name}</h2>
                  <span className="chapterProgress">{clearedCount} / {ch.nodes.length} cleared</span>
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
                {board && (
                  <div className="chapterBanner">
                    <img src={`/board/${board}.jpg`} alt="" />
                  </div>
                )}
                <div className="nodePath">
                  {ch.nodes.map((node) => {
                    const state = node.cleared ? "cleared" : node.unlocked ? "unlocked" : "locked";
                    return (
                      <div
                        className={`nodeStep ${state}${node.unlocked ? " reached" : ""}`}
                        key={node.id}
                      >
                        <button
                          className={`campNode ${state}`}
                          data-testid={`node-${node.id}`}
                          disabled={!node.unlocked}
                          aria-label={`${node.name}${node.cleared ? " (cleared)" : node.unlocked ? "" : " (locked)"}`}
                          onClick={() => openNodeModal(node)}
                        >
                          {node.cleared
                            ? <span className="nodeCheck" aria-hidden="true">✓</span>
                            : node.index}
                        </button>
                        <span className="nodeLabel">{node.name}</span>
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
      {modalNode && (
        <div className="campModalWrap" data-testid="node-modal" onClick={() => !starting && setModalNode(null)}>
          <div className="campPanel campModal" onClick={(e) => e.stopPropagation()}>
            <h3>{modalNode.name}</h3>
            <p className="campModalSub">
              Chapter {ROMAN[modalNode.chapter]} · {CHAPTER_NAMES[modalNode.chapter]} · Node {modalNode.index}
            </p>
            <div className="enemyLine">
              Enemy:&nbsp;
              <b style={{ color: FACTION_INFO[modalNode.enemyFaction]?.accent }}>
                {FACTION_INFO[modalNode.enemyFaction]?.name ?? modalNode.enemyFaction}
              </b>
              {modalNode.enemyHpBonus > 0 && (
                <span className="enemyHp">(+{modalNode.enemyHpBonus} hero HP)</span>
              )}
            </div>

            <div className="rewardBox">
              <div className="rewardRow">
                <span className="rewardTag">First win</span>
                <img src="/ui/gold.png" alt="gold" />
                <b>{modalNode.firstWin.gold}</b>
                <img
                  className="rewardPack"
                  src={`/store/pack-${modalNode.firstWin.pack}.png`}
                  alt=""
                />
                <span>
                  {PACK_META.find((m) => m.id === modalNode.firstWin.pack)?.name ?? modalNode.firstWin.pack}
                </span>
              </div>
              <div className="rewardRow">
                <span className="rewardTag">Replay</span>
                <img src="/ui/gold.png" alt="gold" />
                <b>{modalNode.replayGold}</b>
                <span>per win</span>
              </div>
              {modalNode.cleared && (
                <div className="rewardRow">
                  <span className="rewardTag">Status</span>
                  <span style={{ color: "#ffd98a" }}>Cleared — replay for gold</span>
                </div>
              )}
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
            <button className="campBtnDark cancelBtn" onClick={() => setModalNode(null)} disabled={starting}>
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
              ? `Win again and the node pays ${storyNode.replayGold} gold; lose and it costs you only pride.`
              : `Win and the node yields ${storyNode.firstWin.gold} gold and a pack; lose and the road stays shut.`)
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
