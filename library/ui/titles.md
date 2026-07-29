# UI Art Prompts — Screen Titles

Shared rules for title artwork (the ONE asset type where lettering is allowed):

- Titles are wide transparent PNGs of engraved-gold fantasy lettering, matching the shipped
  `public/ui/title-leaderboard.png` treatment: massive beveled serif capitals in hammered
  antique gold/bronze, small gem inlays in the letter stems, flanking laurel-and-crown
  flourishes, and a slim tapered gold rule underlining the whole title.
- Generate with `recraft/recraft-v4.1` (it renders lettering reliably) at `1024x1024` — the
  gateway currently rejects other sizes — with the title in a single line across the middle of
  the square canvas on a flat pure black background; knockout + bbox crop yields the wide strip.
- **Verify spelling character-by-character on every attempt; reject any misspelling.** Always
  state the exact wording twice in the prompt (opening clause + closing "reads exactly" clause).
- Archive every generation to `library/art/history/<asset-id>/vNNN.png` before processing.

---

## 1. Warden's Ledger (admin panel header)

**PROMPT:**
The words "WARDEN'S LEDGER" rendered as an ornate fantasy game screen title: massive engraved serif capital letters of hammered antique gold and bronze with beveled edges, small faceted diamond-shaped gem inlays set into the letter stems, and a warm inner glow along the lettering. A small golden laurel sprig flourish topped by a tiny crown and gem flanks the title on each side, and a single slim tapered gold rule line underlines the whole title. The title sits in one single line spanning the full width of the canvas, vertically centered, isolated on a flat pure black background with empty black space above and below, nothing else in frame, a faint warm glow haloing the letters. Painterly digital fantasy illustration, rich saturated metallic color, dramatic cinematic lighting, AAA collectible card game interface art quality. The title reads exactly "WARDEN'S LEDGER" spelled correctly in capital letters, no other text, no watermark, no border, no UI elements.

Shipped: `public/ui/title-wardens-ledger.png` (997x230 transparent knockout of
`library/art/history/title-wardens-ledger/v001.png`; spelling verified exact on v001).
