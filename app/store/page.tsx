"use client";

/** Shardfall STORE — packs (gold), featured singles (shards), shard top-ups (demo). */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { CSSProperties } from "react";
import { CARD_POOL } from "@/lib/game/pool";
import type { GameCard, Rarity } from "@/lib/game/types";
import {
  PACKS, addCards, loadProfile, rollPack, saveProfile, type Profile,
} from "@/lib/profile";
import {
  getDaily, getUpcoming, getWeekly, type PricedCard,
} from "@/lib/game/rotation";
import FramedCard from "@/components/play/FramedCard";
import "@/app/menu.css";
import "@/app/play/play.css";
import "./store.css";

const RARITY_GLOW: Record<Rarity, string> = {
  common: "#9c93a8", rare: "#4e8ee9", epic: "#a45ae0", legendary: "#e3a44a",
  mythic: "#ff5c8a",
};

/** Fixed featured singles — epic/legendary ids that exist in the pool. */
const FEATURED_IDS = ["pyre-003", "abyss-003", "verdant-003"];
const FEATURED: GameCard[] = FEATURED_IDS
  .map((id) => CARD_POOL.find((c) => c.id === id))
  .filter((c): c is GameCard => Boolean(c));

const singlePrice = (c: GameCard) => (c.rarity === "legendary" ? 15 : 8);
const maxCopies = (c: GameCard) => (c.rarity === "legendary" ? 1 : 3);

/** Rotation purchase limits: legendary/mythic 1 copy, everything else 3. */
const rotationMax = (c: GameCard) =>
  c.rarity === "legendary" || c.rarity === "mythic" ? 1 : 3;

const fmtCountdown = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, "0");
  const d = Math.floor(s / 86400);
  const rest = `${pad(Math.floor((s % 86400) / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  return d > 0 ? `${d}d ${rest}` : rest;
};

const TOPUPS = [
  { shards: 10, price: "1.99 €" },
  { shards: 30, price: "4.99 €" },
  { shards: 70, price: "9.99 €" },
];

type Opening = { packName: string; cards: GameCard[] };

export default function StorePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [opening, setOpening] = useState<Opening | null>(null);
  const [flipped, setFlipped] = useState<boolean[]>([]);
  const [denied, setDenied] = useState<{ key: string; msg: string } | null>(null);
  const denyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // SSR-safe rotation clock: null until mounted, then ticks every second.
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setProfile(loadProfile());
    return () => { if (denyTimer.current) clearTimeout(denyTimer.current); };
  }, []);

  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Deterministic rotations — cheap to derive each tick, flip exactly at UTC boundaries.
  const daily = now !== null ? getDaily(CARD_POOL, new Date(now)) : null;
  const weekly = now !== null ? getWeekly(CARD_POOL, new Date(now)) : null;
  const upcoming = now !== null ? getUpcoming(CARD_POOL, new Date(now)) : [];
  const todayKey = now !== null ? new Date(now).toISOString().slice(0, 10) : "";

  // auto-flip drawn cards one by one
  useEffect(() => {
    if (!opening) return;
    const timers = opening.cards.map((_, i) =>
      setTimeout(() => {
        setFlipped((f) => f.map((v, j) => (j === i ? true : v)));
      }, 550 + i * 380),
    );
    return () => timers.forEach(clearTimeout);
  }, [opening]);

  const clone = (p: Profile): Profile => ({ ...p, collection: { ...p.collection } });

  const deny = (key: string, msg: string) => {
    if (denyTimer.current) clearTimeout(denyTimer.current);
    setDenied({ key, msg });
    denyTimer.current = setTimeout(() => setDenied(null), 900);
  };

  const buyPack = (pack: (typeof PACKS)[number]) => {
    if (!profile) return;
    if (profile.gold < pack.gold) { deny(`pack-${pack.id}`, "Not enough gold"); return; }
    const p = clone(profile);
    p.gold -= pack.gold;
    const ids = rollPack(CARD_POOL, pack.cards);
    addCards(p, ids);
    saveProfile(p);
    setProfile(p);
    const byId = new Map(CARD_POOL.map((c) => [c.id, c]));
    const cards = ids
      .map((id) => byId.get(id))
      .filter((c): c is GameCard => Boolean(c));
    setFlipped(cards.map(() => false));
    setOpening({ packName: pack.name, cards });
  };

  const buySingle = (card: GameCard) => {
    if (!profile) return;
    if ((profile.collection[card.id] ?? 0) >= maxCopies(card)) return;
    const price = singlePrice(card);
    if (profile.shards < price) { deny(`single-${card.id}`, "Not enough shards"); return; }
    const p = clone(profile);
    p.shards -= price;
    addCards(p, [card.id]);
    saveProfile(p);
    setProfile(p);
  };

  /** Buy a rotation card (daily deal / weekly featured) with its listed currency. */
  const buyRotation = (pc: PricedCard, keyPrefix: string) => {
    if (!profile) return;
    const card = pc.card;
    if ((profile.collection[card.id] ?? 0) >= rotationMax(card)) return;
    const key = `${keyPrefix}-${card.id}`;
    if (pc.currency === "gold" && profile.gold < pc.price) { deny(key, "Not enough gold"); return; }
    if (pc.currency === "shards" && profile.shards < pc.price) { deny(key, "Not enough shards"); return; }
    const p = clone(profile);
    if (pc.currency === "gold") p.gold -= pc.price; else p.shards -= pc.price;
    addCards(p, [card.id]);
    saveProfile(p);
    setProfile(p);
  };

  /** Claim the free daily common — once per UTC day, tracked on the profile. */
  const claimFree = () => {
    if (!profile || !daily || !todayKey) return;
    if (profile.lastFreeClaim === todayKey) return;
    const p = clone(profile);
    addCards(p, [daily.freeCard.id]);
    p.lastFreeClaim = todayKey;
    saveProfile(p);
    setProfile(p);
  };

  const topUp = (shards: number) => {
    if (!profile) return;
    const p = clone(profile);
    p.shards += shards;
    saveProfile(p);
    setProfile(p);
  };

  const flipOne = (i: number) =>
    setFlipped((f) => f.map((v, j) => (j === i ? true : v)));

  /* eslint-disable @next/next/no-img-element */
  return (
    <main className="storeMain">
      <div className="menuBackdrop" aria-hidden="true" />
      <Link className="storeBack" href="/" data-testid="store-back">← Menu</Link>

      <header className="storeHeader">
        <h1>Store</h1>
        <p>Packs, relics, and Aethershards of Kelvarrow</p>
      </header>

      {profile && (
        <div className="walletBar storeWallet" data-testid="wallet">
          <span data-testid="wallet-gold"><img src="/ui/gold.png" alt="gold" />{profile.gold}</span>
          <span data-testid="wallet-shards"><img src="/ui/shard.png" alt="shards" />{profile.shards}</span>
        </div>
      )}

      {profile && (
        <>
          {/* ---- daily deals ---- */}
          {daily && now !== null && (
            <section className="storeSection" data-testid="daily-deals">
              <h2>
                Daily Deals
                <span className="countdown" data-testid="daily-countdown">
                  {fmtCountdown(daily.endsAt - now)}
                </span>
              </h2>
              <div className="singleRow">
                {daily.deals.map((pc) => {
                  const card = pc.card;
                  const owned = profile.collection[card.id] ?? 0;
                  const max = rotationMax(card);
                  const soldOut = owned >= max;
                  const key = `deal-${card.id}`;
                  const isDenied = denied?.key === key;
                  return (
                    <div
                      className="singleCard dealCard"
                      key={card.id}
                      style={{ "--rar": RARITY_GLOW[card.rarity] } as CSSProperties}
                    >
                      <span className="discountTag">-{pc.discountPct}%</span>
                      <FramedCard card={card} />
                      <span className="singleRarity">{card.rarity}</span>
                      <span className="ownedTag">Owned {owned}/{max}</span>
                      <div className="priceRow">
                        <img src="/ui/gold.png" alt="gold" />
                        <s className="wasPrice">{pc.basePrice}</s>
                        <span>{pc.price}</span>
                      </div>
                      <button
                        className={`buyBtn${isDenied ? " shake" : ""}`}
                        data-testid={`deal-${card.id}`}
                        disabled={soldOut}
                        onClick={() => buyRotation(pc, "deal")}
                      >
                        {soldOut ? "Owned" : "Buy"}
                      </button>
                      {isDenied && <div className="denyMsg">{denied.msg}</div>}
                    </div>
                  );
                })}
                {/* free daily common */}
                <div
                  className="singleCard dealCard freeCard"
                  style={{ "--rar": "#45c4b8" } as CSSProperties}
                >
                  <span className="discountTag freeTag">Free</span>
                  <FramedCard card={daily.freeCard} />
                  <span className="singleRarity">daily gift</span>
                  <span className="ownedTag">
                    Owned {profile.collection[daily.freeCard.id] ?? 0}
                  </span>
                  <div className="priceRow freeRow"><span>On the house</span></div>
                  <button
                    className="buyBtn"
                    data-testid="claim-free"
                    disabled={profile.lastFreeClaim === todayKey}
                    onClick={claimFree}
                  >
                    {profile.lastFreeClaim === todayKey ? "Claimed today" : "Claim"}
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* ---- weekly featured ---- */}
          {weekly && now !== null && (
            <section className="storeSection" data-testid="weekly-featured">
              <h2>
                Weekly Featured — {weekly.theme.name}
                <span className="countdown" data-testid="weekly-countdown">
                  {fmtCountdown(weekly.endsAt - now)}
                </span>
              </h2>
              <div className="weeklyBanner">
                <img src="/ui/season-banner.png" alt="" />
                <div className="bannerText">
                  <b>{weekly.theme.name}</b>
                  <span>{weekly.theme.description}</span>
                </div>
              </div>
              <div className="singleRow">
                {weekly.featured.map((pc) => {
                  const card = pc.card;
                  const owned = profile.collection[card.id] ?? 0;
                  const max = rotationMax(card);
                  const soldOut = owned >= max;
                  const key = `weekly-${card.id}`;
                  const isDenied = denied?.key === key;
                  const isGold = pc.currency === "gold";
                  return (
                    <div
                      className="singleCard dealCard"
                      key={card.id}
                      style={{ "--rar": RARITY_GLOW[card.rarity] } as CSSProperties}
                    >
                      {pc.discountPct > 0 && (
                        <span className="discountTag">-{pc.discountPct}%</span>
                      )}
                      <FramedCard card={card} />
                      <span className="singleRarity">{card.rarity}</span>
                      <span className="ownedTag">Owned {owned}/{max}</span>
                      <div className="priceRow">
                        <img
                          src={isGold ? "/ui/gold.png" : "/ui/shard.png"}
                          alt={isGold ? "gold" : "shards"}
                        />
                        {pc.discountPct > 0 && (
                          <s className="wasPrice">{pc.basePrice}</s>
                        )}
                        <span>{pc.price}</span>
                      </div>
                      <button
                        className={`buyBtn${isDenied ? " shake" : ""}`}
                        data-testid={`weekly-${card.id}`}
                        disabled={soldOut}
                        onClick={() => buyRotation(pc, "weekly")}
                      >
                        {soldOut ? "Owned" : "Buy"}
                      </button>
                      {isDenied && <div className="denyMsg">{denied.msg}</div>}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* ---- coming weeks teaser ---- */}
          {upcoming.length > 0 && (
            <section className="storeSection" data-testid="coming-weeks">
              <h2>Coming Weeks</h2>
              <div className="teaserStrip">
                {upcoming.map((u, i) => (
                  <div className="teaserCard" key={u.startsAt}>
                    <span className="teaserWhen">
                      {i === 0 ? "Next week" : `In ${i + 1} weeks`}
                    </span>
                    <b className="teaserName">{u.name}</b>
                    <span className="teaserDesc">{u.description}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ---- packs ---- */}
          <section className="storeSection">
            <h2>Card Packs</h2>
            <div className="packGrid">
              {PACKS.map((pack) => {
                const key = `pack-${pack.id}`;
                const isDenied = denied?.key === key;
                return (
                  <div className="packCard" key={pack.id}>
                    <div className="packArt"><img src={pack.art} alt="" /></div>
                    <div className="packBody">
                      <b className="packName">{pack.name}</b>
                      <span className="packMeta">{pack.cards} cards · rarity odds apply</span>
                      <div className="priceRow">
                        <img src="/ui/gold.png" alt="gold" />
                        <span>{pack.gold}</span>
                      </div>
                      <button
                        className={`buyBtn${isDenied ? " shake" : ""}`}
                        data-testid={`buy-${pack.id}`}
                        onClick={() => buyPack(pack)}
                      >
                        Buy Pack
                      </button>
                      {isDenied && <div className="denyMsg">{denied.msg}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ---- featured singles ---- */}
          <section className="storeSection">
            <h2>Featured Singles</h2>
            <div className="singleRow">
              {FEATURED.map((card) => {
                const owned = profile.collection[card.id] ?? 0;
                const max = maxCopies(card);
                const soldOut = owned >= max;
                const key = `single-${card.id}`;
                const isDenied = denied?.key === key;
                return (
                  <div
                    className="singleCard"
                    key={card.id}
                    style={{ "--rar": RARITY_GLOW[card.rarity] } as CSSProperties}
                  >
                    <FramedCard card={card} />
                    <span className="singleRarity">{card.rarity}</span>
                    <span className="ownedTag">Owned {owned}/{max}</span>
                    <div className="priceRow">
                      <img src="/ui/shard.png" alt="shards" />
                      <span>{singlePrice(card)}</span>
                    </div>
                    <button
                      className={`buyBtn${isDenied ? " shake" : ""}`}
                      data-testid={`buy-single-${card.id}`}
                      disabled={soldOut}
                      onClick={() => buySingle(card)}
                    >
                      {soldOut ? "Owned" : "Buy"}
                    </button>
                    {isDenied && <div className="denyMsg">{denied.msg}</div>}
                  </div>
                );
              })}
            </div>
          </section>

          {/* ---- shard top-ups ---- */}
          <section className="storeSection">
            <h2>Aethershards</h2>
            <div className="topupRow">
              {TOPUPS.map((t) => (
                <div className="topupCard" key={t.shards}>
                  <img className="topupIcon" src="/ui/shard.png" alt="" />
                  <b className="topupAmount">+{t.shards} Shards</b>
                  <span className="topupPrice">{t.price}</span>
                  <button
                    className="buyBtn"
                    data-testid={`topup-${t.shards}`}
                    onClick={() => topUp(t.shards)}
                  >
                    Purchase
                  </button>
                </div>
              ))}
            </div>
            <p className="topupNote">Payments arrive with the online release — for now these grant shards instantly.</p>
          </section>
        </>
      )}

      {/* ---- pack opening overlay ---- */}
      {opening && (
        <div className="packOverlay" data-testid="pack-overlay">
          <h2 className="overlayTitle">{opening.packName}</h2>
          <p className="overlayHint">The shards settle…</p>
          <div className="revealRow">
            {opening.cards.map((card, i) => (
              <div
                key={`${card.id}-${i}`}
                className={`flipCard${flipped[i] ? " flipped" : ""}`}
                style={{ "--glow": RARITY_GLOW[card.rarity], "--i": i } as CSSProperties}
                onClick={() => flipOne(i)}
              >
                <div className="flipInner">
                  <div className="flipFace flipBack">
                    <img src="/cards/back.jpg" alt="card back" draggable={false} />
                  </div>
                  <div className="flipFace flipFront">
                    <FramedCard card={card} />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <button className="buyBtn doneBtn" data-testid="pack-done" onClick={() => setOpening(null)}>
            Done
          </button>
        </div>
      )}
    </main>
  );
  /* eslint-enable @next/next/no-img-element */
}
