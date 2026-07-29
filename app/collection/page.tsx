"use client";

/** Shardfall — Collection: every collectible card, owned copies, and the player's decks. */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CARD_POOL } from "@/lib/game/pool";
import { loadProfile, type Profile } from "@/lib/profile";
import { usePlayer } from "@/lib/player-context";
import type { FactionId, GameCard } from "@/lib/game/types";
import FramedCard from "@/components/play/FramedCard";
import "@/app/play/play.css";
import "./collection.css";

const FACTION_ORDER: FactionId[] = ["pyre", "abyss", "verdant", "neutral"];

const TABS: { id: "all" | FactionId; label: string; accent: string }[] = [
  { id: "all", label: "All", accent: "#e3a44a" },
  { id: "pyre", label: "Pyre", accent: "#e0562f" },
  { id: "abyss", label: "Abyss", accent: "#45c4b8" },
  { id: "verdant", label: "Verdant", accent: "#8cc152" },
  { id: "neutral", label: "Neutral", accent: "#b9a878" },
];

const CURVE_BUCKETS = 8; // 0..6 and 7+

function manaCurve(deck: string[], byId: Map<string, GameCard>): number[] {
  const curve = new Array<number>(CURVE_BUCKETS).fill(0);
  for (const id of deck) {
    const card = byId.get(id);
    if (!card) continue;
    curve[Math.min(card.cost, CURVE_BUCKETS - 1)] += 1;
  }
  return curve;
}

function deckByCost(deck: string[], byId: Map<string, GameCard>) {
  const counts = new Map<string, number>();
  for (const id of deck) counts.set(id, (counts.get(id) ?? 0) + 1);
  const groups = new Map<number, { card: GameCard; copies: number }[]>();
  for (const [id, copies] of counts) {
    const card = byId.get(id);
    if (!card) continue;
    const list = groups.get(card.cost) ?? [];
    list.push({ card, copies });
    groups.set(card.cost, list);
  }
  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([cost, cards]) => ({
      cost,
      cards: cards.sort((a, b) => a.card.name.localeCompare(b.card.name)),
    }));
}

export default function CollectionPage() {
  const { signedIn, sessionLoading, player, error, refresh } = usePlayer();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tab, setTab] = useState<"all" | FactionId>("all");
  const [openDeck, setOpenDeck] = useState<number | null>(null);
  const [viewer, setViewer] = useState<number | null>(null);

  useEffect(() => {
    setProfile(loadProfile());
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      setViewer((v) => {
        if (v === null) return v;
        if (e.key === "Escape") return null;
        if (e.key === "ArrowRight") return v; // handled below with shown length via closure-safe path
        return v;
      });
      if (e.key === "ArrowLeft") setViewer((v) => (v === null ? v : Math.max(0, v - 1)));
      if (e.key === "ArrowRight") setViewer((v) => (v === null ? v : v + 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const byId = useMemo(() => new Map(CARD_POOL.map((c) => [c.id, c as GameCard])), []);

  const collectible = useMemo(
    () =>
      CARD_POOL.filter((c) => !c.token)
        .slice()
        .sort((a, b) => {
          const f = FACTION_ORDER.indexOf(a.faction) - FACTION_ORDER.indexOf(b.faction);
          if (f !== 0) return f;
          if (a.cost !== b.cost) return a.cost - b.cost;
          return a.name.localeCompare(b.name);
        }),
    [],
  );

  // Signed-in players browse the server collection; guests keep the local profile.
  const source = signedIn ? player : profile;

  if (!sessionLoading && signedIn && !player && error) {
    return (
      <main className="colMain">
        <div className="colBackdrop" aria-hidden="true" />
        <div className="colLoading" data-testid="account-error">
          <span>Account data unavailable</span>{" "}
          <button className="colTab" onClick={() => void refresh()}>Retry</button>
        </div>
      </main>
    );
  }

  if (sessionLoading || !source) {
    return (
      <main className="colMain">
        <div className="colBackdrop" aria-hidden="true" />
        <div className="colLoading">Opening the vault…</div>
      </main>
    );
  }

  const owned = (id: string) => source.collection[id] ?? 0;
  const ownedCount = collectible.filter((c) => owned(c.id) > 0).length;
  const shown = tab === "all" ? collectible : collectible.filter((c) => c.faction === tab);
  const decks = Object.entries(source.decks);

  return (
    <main className="colMain">
      <div className="colBackdrop" aria-hidden="true" />

      <Link className="colBack" href="/" data-testid="back-to-menu">
        ← Menu
      </Link>

      <header className="colHeader">
        <h1>Collection</h1>
        <p className="colCount" data-testid="collection-count">
          {ownedCount} / {collectible.length} cards collected
        </p>
      </header>

      <nav className="colTabs" aria-label="Faction filter">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`colTab${tab === t.id ? " active" : ""}`}
            style={{ "--tabAccent": t.accent } as React.CSSProperties}
            data-testid={`tab-${t.id}`}
            onClick={() => setTab(t.id)}
          >
            <span className="colTabDot" aria-hidden="true" />
            {t.label}
          </button>
        ))}
      </nav>

      <section className="colGrid" data-testid="collection-grid">
        {shown.map((card) => {
          const copies = owned(card.id);
          const isOwned = copies > 0;
          return (
            <div
              key={card.id}
              className={`colCard${isOwned ? "" : " notOwned"}`}
              data-testid={`col-card-${card.id}`}
              data-owned={isOwned ? "true" : "false"}
              onClick={() => setViewer(shown.indexOf(card))}
            >
              <FramedCard card={card} />
              {isOwned ? (
                <span className="colCopies">x{copies}</span>
              ) : (
                <span className="colMissing">Not collected</span>
              )}
            </div>
          );
        })}
      </section>

      {viewer !== null && shown.length > 0 && (() => {
        const idx = Math.min(viewer, shown.length - 1);
        const card = shown[idx];
        const copies = owned(card.id);
        return (
          <div className="colViewer" data-testid="card-viewer" onClick={() => setViewer(null)}>
            <button className="colNav prev" disabled={idx === 0}
              onClick={(e) => { e.stopPropagation(); setViewer(idx - 1); }} aria-label="Previous card">‹</button>
            <div className="colViewerCard" onClick={(e) => e.stopPropagation()}>
              <FramedCard card={card} width={400} />
              <div className="colViewerMeta">
                <span className="colViewerRarity" data-rarity={card.rarity}>{card.rarity}</span>
                <span>{idx + 1} / {shown.length}</span>
                <span>{copies > 0 ? `Owned x${copies}` : "Not collected"}</span>
              </div>
            </div>
            <button className="colNav next" disabled={idx >= shown.length - 1}
              onClick={(e) => { e.stopPropagation(); setViewer(idx + 1); }} aria-label="Next card">›</button>
            <button className="colViewerClose" onClick={() => setViewer(null)} aria-label="Close">✕</button>
          </div>
        );
      })()}

      <section className="colDecks">
        <h2>Your Decks</h2>
        {decks.length === 0 && <p className="colEmpty">No decks yet — win the starter set from the main menu.</p>}
        {decks.map(([name, deck], i) => {
          const curve = manaCurve(deck, byId);
          const peak = Math.max(1, ...curve);
          const open = openDeck === i;
          return (
            <div key={name} className={`colDeck${open ? " open" : ""}`} data-testid={`deck-${i}`}>
              <button
                className="colDeckHead"
                onClick={() => setOpenDeck(open ? null : i)}
                aria-expanded={open}
              >
                <span className="colDeckName">{name}</span>
                <span className="colDeckSize">{deck.length} cards</span>
                <span className="colCurve" aria-hidden="true">
                  {curve.map((n, cost) => (
                    <span
                      key={cost}
                      className="colCurveBar"
                      style={{ height: `${Math.max(8, (n / peak) * 100)}%` }}
                      title={`${cost === CURVE_BUCKETS - 1 ? "7+" : cost} mana: ${n}`}
                    />
                  ))}
                </span>
                <span className="colDeckChevron" aria-hidden="true">{open ? "▾" : "▸"}</span>
              </button>
              {open && (
                <div className="colDeckList">
                  {deckByCost(deck, byId).map(({ cost, cards }) => (
                    <div key={cost} className="colCostGroup">
                      <h3 className="colCostLabel">{cost} mana</h3>
                      <ul>
                        {cards.map(({ card, copies }) => (
                          <li key={card.id} className={`colDeckCard f-${card.faction}`}
                            onClick={() => { setTab("all"); setViewer(collectible.indexOf(card as (typeof collectible)[number])); }}>
                            <span className="colDeckCardCost">{card.cost}</span>
                            <span className="colDeckCardName">{card.name}</span>
                            <span className="colDeckCardCopies">x{copies}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </section>
    </main>
  );
}
