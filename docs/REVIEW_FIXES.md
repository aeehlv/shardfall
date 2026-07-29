# Review fixes — external review (RU), 2026-07-29

Point-by-point mapping of the external review's complaints to what was implemented. All items
are live on main: `npx tsc --noEmit` clean, engine tests 28/28, `npm run build` green.

## 1. Battle crashes / lost matches

- Matches are server-side rows with an append-only event log (`lib/server/match.ts`,
  `matches` + `match_events` collections in `lib/server/db.ts`). A client reload or crash
  resumes from the server snapshot; nothing lives only in browser memory.
- One active match per kind (ranked via the queue, one campaign run, one friendly), surfaced
  as `activeMatches` in `usePlayer()`
  (`lib/player-context.tsx`) so the client always knows about, and can rejoin, an in-flight
  match.
- Matchmaking is atomic: `/api/queue` pairs two queued players in a single guarded operation
  (`queue` collection), so a player cannot be paired into two matches or paired twice.
- Turn deadlines are enforced server-side (`enforceDeadlines`, `TURN_MS` in
  `lib/server/match.ts`); stalled opponents cannot hang a match. Explicit `resign` and
  `abandonMatch` paths finish matches cleanly, and API errors return typed 4xx responses
  instead of crashing the client.

## 2. Wallet desync (gold/shards showing different values across screens)

- Single source of truth: the server player document. All wallet mutations go through
  `creditWallet` / `debitWallet` in `lib/server/players.ts` — atomic MongoDB updates that
  return the fresh document (debit fails, returning null, on insufficient funds; no
  read-modify-write races).
- Wallet-touching endpoints return enough to resync: `/api/store/buy`, `/api/store/topup`
  and `/api/practice/finish` return the updated wallet directly; match finish and campaign
  rewards return reward deltas, and `/api/packs/open` returns the cards + remaining packs —
  after those the client refetches via `refresh()`. The shared `PlayerProvider`
  (`lib/player-context.tsx`, mounted in `app/layout.tsx`) holds the client copy, and
  `WalletBar` renders it identically on every screen (the campaign page additionally fetches
  its own `/api/me` wallet snapshot for its reward summary).
- Every change is recorded in the `transactions` ledger (`transactionsCol` in
  `lib/server/db.ts`) with kind, currency, amount, and `balanceAfter` — desyncs are auditable
  after the fact.
- `lib/profile.ts` (localStorage) remains only as the guest fallback for users without an
  account; it never backs a signed-in wallet.

## 3. No way to acquire gold / unclear economy

- Earn paths: match rewards (`match_reward`), campaign chapter rewards (`campaign_reward`),
  practice rewards via POST `/api/practice/finish` (daily-capped, 409 past the cap;
  `practice_reward`), and the store's daily free claim (`daily_free`).
- Demo top-ups: POST `/api/store/topup` with fixed tiers (`TOPUP_TIERS` in
  `lib/server/store.ts`), clearly labeled as demo top-ups in the UI and logged as
  `topup_demo` — no real payments are taken.
- Dev grants exist only behind `DEMO_GRANTS=1` (POST `/api/dev/grant`, capped at 5 per kind
  per day).

## 4. No admin panel

- `/admin`: stats, player list, and manual grants. Access is gated on the `ADMIN_EMAILS`
  env allowlist (comma-separated); non-listed accounts get no data. Admin grants are logged
  to the ledger as `admin_grant`.

## 5. No account page / purchase history

- `/account`: identity (name, email), progression (rating, league, level/XP, wins/losses),
  wallet, and purchase history rendered from GET `/api/me/transactions` (newest first,
  up to 200 entries) — the same ledger described in section 2.

## 6. Missing policies

- `/privacy`, `/terms`, `/refunds` (styled by `app/legal.css`), linked from
  `components/SiteFooter.tsx` on the logged-out landing page.

## Hardening beyond the review

- Atomic wallet operations: all debits go through guarded atomic ops (fail on insufficient
  funds), and credits are atomic increments with ledger rows (`lib/server/players.ts`).
- Guest import at login is one-time (`imported` flag) and clamped, so a tampered
  localStorage profile cannot mint arbitrary currency or cards on the server.
- `/api/dev/grant` is disabled unless `DEMO_GRANTS=1` and rate-limited per kind per day.
- The Card Studio (`/studio` + its generate/save APIs) is gated behind `STUDIO_ENABLED`
  so production users cannot reach asset-generation endpoints.
- `BETTER_AUTH_SECRET` was replaced with a strong random secret; auth runs through
  better-auth (`lib/auth.ts`) with its session handling rather than hand-rolled cookies.
