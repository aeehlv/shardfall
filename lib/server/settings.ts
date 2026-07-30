/** Tiny key-value settings store (the `settings` collection, keyed by setting name).
 *
 *  Reads are cached in-process for a short TTL so hot paths (the queue polls every
 *  1.5s per player) don't hammer Mongo; writes bust the cache immediately, so other
 *  warm lambdas pick a change up within one TTL at worst.
 */

import { settingsCol } from "@/lib/server/db";

const CACHE_TTL_MS = 15_000;
const cache = new Map<string, { value: unknown; at: number }>();

/** Read a setting, falling back when unset. Cached in-process for 15s. */
export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value as T;
  const doc = await (await settingsCol()).findOne({ _id: key });
  const value = doc !== null ? (doc.value as T) : fallback;
  cache.set(key, { value, at: Date.now() });
  return value;
}

/** Write a setting and bust the local cache. */
export async function setSetting(key: string, value: unknown): Promise<void> {
  await (await settingsCol()).updateOne(
    { _id: key },
    { $set: { value, updatedAt: Date.now() } },
    { upsert: true },
  );
  cache.delete(key);
}

// ---------------------------------------------------------------- matchmaking --

const BOT_WAIT_KEY = "matchmaking.botWaitMs";
const BOT_WAIT_DEFAULT_MS = 5_000;

/** Whole seconds only — the admin UI edits seconds, and snapping on read keeps
 *  legacy fractional values (old UI allowed 0.5s steps) consistent with what
 *  the panel displays. */
export const clampBotWaitMs = (ms: number) =>
  Math.min(60_000, Math.max(1_000, Math.round(ms / 1_000) * 1_000));

/** How long a ranked ticket waits for a human before falling back to a bot. */
export async function getBotWaitMs(): Promise<number> {
  const raw = Number(await getSetting<number>(BOT_WAIT_KEY, BOT_WAIT_DEFAULT_MS));
  return Number.isFinite(raw) ? clampBotWaitMs(raw) : BOT_WAIT_DEFAULT_MS;
}

/** Clamp, persist and return the saved bot-fallback wait. */
export async function setBotWaitMs(ms: number): Promise<number> {
  const clamped = clampBotWaitMs(ms);
  await setSetting(BOT_WAIT_KEY, clamped);
  return clamped;
}
