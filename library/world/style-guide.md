# Shardfall — Global Art Direction Bible

**World:** Kelvarrow · applies to all card art, battlefield art, and key art unless a document explicitly overrides it.

---

## 1. Overall Style

**Painterly digital fantasy.** Every asset should look like a AAA card-game splash illustration: rich, saturated color; confident, visible brushstrokes; dramatic, directional lighting with strong value contrast; a clear focal point that reads at thumbnail size. Edges are painted, not traced — crisp where the eye should land, loose and gestural elsewhere. Think hand-painted concept art quality, not photo-bash, not 3D render.

**Universal rules**

- One clear focal subject per image. Strong silhouette first; detail second.
- Push lighting for drama: rim light, glow sources, deep shadow shapes. Aethershard light (warm crystalline radiance) is a recurring light source across all factions.
- Color is faction identity (see cheat-sheet below). Backgrounds may borrow accent colors, but the faction palette must dominate.
- Detail density concentrates at the focal point and falls off toward edges.

**Explicitly forbidden in all artwork**

- NO text, lettering, runes-as-readable-writing, numbers, logos, signatures, or watermarks inside the artwork.
- NO borders, frames, card frames, vignette boxes, or UI elements painted into the artwork. Frames are applied by the game UI, never by the illustration.
- NO photorealism (no photographic rendering, no photo textures, no "octane render" hyperrealism).
- NO flat vector / cel-shaded / sticker style for card art.

---

## 2. Card Art Spec

- **Aspect ratio:** portrait **3:4** (e.g., 1536×2048).
- **Composition:** subject centered horizontally, focal mass in the upper-middle of the frame, with **headroom above the subject** — the game UI overlays a card frame, name plate, and stat gems on the art, so nothing critical may touch the outer ~10% of any edge.
- Single dominant subject (character, creature, or spell effect). Supporting elements stay smaller and darker.
- Background supports, never competes: atmospheric, softer brushwork, lower contrast than the subject.
- Must read instantly at ~200px tall: silhouette, faction color, and action pose are the priority.

## 3. Battlefield Art Spec

- **Aspect ratio:** landscape **16:9** (e.g., 2560×1440).
- **Readable middle band:** the horizontal center band (roughly the middle 50% of frame height) is where card rows sit during play. Keep it compositionally calm — even value, low detail contrast, no bright focal shapes. Landmarks, drama, and detail belong in the upper third (vista, sky, architecture) and lower edge (foreground framing).
- **Atmospheric depth is mandatory:** distinct foreground / midground / background planes separated by aerial perspective (haze, value shift, color temperature shift).
- No characters as focal points — battlefields are stages, not scenes. Environmental storytelling only (ruins, shard formations, faction architecture).

---

## 4. Faction Palette & Motif Cheat-Sheet

### Pyre Dominion (`pyre`)
- **Palette:** ember red, molten orange-gold highlights, blackened bronze, charcoal and slag-grey darks.
- **Light:** forge-glow from below; sparks; magma seams; heat shimmer.
- **Motifs:** hammered bronze armor, anvils and crucibles, caldera rock, poured metal, legion banners of riveted plate, magmatic war-beasts, the Great Crucible's furnace-light on every horizon.
- **Feel:** martial, industrial, zealous. Everything looks forged, heavy, and slightly too hot to touch.

### Abyssal Choir (`abyss`)
- **Palette:** deep teal, violet bioluminescence, black-blue abyssal darks, pale glowing cyan accents.
- **Light:** self-luminous — glowing eyes, lantern-organs, shard-light refracted through water; god-rays from far above.
- **Motifs:** drowned cathedral-trenches, coral-grown stone, robed many-eyed clergy, choir formations, floating shards trailing ripples of visible song (painted as light, never as readable symbols), pressure and depth.
- **Feel:** solemn, eerie, hypnotic. Slow grace under crushing dark.

### Verdant Compact (`verdant`)
- **Palette:** living green in many values, warm gold light, rich bark browns, blossom and moss accents.
- **Light:** dappled golden sunlight through canopy; gold light glowing in bark rings and root-veins.
- **Motifs:** colossal grafted roots stitching broken land, shards sprouting like seeds, forest-spirits with gold-ringed bark, druid circles, beast-kin herds, new growth over ruins, abundance and repair.
- **Feel:** alive, generous, unstoppable. Every image should look like it is still growing.

---

## 5. ART PROMPT TEMPLATE

Fill the four labeled slots, then append the fixed style tail sentence, then the fixed closing constraints sentence. Do not reorder or omit parts.

```
[SUBJECT & ACTION] — who or what, doing what, in one vivid clause.
[FACTION PALETTE & MOTIFS] — colors and 2–3 motifs from the cheat-sheet above.
[BACKGROUND] — where, kept atmospheric and subordinate to the subject.
[LIGHTING & MOOD] — key light source, direction, emotional tone.
Painterly digital fantasy illustration, rich saturated color, confident visible brushstrokes, dramatic cinematic lighting, AAA collectible card game splash art quality.
Portrait 3:4 aspect ratio. No text, no lettering, no watermark, no border, no card frame.
```

**Fixed style tail sentence (always verbatim):**
"Painterly digital fantasy illustration, rich saturated color, confident visible brushstrokes, dramatic cinematic lighting, AAA collectible card game splash art quality."

**Fixed closing constraints sentence — cards (always verbatim):**
"Portrait 3:4 aspect ratio. No text, no lettering, no watermark, no border, no card frame."

**Fixed closing constraints sentence — battlefields (always verbatim):**
"Landscape 16:9 aspect ratio, calm readable middle band for gameplay. No text, no lettering, no watermark, no border, no card frame."

### Example Prompt 1 — Pyre unit card ("Crucible Vanguard")

A towering slag-knight in hammered blackened-bronze plate charges forward, molten metal streaming from the seams of her armor as she swings a two-handed forge-hammer. Ember red and molten orange-gold palette with blackened bronze; motifs of poured metal, riveted legion plate, and magma seams glowing through armor joints. Background of caldera-land battlements dissolving into smoke and furnace haze, the distant Great Crucible glowing on the horizon. Lit from below by forge-glow with sparks swirling upward, fierce and zealous mood. Painterly digital fantasy illustration, rich saturated color, confident visible brushstrokes, dramatic cinematic lighting, AAA collectible card game splash art quality. Portrait 3:4 aspect ratio. No text, no lettering, no watermark, no border, no card frame.

### Example Prompt 2 — Abyss spell card ("Shard-Hymn of Unmaking")

A many-eyed robed cantor of the drowned Choir floats mid-water with arms spread, a constellation of glowing Aethershards orbiting her as visible ripples of songlight unravel an enemy spell into drifting motes. Deep teal and violet bioluminescence palette with pale cyan accents; motifs of coral-grown cathedral stone, choir vestments, and shard-light refracting through dark water. Background of a vast sunken cathedral-trench fading into abyssal black, faint god-rays falling from far above. Self-luminous lighting from the shards and her glowing eyes, solemn hypnotic mood. Painterly digital fantasy illustration, rich saturated color, confident visible brushstrokes, dramatic cinematic lighting, AAA collectible card game splash art quality. Portrait 3:4 aspect ratio. No text, no lettering, no watermark, no border, no card frame.

---

## Amendment (2026-07-27): frame v1 layout, window ratios, uniform description box

Cards are **3:4 portrait**. Final frames (in `library/art/ui/`): `frame_pyre_v7.png` and
`frame_abyss_v8.png` (v1 frames with the title band pixel-shifted down to the two-thirds line;
abyss also had its description panel interior cleaned to plain leather via Gemini edit), and
`frame_verdant_v7.png` (v4 with the pill top pixel-trimmed). Unified layout: art fills the top
~60%, title plate interior ~61–71%, description text at the shared RULES_BOX. Card names always
break into two lines at the comma (code-enforced).
Later attempts to unify the frames via image edits (v2/v3) and a fully modular parts system
(`library/art/ui/parts/`) were rejected — the v1 frames' look wins; consistency is enforced in code.

Layout rules (see `lib/cards.ts`):
- The **description text box is identical on every card**: `RULES_BOX = [21%, 75%, 58%, 16.5%]` —
  the largest box that fits inside all three frames' leather panels.
- Name boxes are per-frame (each seated on that frame's banner graphic) with per-frame font size.
- Card art is generated/outpainted to each frame's window ratio, then pre-cropped exactly:

| Faction | Window aspect (w/h) | Closest gen ratio | Pre-crop target |
|---------|--------------------|-------------------|-----------------|
| pyre    | 1.128 (near-square)| 1:1               | 1.128 |
| abyss   | 1.217 (near-square)| 5:4               | 1.217 |
| verdant | 0.931 (near-square, v4 frame)| 1:1    | 0.931 |

Compose with no critical detail in the outer ~4% of any edge (the frame lip overlaps the window).
