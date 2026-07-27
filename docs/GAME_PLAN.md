# Shardfall — Game Build Plan (v0 "finished playable game" milestone)

Owner doc for the game build. Update as tasks complete.

## Rules (v0)

- Two heroes, 30 HP each. Win by reducing enemy hero to 0.
- Deck: exactly 50 cards, max 3 copies of any card (1 for legendaries).
- Aether (mana): starts at 1, +1 max per turn; from each player's 5th turn the ramp
  accelerates to +2 per turn (cap 10, reached on your 7th turn). Refills each turn.
- Opening hands always contain at least one 1-cost card (worst card swapped for the deck's
  cheapest ≤1-cost card).
- Draw 1/turn; from each player's 5th turn, draw 2/turn (fuel for the faster ramp). Starting hands: first player 4, second player 5. Hand cap 10 (overdraw burns). Empty deck → fatigue (1, 2, 3… damage).
- Board: max 7 units per side. Units can't attack the turn they're played (unless Rush).
- Keywords (locked, from library/world/overview.md): Rush, Guard, Piercing, Lifesteal,
  Arrival (on-play effect), Last Rites (on-death effect), Ignite X (end of your turn: X damage
  to a random enemy), Overgrow (+1/+1 at start of your turn if it survived).

## Effect DSL (agents MUST use only these ops — see lib/game/types.ts)

DAMAGE (target), DAMAGE_ALL_ENEMIES, DAMAGE_RANDOM_ENEMY, DAMAGE_HERO, HEAL_HERO, HEAL_TARGET,
BUFF (target +a/+h), BUFF_ALL_ALLIES, GRANT_KEYWORD_ALLIES, SUMMON (token, count), DRAW,
RETURN_ALL_OTHERS. Target requirements: NONE | ENEMY_UNIT | ANY_UNIT | FRIENDLY_UNIT.

## Card pool (target ~48)

12 per faction (pyre aggro/damage, abyss control/spells/lifesteal, verdant growth/tokens/heal)
+ ~9 neutral + tokens. Costs 0–10, sane Hearthstone-like statlines; each faction gets a
playable mana curve. Data lives in `lib/game/cards-data.ts` (single source for the engine);
every card also gets a library markdown file per the existing template.

## Screens / routes

- `/` main menu (intro animation overlay on first visit, ~10s, skippable) — Play, Tutorial,
  Collection, Store, Gallery (old page moved to /gallery), Studio.
- `/play` match vs AI (query: ?deck=pyre|abyss|verdant&tutorial=1)
- `/store` packs (3 sizes) + featured singles + demo currency top-up
- `/collection` owned cards + starter decks view
- Profile (gold, shards, XP/level, collection, decks) in localStorage — lib/profile.ts.

## Economy / progression (v0)

- Starter: all 3 faction starter decks granted free (cards added to collection).
- Rewards: win 40 gold + 60 XP, loss 15 gold + 25 XP. Level up (100·level XP): +1 pack.
- Store: Small pack 3 cards / 100 gold; Standard 5 / 150 gold; Grand 10 / 280 gold.
  Pack odds: common 68%, rare 22%, epic 8%, legendary 2% (per card).
  Featured singles for shards. Shards for real money = demo button (stub, no payments yet).

## Testing

- Engine unit tests: `scripts/test-engine.mjs` (node, no framework) — keywords, lethal, mana,
  fatigue, AI sanity. Must pass before UI work is "done".
- E2E (puppeteer-core + system Chrome): `scripts/e2e/*.mjs` — menu/intro, full AI match via UI,
  store purchase, tutorial flow. Screenshots to scratchpad for visual review.

## Asset manifest (generated, archived to library/art/history per CLAUDE.md)

- Battlefields: glasswake (have), cinderreach (16:9), sunken-antiphon (16:9) → public/board/
- UI icons (recraft, knocked out): gold coin, aethershard, mana crystal → public/ui/
- Pack art ×3 (small/standard/grand) → public/store/
- Logo emblem (radiant shard) for intro/menu → public/ui/emblem.png
- End-turn button: reuse library/art/tests/ui_recraft-v41.png → public/ui/end-turn.png
- Hero portraits: circle-crops of the three legendary arts (CSS, no new gen).

## Status

- [x] Engine types + DSL
- [x] Engine + AI + tests
- [x] Card pool authored + balanced (workflow)
- [x] Assets generated
- [x] Board UI + animations
- [x] Menu + intro
- [x] Store / Collection / Tutorial
- [x] E2E green + visual QA

---

# v0.2 — ONLINE MILESTONE (in progress)

## Architecture

- **DB**: better-sqlite3 at `data/shardfall.db` (dev). Tables: better-auth's (user/session/account) +
  `players` (userId?, name, isBot, rating, league, gold, shards, xp, level, collection JSON, decks JSON),
  `matches` (id, p0/p1 playerIds, state JSON, seq, status, kind ranked|friendly|campaign|practice,
  turnDeadline, winner, created/updated), `queue` (playerId, rating, since), `friends`,
  `friend_invites`, `campaign_progress` (playerId, nodeId, stars). Swap to Postgres for Vercel deploy.
- **Auth**: better-auth email+password (no verification in dev), routes at /api/auth/[...all],
  /login page. Local guest profile still works; online features require login. On first login the
  localStorage profile is imported into the DB player row.
- **Matches are server-authoritative**: every action → POST /api/match/[id]/action (validated via
  engine `applyAction`, events returned for animation). Opponent turns via polling GET state?since=seq.
  Turn deadline (75s) enforced lazily on every read/write: if expired → auto END_TURN server-side.
  → disconnect/close = resume anytime (match id stored; Continue button on menu). Bots: after the
  human acts, server runs `aiTakeTurn`. This covers PvE, ranked-vs-bot, and PvP identically.
  (Vercel Workflows could later host the timeout sweeps; not required for correctness.)
- **Matchmaking**: POST /api/queue → row in queue; poll GET /api/queue: pair with another queued
  human in rating window (±150, widening); after 15s fallback → create match vs closest-rated BOT
  (isBot player, server plays its turns). Elo K=32 → rating, league recomputed
  (Bronze <1100 ≤ Silver <1300 ≤ Gold <1500 ≤ Diamond <1700 ≤ Legend).
- **Mock population**: seed script creates 10,000 bot players, ~half `playerNNNNNNNN`, half themed
  nicknames, ratings ~N(1200,250) clamped 700–2400 → leagues. Bots are matchmaking opponents.
- **Campaign**: 5 chapters (the ranked zones) × 6 nodes = 30 PvE nodes with themed enemy decks &
  scaling difficulty; first win per node → pack (small→grand by chapter) + gold; replays small gold.
  Free-to-play generous: full campaign ≈ 30 packs + level-up packs.
- **Rarity v2**: common/rare/epic/legendary/**mythic**. Visuals: rarity name-color + frame glow
  (CSS) on all renders; mythic gets its own generated frame variant per faction. Pack odds add
  mythic 0.5% (never in small packs? keep simple: all packs, 0.5%).
- **Pool v2**: +20 cards per faction and +20 neutral (→125 collectible) incl 1 mythic per faction
  + 1 neutral mythic, authored by agents against the DSL, balance-audited.
- **Board dressing**: per-battlefield generated overlay props (left/right hero plinths + center
  feature) knocked out and positioned via CSS.

## Status v0.2

- [x] deps + auth + db + migrations
- [ ] card pool v2 (workflow) + mythic frames + art
- [x] server match layer + API + matchmaking + elo
- [x] seed 10k players
- [x] online play client (ranked/friendly/campaign) + resume + reward screen
- [x] campaign UI + friends UI + login UI
- [x] board dressing assets
- [ ] tests green (engine + api + e2e)
