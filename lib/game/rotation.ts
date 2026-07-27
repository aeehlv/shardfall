/** Shardfall store rotations — deterministic weekly/daily engine.
 *  Pure TS: no React, no IO, no Math.random. Every player computes the same
 *  rotation from the date alone (seeded mulberry32 from day/week indexes). */

import type { FactionId, GameCard, Rarity } from "./types";

/* ---- calendar ------------------------------------------------------------ */

/** Rotation epoch: Monday 2026-07-27 00:00 UTC. Weeks flip on UTC Monday midnight. */
export const EPOCH_START = Date.UTC(2026, 6, 27);

export const DAY_MS = 86_400_000;
export const WEEK_MS = 7 * DAY_MS;

const mod = (n: number, m: number) => ((n % m) + m) % m;

/** Whole days since the epoch (floor — negative before the epoch). */
export function dayIndex(date: Date): number {
  return Math.floor((date.getTime() - EPOCH_START) / DAY_MS);
}

/** Position in the 8-week theme cycle: floor(days/7) % 8. */
export function weekIndex(date: Date): number {
  return mod(Math.floor(dayIndex(date) / 7), WEEK_THEMES.length);
}

/** Absolute week number since the epoch (not wrapped) — seeds weekly picks. */
export function weekNumber(date: Date): number {
  return Math.floor(dayIndex(date) / 7);
}

/* ---- seeded PRNG --------------------------------------------------------- */

/** mulberry32 — tiny deterministic PRNG, uniform in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---- pricing (single source of truth) ------------------------------------ */

export type Currency = "gold" | "shards";

/** THE rarity price table — every store surface derives prices from here. */
export const PRICE: Record<Rarity, { amount: number; currency: Currency }> = {
  common: { amount: 150, currency: "gold" },
  rare: { amount: 400, currency: "gold" },
  epic: { amount: 900, currency: "gold" },
  legendary: { amount: 12, currency: "shards" },
  mythic: { amount: 25, currency: "shards" },
};

/** Weekly featured: 25% off gold prices (shard prices never discount). */
export const WEEKLY_GOLD_DISCOUNT = 0.25;
/** Daily deals: 30% off gold prices. */
export const DAILY_DEAL_DISCOUNT = 0.3;

export interface PricedCard {
  card: GameCard;
  currency: Currency;
  /** undiscounted PRICE amount */
  basePrice: number;
  /** final price after any gold discount */
  price: number;
  /** 0 when no discount applies (all shard-priced cards) */
  discountPct: number;
}

/** Price a card from the PRICE table; goldDiscount (0–1) applies to gold prices only. */
export function priceFor(card: GameCard, goldDiscount = 0): PricedCard {
  const base = PRICE[card.rarity];
  const discounted = base.currency === "gold" && goldDiscount > 0;
  return {
    card,
    currency: base.currency,
    basePrice: base.amount,
    price: discounted ? Math.round(base.amount * (1 - goldDiscount)) : base.amount,
    discountPct: discounted ? Math.round(goldDiscount * 100) : 0,
  };
}

/* ---- week themes (8-week cycle, planned upfront) ------------------------- */

export interface WeekTheme {
  name: string;
  description: string;
  /** pick rule: candidate cards eligible for this week's featured slots */
  pick: (pool: GameCard[]) => GameCard[];
  /** optional guaranteed slots drawn before the main rule (e.g. mythics in showcase week) */
  spotlight?: { pick: (pool: GameCard[]) => GameCard[]; count: number };
}

const collectible = (pool: GameCard[]) => pool.filter((c) => !c.token);
const ofFaction = (f: FactionId) => (pool: GameCard[]) =>
  collectible(pool).filter((c) => c.faction === f);
const ofRarity = (...rs: Rarity[]) => (pool: GameCard[]) =>
  collectible(pool).filter((c) => rs.includes(c.rarity));

/** The full 8-week cycle, in order. weekIndex(date) indexes into this array. */
export const WEEK_THEMES: readonly WeekTheme[] = [
  {
    name: "Forge Week",
    description: "The Emberforge burns hot — Pyre arms and relics fresh from the anvil.",
    pick: ofFaction("pyre"),
  },
  {
    name: "Drowned Vault",
    description: "Salvage dredged from the Abyss — drowned treasures surface for one week.",
    pick: ofFaction("abyss"),
  },
  {
    name: "Verdant Tide",
    description: "The Wildgrove overspills — Verdant growth floods the market stalls.",
    pick: ofFaction("verdant"),
  },
  {
    name: "Relics of Kelvarrow",
    description: "Faction-free antiquities of old Kelvarrow, curated by neutral brokers.",
    pick: ofFaction("neutral"),
  },
  {
    name: "Rare Finds",
    description: "A collector's shelf of rare cards, hand-picked across every faction.",
    pick: ofRarity("rare"),
  },
  {
    name: "Epic Convergence",
    description: "The vault turns its heavier locks — epics align for the taking.",
    pick: ofRarity("epic"),
  },
  {
    name: "Legends of the Epoch",
    description: "The epoch's named legends walk the counter — briefly, and at a price.",
    pick: ofRarity("legendary"),
  },
  {
    name: "Mythic Resonance",
    description: "Mythic and legendary shards sing as one — the rarest showcase of the cycle.",
    pick: ofRarity("mythic", "legendary"),
    spotlight: { pick: ofRarity("mythic"), count: 3 },
  },
] as const;

/* ---- deterministic selection --------------------------------------------- */

/** Seeded Fisher–Yates over id-sorted candidates; backfills from `extra` if short. */
function seededPick(
  candidates: GameCard[],
  n: number,
  rng: () => number,
  extra?: GameCard[],
): GameCard[] {
  const shuffle = (cards: GameCard[]) => {
    const arr = [...cards].sort((a, b) => a.id.localeCompare(b.id));
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  const out = shuffle(candidates).slice(0, n);
  if (out.length < n && extra) {
    const taken = new Set(out.map((c) => c.id));
    for (const c of shuffle(extra.filter((c) => !taken.has(c.id)))) {
      if (out.length >= n) break;
      out.push(c);
    }
  }
  return out;
}

/* ---- weekly rotation ------------------------------------------------------ */

export const WEEKLY_FEATURED_COUNT = 6;

export interface WeeklyRotation {
  theme: WeekTheme;
  /** 0-7 position in the theme cycle */
  weekIndex: number;
  /** ms timestamp of next UTC Monday midnight (week flip) */
  endsAt: number;
  /** 6 collectible cards, priced with the 25% weekly gold discount */
  featured: PricedCard[];
}

export function getWeekly(pool: GameCard[], date: Date): WeeklyRotation {
  const week = weekNumber(date);
  const wi = mod(week, WEEK_THEMES.length);
  const theme = WEEK_THEMES[wi];
  const rng = mulberry32(0x5eedc0de ^ Math.imul(week, 7919));
  const chosen: GameCard[] = theme.spotlight
    ? seededPick(
        theme.spotlight.pick(pool),
        Math.min(theme.spotlight.count, WEEKLY_FEATURED_COUNT),
        rng,
      )
    : [];
  const taken = new Set(chosen.map((c) => c.id));
  chosen.push(
    ...seededPick(
      theme.pick(pool).filter((c) => !taken.has(c.id)),
      WEEKLY_FEATURED_COUNT - chosen.length,
      rng,
      collectible(pool).filter((c) => !taken.has(c.id)),
    ),
  );
  const featured = chosen.map((c) => priceFor(c, WEEKLY_GOLD_DISCOUNT));
  return { theme, weekIndex: wi, endsAt: EPOCH_START + (week + 1) * WEEK_MS, featured };
}

/* ---- daily rotation ------------------------------------------------------- */

export const DAILY_DEAL_COUNT = 3;

export interface DailyRotation {
  /** whole days since epoch — the seed index of this rotation */
  dayIndex: number;
  /** ms timestamp of next UTC midnight (deal flip) */
  endsAt: number;
  /** 3 cards (rarity ≤ epic) at 30% off gold prices */
  deals: PricedCard[];
  /** 1 common — claimable free once per UTC day */
  freeCard: GameCard;
}

export function getDaily(pool: GameCard[], date: Date): DailyRotation {
  const day = dayIndex(date);
  const rng = mulberry32(0xda11dea1 ^ Math.imul(day, 104729));
  const all = collectible(pool);
  const dealPool = all.filter(
    (c) => c.rarity === "common" || c.rarity === "rare" || c.rarity === "epic",
  );
  const deals = seededPick(dealPool, DAILY_DEAL_COUNT, rng, all).map((c) =>
    priceFor(c, DAILY_DEAL_DISCOUNT),
  );
  const dealt = new Set(deals.map((d) => d.card.id));
  const commons = all.filter((c) => c.rarity === "common");
  const freeCandidates = commons.filter((c) => !dealt.has(c.id));
  const freeCard =
    seededPick(freeCandidates.length ? freeCandidates : commons, 1, rng, all)[0];
  return { dayIndex: day, endsAt: EPOCH_START + (day + 1) * DAY_MS, deals, freeCard };
}

/* ---- upcoming teaser ------------------------------------------------------ */

export interface UpcomingWeek {
  /** 0-7 position in the theme cycle */
  weekIndex: number;
  name: string;
  description: string;
  /** ms timestamp when this theme goes live */
  startsAt: number;
}

/** The next `count` week themes (names + descriptions) for the teaser strip. */
export function getUpcoming(_pool: GameCard[], date: Date, count = 3): UpcomingWeek[] {
  const week = weekNumber(date);
  return Array.from({ length: count }, (_, i) => {
    const w = week + 1 + i;
    const wi = mod(w, WEEK_THEMES.length);
    const t = WEEK_THEMES[wi];
    return {
      weekIndex: wi,
      name: t.name,
      description: t.description,
      startsAt: EPOCH_START + w * WEEK_MS,
    };
  });
}
