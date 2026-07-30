/** Effective store pricing — hardcoded defaults merged with admin overrides,
 *  persisted in the settings store under one key. The server store charges from
 *  here and /api/store/catalog serves it, so the UI always shows what's charged. */

import type { Rarity } from "@/lib/game/types";
import { PACKS } from "@/lib/game/packs";
import {
  RARITIES, TOPUP_TIERS, defaultCatalog, type StoreCatalog,
} from "@/lib/game/store-pricing";
import { getSetting, setSetting } from "@/lib/server/settings";

const PRICING_KEY = "store.pricing";
/** Sanity cap on any admin-set price. */
const MAX_PRICE = 1_000_000;

/** Stored override sets — sparse; only overridden keys appear. */
export interface PricingOverrides {
  /** pack id -> gold price */
  packs?: Record<string, number>;
  /** rarity -> featured-single shard price */
  singles?: Partial<Record<Rarity, number>>;
  /** tier shards (stringified) -> displayed EUR price */
  topups?: Record<string, number>;
}

/** Admin patch — partial; `null` removes an override (single key or whole section). */
export interface PricingPatch {
  packs?: Record<string, number | null> | null;
  singles?: Partial<Record<Rarity, number | null>> | null;
  topups?: Record<string, number | null> | null;
}

/** Invalid override value — the API layer maps this onto a 400. */
export class PricingError extends Error {}

const PACK_IDS = new Set<string>(PACKS.map((p) => p.id));
const TOPUP_KEYS = new Set(TOPUP_TIERS.map((t) => String(t.shards)));
const RARITY_SET = new Set<string>(RARITIES);

/** Positive, capped, finite — and a whole number for gold/shard prices. */
const isValidPrice = (v: unknown, integer: boolean): v is number =>
  typeof v === "number" && Number.isFinite(v) && v > 0 && v <= MAX_PRICE &&
  (!integer || Number.isInteger(v));

/** Defensive read of stored overrides: keep only known keys with valid values. */
function sanitize(raw: unknown): PricingOverrides {
  const src = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const pick = (
    value: unknown, keyOk: (k: string) => boolean, integer: boolean,
  ): Record<string, number> | undefined => {
    if (typeof value !== "object" || value === null) return undefined;
    const entries = Object.entries(value as Record<string, unknown>).filter(
      (e): e is [string, number] => keyOk(e[0]) && isValidPrice(e[1], integer),
    );
    return entries.length ? Object.fromEntries(entries) : undefined;
  };
  const out: PricingOverrides = {};
  const packs = pick(src.packs, (k) => PACK_IDS.has(k), true);
  const singles = pick(src.singles, (k) => RARITY_SET.has(k), true);
  const topups = pick(src.topups, (k) => TOPUP_KEYS.has(k), false);
  if (packs) out.packs = packs;
  if (singles) out.singles = singles as Partial<Record<Rarity, number>>;
  if (topups) out.topups = topups;
  return out;
}

const fmtEur = (n: number) => `${n.toFixed(2)} €`;

/** Pure merge: defaults with overrides applied. */
function effectiveFrom(o: PricingOverrides): StoreCatalog {
  const base = defaultCatalog();
  return {
    packs: base.packs.map((p) => ({ ...p, gold: o.packs?.[p.id] ?? p.gold })),
    singles: Object.fromEntries(
      RARITIES.map((r) => [r, o.singles?.[r] ?? base.singles[r]]),
    ) as Record<Rarity, number>,
    topups: base.topups.map((t) => {
      const price = o.topups?.[String(t.shards)];
      return price !== undefined ? { ...t, price: fmtEur(price) } : t;
    }),
  };
}

/** Currently stored (sanitized) overrides. */
export async function getPricingOverrides(): Promise<PricingOverrides> {
  return sanitize(await getSetting<unknown>(PRICING_KEY, {}));
}

/** Effective pricing: defaults + overrides. Everything the store charges/shows. */
export async function getEffectivePricing(): Promise<StoreCatalog> {
  return effectiveFrom(await getPricingOverrides());
}

/** Merge one patch section into its stored counterpart. Unknown keys are
 *  ignored; invalid values throw; null clears (key or, at the top, section). */
function mergeSection(
  current: Record<string, number> | undefined,
  patch: Record<string, number | null> | null | undefined,
  keyOk: (k: string) => boolean,
  integer: boolean,
  name: string,
): Record<string, number> | undefined {
  if (patch === undefined) return current;
  if (patch === null) return undefined;
  if (typeof patch !== "object" || Array.isArray(patch)) {
    throw new PricingError(`Invalid ${name} overrides`);
  }
  const out = { ...(current ?? {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (!keyOk(k)) continue;
    if (v === null) { delete out[k]; continue; }
    if (!isValidPrice(v, integer)) throw new PricingError(`Invalid ${name} price for "${k}"`);
    out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

/** Validate a partial patch, merge it into the stored overrides, persist, and
 *  return the resulting overrides + effective pricing. */
export async function setPricingOverrides(
  patch: PricingPatch,
): Promise<{ effective: StoreCatalog; overrides: PricingOverrides }> {
  const current = await getPricingOverrides();
  const overrides: PricingOverrides = {};
  const packs = mergeSection(current.packs, patch.packs, (k) => PACK_IDS.has(k), true, "packs");
  const singles = mergeSection(
    current.singles as Record<string, number> | undefined,
    patch.singles as Record<string, number | null> | null | undefined,
    (k) => RARITY_SET.has(k), true, "singles",
  );
  const topups = mergeSection(current.topups, patch.topups, (k) => TOPUP_KEYS.has(k), false, "topups");
  if (packs) overrides.packs = packs;
  if (singles) overrides.singles = singles as Partial<Record<Rarity, number>>;
  if (topups) overrides.topups = topups;
  await setSetting(PRICING_KEY, overrides);
  return { effective: effectiveFrom(overrides), overrides };
}
