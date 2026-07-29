/** Server-authoritative store. Pack contents, rotations, deal math, and pricing
 *  come from shared lib/game modules (packs|rotation|hotdeals|store-pricing),
 *  so the UI renders from the same source the server charges from. */

import type { Filter } from "mongodb";
import { playersCol, type PlayerDoc } from "./db";
import { claimDailyCounter, creditWallet, debitWallet, logTxn } from "./players";
import { PACKS, rollPack } from "@/lib/game/packs";
import { DAY_MS, EPOCH_START, getDaily, getWeekly, type PricedCard } from "@/lib/game/rotation";
import { getHotDeals } from "@/lib/game/hotdeals";
import { CARD_POOL } from "@/lib/game/pool";
import {
  FEATURED_IDS, MAX_COPIES, ROTATION_MAX, singlePrice, TOPUP_TIERS,
} from "@/lib/game/store-pricing";

/** Purchase failure the API layer maps onto a response: 400 invalid, 409 denied. */
export class StoreError extends Error {
  status: 400 | 409;
  constructor(message: string, status: 400 | 409) {
    super(message);
    this.status = status;
  }
}

export interface StoreResult {
  wallet: { gold: number; shards: number };
  cards?: string[];
  packs?: Record<string, number>;
}

const TOPUPS_PER_DAY = 3;

const wallet = (doc: PlayerDoc) => ({ gold: doc.gold, shards: doc.shards });

async function playerDoc(playerId: number): Promise<PlayerDoc> {
  const doc = await (await playersCol()).findOne({ _id: playerId });
  if (!doc) throw new StoreError("No player", 400);
  return doc;
}

async function grantCards(playerId: number, ids: string[]): Promise<void> {
  const inc: Record<string, number> = {};
  for (const id of ids) inc[`collection.${id}`] = (inc[`collection.${id}`] ?? 0) + 1;
  await (await playersCol()).updateOne({ _id: playerId }, { $inc: inc });
}

/** Atomic single-card purchase: one guarded write requires sufficient funds AND
 *  a collection count below `cap`, then debits and grants the copy together —
 *  concurrent buys can never exceed the copy limit. Ledger row on success only.
 *  Null on miss (funds or cap — caller distinguishes for the error message). */
async function buyCardAtomic(
  playerId: number,
  cost: { gold?: number; shards?: number },
  cardId: string,
  cap: number,
  txn: { kind: string; meta?: Record<string, unknown> },
): Promise<PlayerDoc | null> {
  const owned = `collection.${cardId}`;
  const doc = await (await playersCol()).findOneAndUpdate(
    {
      _id: playerId,
      ...(cost.gold ? { gold: { $gte: cost.gold } } : {}),
      ...(cost.shards ? { shards: { $gte: cost.shards } } : {}),
      $or: [{ [owned]: { $exists: false } }, { [owned]: { $lt: cap } }],
    } as Filter<PlayerDoc>,
    {
      $inc: {
        ...(cost.gold ? { gold: -cost.gold } : {}),
        ...(cost.shards ? { shards: -cost.shards } : {}),
        [owned]: 1,
      },
    },
    { returnDocument: "after" },
  );
  if (!doc) return null;
  const currency = cost.gold ? "gold" : "shards";
  await logTxn(playerId, {
    kind: txn.kind,
    currency,
    amount: -(cost.gold ?? cost.shards ?? 0),
    itemId: cardId,
    balanceAfter: currency === "gold" ? doc.gold : doc.shards,
    meta: txn.meta,
  });
  return doc;
}

/** Copy-cap vs funds: re-read after a denied atomic buy to pick the message. */
async function denialReason(
  playerId: number, cardId: string, cap: number, currency: "gold" | "shards",
): Promise<StoreError> {
  const owned = (await playerDoc(playerId)).collection?.[cardId] ?? 0;
  if (owned >= cap) return new StoreError("Copy limit reached", 409);
  return new StoreError(currency === "gold" ? "Not enough gold" : "Not enough shards", 409);
}

/** Buy a pack with gold — opens instantly, like the store UI. */
export async function buyPack(playerId: number, size: string): Promise<StoreResult> {
  const pack = PACKS.find((p) => p.id === size);
  if (!pack) throw new StoreError("Unknown pack", 400);
  const cards = rollPack(CARD_POOL, pack.cards);
  const doc = await debitWallet(playerId, { gold: pack.gold }, {
    kind: "pack_purchase", itemId: pack.id, meta: { cards },
  });
  if (!doc) throw new StoreError("Not enough gold", 409);
  await grantCards(playerId, cards);
  return { wallet: wallet(doc), cards };
}

/** Buy a fixed featured single with shards. */
export async function buySingle(playerId: number, cardId: string): Promise<StoreResult> {
  if (!FEATURED_IDS.includes(cardId)) throw new StoreError("Not a featured single", 400);
  const card = CARD_POOL.find((c) => c.id === cardId);
  if (!card) throw new StoreError("Unknown card", 400);
  const cap = MAX_COPIES(card.rarity);
  const doc = await buyCardAtomic(
    playerId, { shards: singlePrice(card.rarity) }, cardId, cap, { kind: "single_purchase" },
  );
  if (!doc) throw await denialReason(playerId, cardId, cap, "shards");
  return { wallet: wallet(doc), cards: [cardId] };
}

/** Buy a rotation card (daily deal / weekly featured) at its listed price. */
export async function buyRotation(playerId: number, cardId: string): Promise<StoreResult> {
  const now = new Date();
  const daily = getDaily(CARD_POOL, now);
  const weekly = getWeekly(CARD_POOL, now);
  const pc: PricedCard | undefined =
    daily.deals.find((d) => d.card.id === cardId) ??
    weekly.featured.find((f) => f.card.id === cardId);
  if (!pc) throw new StoreError("Not on rotation", 400);
  const cap = ROTATION_MAX(pc.card.rarity);
  const doc = await buyCardAtomic(
    playerId,
    pc.currency === "gold" ? { gold: pc.price } : { shards: pc.price },
    cardId,
    cap,
    { kind: "rotation_purchase", meta: { basePrice: pc.basePrice, discountPct: pc.discountPct } },
  );
  if (!doc) throw await denialReason(playerId, cardId, cap, pc.currency);
  return { wallet: wallet(doc), cards: [cardId] };
}

/** Claim the free daily common — once per UTC day, tracked on the player doc. */
export async function claimDailyFree(playerId: number): Promise<StoreResult> {
  const nowMs = Date.now();
  const daily = getDaily(CARD_POOL, new Date(nowMs));
  const dayStart = EPOCH_START + daily.dayIndex * DAY_MS;
  const cardId = daily.freeCard.id;
  const doc = await (await playersCol()).findOneAndUpdate(
    {
      _id: playerId,
      $or: [{ lastFreeClaim: { $exists: false } }, { lastFreeClaim: { $lt: dayStart } }],
    },
    { $set: { lastFreeClaim: nowMs }, $inc: { [`collection.${cardId}`]: 1 } },
    { returnDocument: "after" },
  );
  if (!doc) throw new StoreError("Already claimed today", 409);
  await logTxn(playerId, { kind: "daily_free", currency: null, amount: 0, itemId: cardId });
  return { wallet: wallet(doc), cards: [cardId] };
}

/** Buy a menu hot-deal pack — recomputed server-side, opens instantly. */
export async function buyHotDeal(playerId: number, dealId: string): Promise<StoreResult> {
  const deal = getHotDeals(Date.now()).find((d) => String(d.slot) === dealId);
  if (!deal) throw new StoreError("Unknown deal", 400);
  const cards = rollPack(CARD_POOL, deal.pack.cards);
  const doc = await debitWallet(playerId, { shards: deal.price }, {
    kind: "hot_deal", itemId: deal.pack.id,
    meta: { slot: deal.slot, discountPct: deal.discountPct, cards },
  });
  if (!doc) throw new StoreError("Not enough shards", 409);
  await grantCards(playerId, cards);
  return { wallet: wallet(doc), cards };
}

/** Demo shard top-up (no payment yet) — capped per UTC day by an atomic counter
 *  on the player doc, claimed before any credit. */
export async function topUpDemo(playerId: number, tierId: string): Promise<StoreResult> {
  const shards = Number(tierId);
  if (!TOPUP_TIERS.some((t) => t.shards === shards)) {
    throw new StoreError("Unknown top-up tier", 400);
  }
  const ok = await claimDailyCounter(playerId, "topupDay", "topupCount", TOPUPS_PER_DAY);
  if (!ok) throw new StoreError("Daily top-up limit reached", 409);
  const doc = await creditWallet(playerId, { shards }, { kind: "topup_demo", itemId: tierId });
  return { wallet: wallet(doc) };
}
