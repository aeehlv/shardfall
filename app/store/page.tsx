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
  DAY_MS, getDaily, getUpcoming, getWeekly, type PricedCard,
} from "@/lib/game/rotation";
import {
  FEATURED_IDS, MAX_COPIES, ROTATION_MAX, TOPUP_TIERS, singlePrice,
} from "@/lib/game/store-pricing";
import { CurrencyHint, usePlayer } from "@/lib/player-context";
import FramedCard from "@/components/play/FramedCard";
import SiteFooter from "@/components/SiteFooter";
import "@/app/menu.css";
import "@/app/play/play.css";
import "./store.css";

const RARITY_GLOW: Record<Rarity, string> = {
  common: "#9c93a8", rare: "#4e8ee9", epic: "#a45ae0", legendary: "#e3a44a",
  mythic: "#ff5c8a",
};

const FEATURED: GameCard[] = FEATURED_IDS
  .map((id) => CARD_POOL.find((c) => c.id === id))
  .filter((c): c is GameCard => Boolean(c));

const fmtCountdown = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, "0");
  const d = Math.floor(s / 86400);
  const rest = `${pad(Math.floor((s % 86400) / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  return d > 0 ? `${d}d ${rest}` : rest;
};

type Opening = { packName: string; cards: GameCard[] };

export default function StorePage() {
  const { signedIn, sessionLoading, player, refresh, error } = usePlayer();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [opening, setOpening] = useState<Opening | null>(null);
  const [flipped, setFlipped] = useState<boolean[]>([]);
  const [denied, setDenied] = useState<{ key: string; msg: string } | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [freeClaimedDay, setFreeClaimedDay] = useState<string | null>(null);
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

  // Signed-in players read/spend the server wallet; guests keep the local profile.
  // While the session resolves the wallet is unknown — never flash guest numbers.
  const ready = !sessionLoading && (signedIn ? player !== null : profile !== null);
  const wallet = sessionLoading
    ? null
    : signedIn
      ? player && { gold: player.gold, shards: player.shards }
      : profile && { gold: profile.gold, shards: profile.shards };
  const collection = (signedIn ? player?.collection : profile?.collection) ?? {};
  const owned = (id: string) => collection[id] ?? 0;
  const freeClaimed = signedIn
    ? (player?.lastFreeClaim != null
        ? daily !== null && player.lastFreeClaim >= daily.endsAt - DAY_MS
        : freeClaimedDay === todayKey)
    : profile?.lastFreeClaim === todayKey;

  const deny = (key: string, msg: string) => {
    if (denyTimer.current) clearTimeout(denyTimer.current);
    setDenied({ key, msg });
    denyTimer.current = setTimeout(() => setDenied(null), 900);
  };

  /** One purchase at a time — a second click while one is in flight is a no-op. */
  const withPending = async (key: string, fn: () => Promise<void>) => {
    if (pending) return;
    setPending(key);
    try { await fn(); } finally { setPending(null); }
  };

  const revealPack = (packName: string, ids: string[]) => {
    const byId = new Map(CARD_POOL.map((c) => [c.id, c]));
    const cards = ids
      .map((id) => byId.get(id))
      .filter((c): c is GameCard => Boolean(c));
    setFlipped(cards.map(() => false));
    setOpening({ packName, cards });
  };

  /** Server purchase — denies with the API's message on 400/409, refreshes on success. */
  const serverBuy = async (key: string, body: Record<string, unknown>) => {
    const r = await fetch("/api/store/buy", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = (await r.json().catch(() => ({}))) as { error?: string; cards?: string[] };
    if (!r.ok) { deny(key, j.error ?? "Purchase failed"); return null; }
    await refresh();
    return j;
  };

  const buyPack = (pack: (typeof PACKS)[number]) => withPending(`pack-${pack.id}`, async () => {
    if (signedIn) {
      const j = await serverBuy(`pack-${pack.id}`, { kind: "pack", size: pack.id });
      if (j) revealPack(pack.name, j.cards ?? []);
      return;
    }
    if (!profile) return;
    if (profile.gold < pack.gold) { deny(`pack-${pack.id}`, "Not enough gold"); return; }
    const p = clone(profile);
    p.gold -= pack.gold;
    const ids = rollPack(CARD_POOL, pack.cards);
    addCards(p, ids);
    saveProfile(p);
    setProfile(p);
    revealPack(pack.name, ids);
  });

  const buySingle = (card: GameCard) => withPending(`single-${card.id}`, async () => {
    if (owned(card.id) >= MAX_COPIES(card.rarity)) return;
    if (signedIn) {
      await serverBuy(`single-${card.id}`, { kind: "single", id: card.id });
      return;
    }
    if (!profile) return;
    const price = singlePrice(card.rarity);
    if (profile.shards < price) { deny(`single-${card.id}`, "Not enough shards"); return; }
    const p = clone(profile);
    p.shards -= price;
    addCards(p, [card.id]);
    saveProfile(p);
    setProfile(p);
  });

  /** Buy a rotation card (daily deal / weekly featured) with its listed currency. */
  const buyRotation = (pc: PricedCard, keyPrefix: string) => withPending(`${keyPrefix}-${pc.card.id}`, async () => {
    const card = pc.card;
    if (owned(card.id) >= ROTATION_MAX(card.rarity)) return;
    const key = `${keyPrefix}-${card.id}`;
    if (signedIn) {
      await serverBuy(key, { kind: "rotation", id: card.id });
      return;
    }
    if (!profile) return;
    if (pc.currency === "gold" && profile.gold < pc.price) { deny(key, "Not enough gold"); return; }
    if (pc.currency === "shards" && profile.shards < pc.price) { deny(key, "Not enough shards"); return; }
    const p = clone(profile);
    if (pc.currency === "gold") p.gold -= pc.price; else p.shards -= pc.price;
    addCards(p, [card.id]);
    saveProfile(p);
    setProfile(p);
  });

  /** Claim the free daily common — once per UTC day, server-tracked when signed in. */
  const claimFree = () => withPending("free-daily", async () => {
    if (!daily || !todayKey || freeClaimed) return;
    if (signedIn) {
      const r = await fetch("/api/store/buy", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "daily-free" }),
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        if (r.status === 409) setFreeClaimedDay(todayKey);
        deny("free-daily", j.error ?? "Claim failed");
        return;
      }
      setFreeClaimedDay(todayKey);
      await refresh();
      return;
    }
    if (!profile) return;
    const p = clone(profile);
    addCards(p, [daily.freeCard.id]);
    p.lastFreeClaim = todayKey;
    saveProfile(p);
    setProfile(p);
  });

  const topUp = (shards: number) => withPending(`topup-${shards}`, async () => {
    if (signedIn) {
      const r = await fetch("/api/store/topup", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: String(shards) }),
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        deny(`topup-${shards}`, j.error ?? "Top-up failed");
        return;
      }
      await refresh();
      return;
    }
    if (!profile) return;
    const p = clone(profile);
    p.shards += shards;
    saveProfile(p);
    setProfile(p);
  });

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

      {(signedIn || profile) && (
        <div className="walletBar storeWallet" data-testid="wallet">
          <CurrencyHint kind="gold">
            <span data-testid="wallet-gold"><img src="/ui/gold.png" alt="gold" />{wallet ? wallet.gold : "···"}</span>
          </CurrencyHint>
          <CurrencyHint kind="shards">
            <span data-testid="wallet-shards"><img src="/ui/shard.png" alt="shards" />{wallet ? wallet.shards : "···"}</span>
          </CurrencyHint>
        </div>
      )}

      {!sessionLoading && signedIn && !player && error && (
        <section className="storeSection" data-testid="account-error" style={{ textAlign: "center" }}>
          <p style={{ marginBottom: 12 }}>Account data unavailable — {error}</p>
          <button className="buyBtn" onClick={() => void refresh()}>Retry</button>
        </section>
      )}

      {ready && (
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
                  const copies = owned(card.id);
                  const max = ROTATION_MAX(card.rarity);
                  const soldOut = copies >= max;
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
                      <span className="ownedTag">Owned {copies}/{max}</span>
                      <div className="priceRow">
                        <img src="/ui/gold.png" alt="gold" />
                        <s className="wasPrice">{pc.basePrice}</s>
                        <span>{pc.price}</span>
                      </div>
                      <button
                        className={`buyBtn${isDenied ? " shake" : ""}`}
                        data-testid={`deal-${card.id}`}
                        disabled={soldOut || pending === key}
                        onClick={() => void buyRotation(pc, "deal")}
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
                    Owned {owned(daily.freeCard.id)}
                  </span>
                  <div className="priceRow freeRow"><span>On the house</span></div>
                  <button
                    className={`buyBtn${denied?.key === "free-daily" ? " shake" : ""}`}
                    data-testid="claim-free"
                    disabled={freeClaimed || pending === "free-daily"}
                    onClick={() => void claimFree()}
                  >
                    {freeClaimed ? "Claimed today" : "Claim"}
                  </button>
                  {denied?.key === "free-daily" && <div className="denyMsg">{denied.msg}</div>}
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
                  const copies = owned(card.id);
                  const max = ROTATION_MAX(card.rarity);
                  const soldOut = copies >= max;
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
                      <span className="ownedTag">Owned {copies}/{max}</span>
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
                        disabled={soldOut || pending === key}
                        onClick={() => void buyRotation(pc, "weekly")}
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
                        disabled={pending === key}
                        onClick={() => void buyPack(pack)}
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
                const copies = owned(card.id);
                const max = MAX_COPIES(card.rarity);
                const soldOut = copies >= max;
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
                    <span className="ownedTag">Owned {copies}/{max}</span>
                    <div className="priceRow">
                      <img src="/ui/shard.png" alt="shards" />
                      <span>{singlePrice(card.rarity)}</span>
                    </div>
                    <button
                      className={`buyBtn${isDenied ? " shake" : ""}`}
                      data-testid={`buy-single-${card.id}`}
                      disabled={soldOut || pending === key}
                      onClick={() => void buySingle(card)}
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
              {TOPUP_TIERS.map((t) => {
                const isDenied = denied?.key === `topup-${t.shards}`;
                return (
                  <div className={`topupCard${"best" in t && t.best ? " topupBest" : ""}`} key={t.shards}>
                    {"best" in t && t.best && <span className="topupFlag">Best value</span>}
                    <img className="topupIcon" src="/ui/shard.png" alt="" />
                    <b className="topupAmount">+{t.shards} Shards</b>
                    {"label" in t && t.label && <span className="topupLabel">{t.label}</span>}
                    <span className="topupPrice"><s>{t.price}</s><i className="topupFuture">future price</i></span>
                    <button
                      className={`buyBtn${isDenied ? " shake" : ""}`}
                      data-testid={`topup-${t.shards}`}
                      disabled={pending === `topup-${t.shards}`}
                      onClick={() => void topUp(t.shards)}
                    >
                      Claim (demo)
                    </button>
                    {isDenied && <div className="denyMsg">{denied.msg}</div>}
                  </div>
                );
              })}
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

      <SiteFooter />
    </main>
  );
  /* eslint-enable @next/next/no-img-element */
}
