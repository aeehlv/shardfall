# Shardfall — Hearthstone-like browser CCG (Next.js, Vercel)

## Next.js version warning (from create-next-app)

This project uses a Next.js version that may be newer than your training data — APIs, conventions,
and file structure may differ. Read the relevant guide in `node_modules/next/dist/docs/` before
writing framework-touching code. Heed deprecation notices.

## Commands

- `npm run dev` — dev server. Ports 3000/3001 are often taken by the user's other projects; the
  server auto-falls back (last known port: 3800). Always check the actual port in the output.
- `npm run build` / `npx tsc --noEmit` — build / typecheck.
- `node scripts/verify-cards.mjs` — headless-Chrome smoke test of the card gallery (hover tilt +
  flip), screenshots land in the session scratchpad. Update its URL port if the dev port changed.

## What this is

Turn-based PvP/PvE collectible card game ("Shardfall", world of Kelvarrow). Currently implemented:
the card gallery at `/` (three legendary cards with 3D tilt + click-to-flip) and the Card Studio
at `/studio` (regenerate any card asset with `google/gemini-3.1-flash-image` by editing prompts;
versioned iteration; saves auto-backup and auto-knockout frames).

## Content & asset pipeline (important)

- `library/` is the single source of truth for ALL game content: world lore + keyword glossary
  (`world/overview.md`), art direction + prompt templates (`world/style-guide.md`), factions and
  per-card markdown (stats frontmatter + rules + flavor + self-contained art prompt), battlefields,
  and UI prompt sheets (`ui/frames.md` holds the PROVEN frame-generation recipe — new frames must
  be generated with that layout clause and pipeline).
- Images are generated through the **Vercel AI Gateway** (`AI_GATEWAY_API_KEY` in `.env`):
  card/battlefield art via `google/gemini-3.1-flash-image` (chat/completions, image returned
  base64), UI assets via `recraft/recraft-v4.1` (images/generations). Library originals in
  `library/art/`, web-ready versions in `public/cards/` and `public/board/`.
- Frames ship as PNGs whose black portrait window is flood-filled to transparency; card art slides
  underneath at coordinates measured from the frame. Card art is pre-cropped to each frame's exact
  window ratio (table in `world/style-guide.md`) so the browser never crops it.
- `lib/cards.ts` holds card data + per-frame layout coords (art window, name box, gem sockets) and
  the shared `RULES_BOX` (description text box — identical position/size on every card).
  Card names containing a comma always render as two lines, breaking at the comma (GameCard.tsx).
- **Generation history (mandatory)**: EVERY generated image is archived at generation time to
  `library/art/history/<asset-id>/vNNN.png` (simple incrementing versions, nothing ever deleted).
  The Studio's generate API does this automatically; any ad-hoc generation script must do the
  same before further processing. `public/cards/.backups/` additionally keeps files replaced by
  Studio saves.
- Frame geometry rules live in `library/ui/frames.md`. Key lesson: image models won't reliably
  nudge frame geometry via edit prompts — fix geometry deterministically (numpy band-shift
  surgery), use Gemini edits only for texture/content changes (e.g. cleaning a panel interior).
- Shipped frame files: `library/art/ui/frame_pyre_v7.png`, `frame_abyss_v8.png`,
  `frame_verdant_v7.png` (older versions kept alongside for history).

## Game (v0 — playable vs AI)

- Design doc: `docs/GAME_PLAN.md` (rules, DSL, economy, testing strategy).
- Engine: `lib/game/` — pure deterministic TS (types.ts = contract + effect DSL, engine.ts,
  ai.ts, decks.ts, cards-data.ts = the 50-card pool, pool.ts registers it). Never put React or
  IO in the engine. All card effects MUST use the DSL ops in types.ts.
- Screens: `/` menu (+ ~10s intro overlay, first visit), `/play` match vs AI (`?deck=`,
  `?tutorial=1`), `/store`, `/collection`, `/gallery` (showcase), `/studio` (asset editor).
- Profile/economy: `lib/profile.ts`, localStorage only (no server/auth yet — PvP and payments
  are future milestones). Starter decks granted on first menu load.
- Card art for the game pool: `public/cards/art/game/<id>.jpg` (640w), generated from each
  card's `artPrompt` field (kept in cards-data.ts).
- `lib/frames.ts` — frame registry (faction → frame PNG + layout, incl. the neutral stone frame);
  `components/play/FramedCard.tsx` renders any card in full ornate frame (zoom/reveal in matches,
  collection grid + lightbox, store singles/pack reveals). 9-slice generated buttons
  (`public/ui/btn-gold.png`, `btn-dark.png`) skin all buttons via border-image. Boards are
  2848×1600 (seedream-4.5, `size:"2K"`, `providerOptions.bytedance.watermark:false`); the menu
  uses its own key art (`public/ui/menu-bg.jpg`) + wordmark (`public/ui/wordmark.png`).
- Tests: `npx tsx scripts/test-engine.ts` (engine unit tests) and `node scripts/e2e/0*.mjs`
  (menu/match/store/tutorial against the dev server — check its port first). Both suites must
  pass after gameplay changes.

## Conventions

- The user reviews visually and iterates in small steps — verify layout changes with a headless
  Chrome screenshot + zoomed crop before declaring done.
- Never bake text into artwork; all card text is HTML overlaid via percent-positioned boxes.
- Premium currency is Aethershards (lore-integrated); soft currency is gold.
