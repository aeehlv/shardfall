"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CARD_POOL } from "@/lib/game/pool";
import { buildStarterDeck, starterDeckName } from "@/lib/game/decks";
import { playableBoards } from "@/lib/game/boards";
import { addCards, loadProfile, saveProfile, STARTER_DECK_VERSION, type Profile } from "@/lib/profile";
import { PACK_ODDS } from "@/lib/game/packs";
import { getCard } from "@/lib/game/engine";
import FramedCard from "@/components/play/FramedCard";
import { play as playSfx } from "@/lib/sound";
import "@/app/play/play.css";
import { fmtCountdown, getHotDeals } from "@/lib/game/hotdeals";
import type { FactionId } from "@/lib/game/types";
import { authClient } from "@/lib/auth-client";
import { usePlayer, WalletBar } from "@/lib/player-context";
import Intro from "@/components/menu/Intro";
import LorePrologue from "@/components/lore/LorePrologue";
import Landing from "@/components/landing/Landing";
import "./menu.css";

const FACTIONS: { id: FactionId; name: string; blurb: string; accent: string }[] = [
  { id: "pyre", name: "Pyre Dominion", blurb: "Aggression, fire, the First Hammer.", accent: "#e0562f" },
  { id: "abyss", name: "Abyssal Choir", blurb: "Control, spells, the drowned song.", accent: "#45c4b8" },
  { id: "verdant", name: "Verdant Compact", blurb: "Growth, swarms, the Undersown.", accent: "#8cc152" },
];

const MATCH_KIND_LABEL: Record<string, string> = {
  ranked: "Ranked", campaign: "Campaign", friendly: "Friendly",
};

export default function MainMenu() {
  return (
    <Suspense fallback={null}>
      <MenuInner />
    </Suspense>
  );
}

function MenuInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const { player, activeMatches, flags, refresh } = usePlayer();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [showIntro, setShowIntro] = useState(false);
  const [pickDeck, setPickDeck] = useState(false);
  const [practiceDeck, setPracticeDeck] = useState<FactionId | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [queueing, setQueueing] = useState(false);
  const [queueFaction, setQueueFaction] = useState<FactionId | null>(null);
  const [queueSecs, setQueueSecs] = useState(0);
  const [dealTick, setDealTick] = useState(Date.now());
  const [dealMsg, setDealMsg] = useState<string | null>(null);
  const [dealOpen, setDealOpen] = useState<number | null>(null);
  const [dealBusy, setDealBusy] = useState(false);
  const [grantBusy, setGrantBusy] = useState(false);
  const [opened, setOpened] = useState<string[] | null>(null);
  const [flipped, setFlipped] = useState<Set<number>>(new Set());
  const queueTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const p = loadProfile();
    if (Object.keys(p.decks).length === 0 || (p.deckVersion ?? 1) < STARTER_DECK_VERSION) {
      for (const f of ["pyre", "abyss", "verdant"] as FactionId[]) {
        const deck = buildStarterDeck(CARD_POOL, f);
        p.decks[starterDeckName(f)] = deck;
        addCards(p, [...new Set(deck)]);
      }
      p.deckVersion = STARTER_DECK_VERSION;
    }
    // Anyone who already played (or finished the tutorial) is never sent through the prologue.
    if (!p.loreSeen && (p.wins + p.losses > 0 || p.tutorialDone)) p.loreSeen = true;
    // The short intro overlay waits until the prologue is done.
    if (p.loreSeen && !p.introSeen) setShowIntro(true);
    saveProfile(p);
    setProfile(p);
  }, []);

  const stopQueue = useCallback(() => {
    if (queueTimer.current) clearInterval(queueTimer.current);
    queueTimer.current = null;
    setQueueing(false);
    setQueueFaction(null);
    setQueueSecs(0);
    void fetch("/api/queue", { method: "DELETE" });
  }, []);

  const startQueue = useCallback(async (faction: FactionId) => {
    setQueueFaction(faction);
    setQueueSecs(0);
    await fetch("/api/queue", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ faction }),
    });
    queueTimer.current = setInterval(async () => {
      setQueueSecs((s) => s + 1);
      const r = await fetch("/api/queue", { cache: "no-store" });
      const j = await r.json();
      if (j.matchId) {
        if (queueTimer.current) clearInterval(queueTimer.current);
        router.push(`/play?match=${j.matchId}`);
      }
    }, 1500);
  }, [router]);

  const openRanked = () => {
    if (!session?.user) { router.push("/login"); return; }
    setQueueing(true);
  };

  // /?queue=1 → open the ranked modal straight away
  useEffect(() => {
    if (searchParams.get("queue") === "1" && session?.user) setQueueing(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user]);

  useEffect(() => () => { if (queueTimer.current) clearInterval(queueTimer.current); }, []);

  useEffect(() => {
    const iv = setInterval(() => setDealTick(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);

  /** Demo wallet top-up — server-side, gated behind the demoGrants flag. */
  const grant = async (kind: "gold" | "shards") => {
    if (grantBusy) return;
    setGrantBusy(true);
    try {
      const r = await fetch("/api/dev/grant", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      if (r.ok) await refresh();
    } finally {
      setGrantBusy(false);
    }
  };

  const confirmDeal = async (slot: number) => {
    if (dealBusy) return;
    setDealBusy(true);
    try {
      const r = await fetch("/api/store/buy", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "hot-deal", id: String(slot) }),
      });
      const j = (await r.json().catch(() => ({}))) as { error?: string; cards?: string[] };
      if (!r.ok) {
        setDealMsg(j.error ?? "Purchase failed");
        setTimeout(() => setDealMsg(null), 1800);
        return;
      }
      await refresh();
      const cards = j.cards ?? [];
      playSfx("purchase", 0.5);
      setDealOpen(null);
      setOpened(cards);
      setFlipped(new Set());
      cards.forEach((_, i) => setTimeout(() => {
        setFlipped((f) => new Set(f).add(i));
        playSfx("pack-open", 0.35);
      }, 450 + i * 380));
    } finally {
      setDealBusy(false);
    }
  };

  const dismissLore = () => {
    const p = loadProfile();
    p.loreSeen = true;
    saveProfile(p);
    setProfile(p);
    if (!p.introSeen) setShowIntro(true);
  };

  const dismissIntro = () => {
    setShowIntro(false);
    const p = loadProfile();
    p.introSeen = true;
    saveProfile(p);
    setProfile(p);
  };

  if (!sessionPending && !session?.user) {
    return <Landing />;
  }
  if (sessionPending || !profile) {
    return <main className="menuMain"><div className="menuBackdrop" aria-hidden="true" /></main>;
  }
  if (!profile.loreSeen) {
    return <LorePrologue onDone={dismissLore} />;
  }

  /* eslint-disable @next/next/no-img-element */
  return (
    <main className="menuMain">
      <div className="menuBackdrop" aria-hidden="true" />

      {showIntro && <Intro onDone={dismissIntro} />}

      <img className="brandMark" src="/ui/emblem.png" alt="Shardfall" />
      <div className="accountChip" data-testid="account">
        {session?.user ? (
          <>
            <Link href="/account" title="Account" data-testid="account-link">
              <b>{player?.name ?? session.user.name}</b>
            </Link>
            {player && (
              <span className={`leagueTag l-${player.league}`}>
                <img className="leagueCrest" src={`/ui/leagues/${player.league.toLowerCase()}.png`} alt="" />
                {player.league} · {player.rating}
              </span>
            )}
            <button className="menuSmall" onClick={() => void authClient.signOut()}>Sign out</button>
          </>
        ) : (
          <Link className="loginBtn" href="/login" data-testid="menu-login">Sign in · Register</Link>
        )}
      </div>

      <header className="menuHeader">
        <img className="logoLockup" src="/ui/logo-epic.png" alt="Shardfall" />
        <img className="seasonBanner" src="/ui/season-banner.png" alt="First Epoch — The Shattering" />
      </header>

      <div className="cornerRail">
        <Link className="storeCorner" href="/collection" title="Collection">
          <img src="/ui/btn-collection.png" alt="Collection" />
          <span>Collection</span>
        </Link>
        <Link className="storeCorner" href="/leaderboard" data-testid="menu-leaderboard" title="Leaderboard">
          <img src="/ui/btn-ladder.png" alt="Leaderboard" />
          <span>Ladder</span>
        </Link>
        <Link className="storeCorner" href="/store" data-testid="menu-store" title="Store">
          <img src="/ui/btn-store.png" alt="Store" />
          <span>Store</span>
        </Link>
      </div>
      <WalletBar />

      {activeMatches.map((m) => (
        <button key={m.id} className="resumeBanner" data-testid="resume-match"
          onClick={() => router.push(`/play?match=${m.id}`)}>
          ⚔ Resume your {MATCH_KIND_LABEL[m.kind] ?? m.kind} battle
        </button>
      ))}

      {session?.user && (
        <div className="hotDeals" data-testid="hot-deals">
          <h3 className="hotTitle">Hot Deals</h3>
          {getHotDeals(dealTick).map((d) => (
            <button key={d.slot} className="hotOrb" data-testid={`deal-${d.slot}`}
              title={d.pack.name} onClick={() => { playSfx("click", 0.4); setDealOpen(d.slot); }}>
              <span className="hotCircle">
                <img className="hotFire" src="/fx/fire.jpg" alt="" />
                <img className="hotPack" src={d.pack.art} alt="" />
                <span className="hotOff">-{d.discountPct}%</span>
              </span>
              <span className="hotPrice">
                <s>{Math.round(d.pack.gold / 10)}</s> {d.price} <img src="/ui/shard.png" alt="shards" />
              </span>
              <span className={`hotTimer${d.endsAt - dealTick < 3 * 3600_000 ? " soon" : ""}`}>
                {fmtCountdown(d.endsAt - dealTick)}
              </span>
            </button>
          ))}
        </div>
      )}

      <nav className="menuNav">
        {!pickDeck ? (
          <>
            <button className="menuBtn primary" data-testid="menu-ranked" onClick={openRanked}>
              Ranked Battle
            </button>
            <button className="menuBtn" data-testid="menu-play"
              onClick={() => { setPracticeDeck(null); setPickDeck(true); }}>
              Practice vs AI
            </button>
            <Link className="menuBtn" href="/campaign" data-testid="menu-campaign">Campaign</Link>
            {!profile?.tutorialDone && (
              <Link className="menuBtn highlight" href="/play?deck=pyre&tutorial=1" data-testid="menu-tutorial">
                Start Tutorial
              </Link>
            )}
            <Link className="menuBtn dark" href="/friends" data-testid="menu-friends">Friends</Link>
          </>
        ) : (
          practiceDeck === null ? (
            <div className="deckPick">
              <h2>Choose your deck</h2>
              <div className="deckRow">
                {FACTIONS.map((f) => (
                  <button key={f.id} className="deckChoice"
                    style={{ "--dc-glow": `${f.accent}88`, color: f.accent } as React.CSSProperties}
                    onClick={() => setPracticeDeck(f.id)} data-testid={`deck-${f.id}`}>
                    <img src={`/cards/art/${f.id}.jpg`} alt="" />
                    <b style={{ color: f.accent }}>{starterDeckName(f.id)}</b>
                    <span>{f.blurb}</span>
                  </button>
                ))}
              </div>
              <button className="menuSmall" onClick={() => setPickDeck(false)}>← back</button>
            </div>
          ) : (
            <div className="deckPick">
              <h2>Choose the battlefield</h2>
              <div className="boardRowPick">
                {playableBoards().map((bd) => (
                  <Link key={bd.slug} className="boardChoice"
                    href={`/play?deck=${practiceDeck}&board=${bd.slug}`}
                    data-testid={`board-${bd.slug}`}>
                    <img src={`/board/${bd.slug}.jpg`} alt="" />
                    <b>{bd.name}</b>
                    <span>{bd.blurb}</span>
                  </Link>
                ))}
              </div>
              <button className="menuSmall" onClick={() => setPracticeDeck(null)}>← back</button>
            </div>
          )
        )}
      </nav>

      {/* ranked queue modal */}
      {queueing && (
        <div className="queueOverlay" data-testid="queue-overlay">
          <div className="queuePanel">
            {!queueFaction ? (
              <>
                <h2>Ranked Battle</h2>
                {player && (
                  <p className="queueMeta">
                    <span className={`leagueTag l-${player.league}`}>{player.league}</span> · {player.rating} rating
                  </p>
                )}
                <p className="queueHint">Choose your deck — we&apos;ll find an opponent of similar skill in your league.</p>
                <div className="queueFactions">
                  {FACTIONS.map((f) => (
                    <button key={f.id} className="queueFaction" style={{ borderColor: f.accent }}
                      data-testid={`queue-${f.id}`} onClick={() => void startQueue(f.id)}>
                      <img src={`/cards/art/${f.id}.jpg`} alt="" />
                      <b style={{ color: f.accent }}>{f.name}</b>
                    </button>
                  ))}
                </div>
                <button className="btn subtle" onClick={() => setQueueing(false)}>Cancel</button>
              </>
            ) : (
              <>
                <h2>Searching…</h2>
                <div className="queueSpinner" aria-hidden="true" />
                <p className="queueMeta">{queueSecs}s — matching {queueFaction} deck</p>
                <p className="queueHint">{queueSecs >= 11 ? "Widening the search…" : "Looking for a duelist in your league"}</p>
                <button className="btn subtle" data-testid="queue-cancel" onClick={stopQueue}>Cancel</button>
              </>
            )}
          </div>
        </div>
      )}

      <div className="moreCorner">
        {moreOpen && (
          <div className="morePop">
            <Link className="moreLink" href="/play?deck=pyre&tutorial=1">Replay tutorial</Link>
            {flags.demoGrants && (
              <>
                <div className="moreDivider" aria-hidden="true" />
                <span className="moreDevLabel">Demo top-up</span>
                <button className="moreLink dev" data-testid="admin-gold" disabled={grantBusy}
                  onClick={() => void grant("gold")}>
                  +500 gold
                </button>
                <button className="moreLink dev" data-testid="admin-shards" disabled={grantBusy}
                  onClick={() => void grant("shards")}>
                  +50 shards
                </button>
              </>
            )}
          </div>
        )}
        <button className="moreBtn" aria-label="More" onClick={() => setMoreOpen((o) => !o)}>
          <img src="/ui/btn-round.png" alt="" />
        </button>
      </div>

      {dealOpen !== null && (() => {
        const d = getHotDeals(dealTick).find((x) => x.slot === dealOpen);
        if (!d) return null;
        const affordable = (player?.shards ?? 0) >= d.price;
        return (
          <div className="dealOverlay" data-testid="deal-modal" onClick={() => setDealOpen(null)}>
            <div className="dealPanel" onClick={(e) => e.stopPropagation()}>
              <span className="dealFlash">-{d.discountPct}%</span>
              <h2>{d.pack.name}</h2>
              <img className="dealArt" src={d.pack.art} alt="" />
              <p className="dealSub">{d.pack.cards} random cards · ends in {fmtCountdown(d.endsAt - dealTick)}</p>
              <ul className="dealOdds">
                {PACK_ODDS.map(([rarity, odds]) => (
                  <li key={rarity}><span className={`odRar r-${rarity}`}>{rarity}</span><b>{(odds * 100).toFixed(1)}%</b></li>
                ))}
              </ul>
              <div className="dealPriceRow">
                <s>{Math.round(d.pack.gold / 10)}</s>
                <b>{d.price}</b>
                <img src="/ui/shard.png" alt="shards" />
              </div>
              {dealMsg && <p className="hotMsg">{dealMsg}</p>}
              <div className="dealBtns">
                <button className="menuBtn primary" data-testid="deal-buy" disabled={!affordable || dealBusy}
                  onClick={() => void confirmDeal(d.slot)}>
                  {dealBusy ? "…" : affordable ? "Buy & Open" : "Not enough shards"}
                </button>
                <button className="menuSmall" onClick={() => setDealOpen(null)}>Cancel</button>
              </div>
              <Link className="menuSmall dealMore" href="/store">See all offers in the Store →</Link>
            </div>
          </div>
        );
      })()}

      {opened && (
        <div className="dealOverlay" data-testid="deal-reveal">
          <div className="revealWrapMenu">
            <h2 className="revealTitle">Your Cards</h2>
            <div className="revealRow">
              {opened.map((id, i) => (
                <div key={i} className={`revealCard${flipped.has(i) ? " flipped" : ""}`}
                  onClick={() => setFlipped((f) => new Set(f).add(i))}>
                  <div className="revealInner">
                    <div className="revealBack"><img src="/cards/back.jpg" alt="" /></div>
                    <div className="revealFront" data-rarity={getCard(id).rarity}>
                      <FramedCard card={getCard(id)} width={170} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <button className="menuBtn primary" data-testid="reveal-done"
              onClick={() => { setOpened(null); setFlipped(new Set()); }}>Done</button>
          </div>
        </div>
      )}

      <footer className="menuFooter">
        Kelvarrow · v0.2 · {CARD_POOL.filter((c) => !c.token).length} cards in the pool
        {" · "}<Link href="/privacy">Privacy</Link>{" · "}<Link href="/terms">Terms</Link>{" · "}<Link href="/account">Account</Link>
      </footer>
    </main>
  );
  /* eslint-enable @next/next/no-img-element */
}
