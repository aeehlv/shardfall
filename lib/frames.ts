/** Frame registry: faction → frame overlay + layout, for rendering any card in full frame. */

import { CARDS, RULES_BOX, type CardLayout } from "@/lib/cards";

export interface FrameDef {
  frame: string;
  layout: CardLayout;
  /** rules text box override (defaults to the shared RULES_BOX) */
  rules?: readonly [number, number, number, number];
}

export const FRAMES: Record<string, FrameDef> = Object.fromEntries(
  CARDS.map((c) => [c.faction, { frame: c.frame, layout: c.layout }]),
);

/** Neutral stone frame — generated from the canonical layout clause in library/ui/frames.md.
 *  Window bbox measured after generation (see scripts in session history). */
FRAMES.neutral = {
  frame: "/cards/frames/neutral.png",
  layout: {
    art: [12.6, 10.0, 74.7, 46.4],
    name: [14, 56.0, 72, 5.5],
    nameSize: 3.4,
    mana: [13, 7],
    attack: [13, 92.5],
    health: [87, 92.5],
    rarity: [87, 7],
  },
  rules: [16, 66.5, 68, 21],
};

export { RULES_BOX };

/** Frame image for a card: mythic tier gets its dedicated frame variant. */
export function frameSrcFor(faction: string, rarity?: string): string {
  const base = FRAMES[faction]?.frame ?? FRAMES.neutral.frame;
  if (rarity === "mythic") return base.replace(".png", "-mythic.png");
  return base;
}
