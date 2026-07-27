# Shardfall — Content Library

Single source of truth for all game content: lore, card definitions, and image-generation prompts. Everything is Markdown for now; card frontmatter is designed to be parsed into the game database later.

## Structure

```
library/
├── world/
│   ├── overview.md      # World lore, the Shattering, Aethershards, keyword glossary,
│   │                    # faction summaries, ranked-zone ladder
│   └── style-guide.md   # Global art direction + reusable image prompt template
├── factions/
│   ├── pyre/            # Pyre Dominion  — aggro/tempo  (ember red / blackened bronze)
│   ├── abyss/           # Abyssal Choir  — control/spells (teal / violet bioluminescence)
│   └── verdant/         # Verdant Compact — growth/swarm  (living green / warm gold)
│       ├── lore.md      # Faction lore: origin, culture, leader, conflict hooks
│       └── cards/       # One .md per card (frontmatter stats + description + flavor + art prompt)
├── battlefields/
│   ├── zones.md         # Ranked ladder: 5 zones, rank ranges, unlocks
│   └── <zone>.md        # Full battlefield spec + 16:9 art prompt
├── ui/
│   ├── buttons.md       # Image prompts for interface buttons (text rendered in HTML, not in art)
│   ├── frames.md        # Card frame overlays per faction/rarity
│   └── icons.md         # Mana crystal, attack/health, currencies, pack icons
└── art/
    ├── tests/           # Model bake-off outputs (kept for reference)
    ├── cards/           # Generated card artwork  <card-id>.png
    └── battlefields/    # Generated battlefield artwork  <zone>.png
```

## Card file format

```markdown
---
id: pyre-001
name: Card Name
faction: pyre | abyss | verdant
type: unit | spell
rarity: common | rare | epic | legendary
cost: 0-10
attack: N        # units only
health: N        # units only
keywords: []     # only keywords from world/overview.md glossary
---

## Description   ← exact rules text shown on the card
## Flavor        ← one-line flavor text
## Art Prompt    ← self-contained image prompt following world/style-guide.md
```

## Image generation

Images are generated through the **Vercel AI Gateway** (`AI_GATEWAY_API_KEY` in `.env`).

- **Card art:** `google/gemini-3.1-flash-image` via `POST /v1/chat/completions`
  (image returned base64 in `choices[0].message.images[0].image_url.url`). ~$0.067/image.
- **UI assets:** `recraft/recraft-v4.1` via `POST /v1/images/generations`
  (`data[0].b64_json`). ~$0.035/image.
- Every art prompt must be fully self-contained (the model sees only that prompt) and end
  with the fixed constraints sentence from the style guide (no text / no watermark / no frame).

Bake-off results and reasoning: see `art/tests/` (2026-07-27; gemini-3.1-flash-image won on
quality, price, and native aspect-ratio adherence; gpt-image-2 dropped — gateway kills its
long-running requests).
