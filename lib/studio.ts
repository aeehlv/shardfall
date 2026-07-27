import path from "path";

export interface StudioSlot {
  id: string;
  label: string;
  /** Path under public/ that this slot writes to */
  publicPath: string;
  /** frame → knockout window to alpha on save; art/image → saved as-is (jpeg for .jpg targets) */
  kind: "art" | "frame" | "image";
  /** Library markdown file whose "## Art Prompt" section seeds the prompt box (optional) */
  promptFile?: string;
  /** Fallback prompt seed when there is no promptFile */
  defaultPrompt?: string;
}

const EDIT_HINT =
  "Edit this image: describe your change here. Keep the material, style, colors and every other element " +
  "exactly identical to the input image. Keep the same image dimensions. No text, no lettering, no watermark.";

export const STUDIO_SLOTS: StudioSlot[] = [
  {
    id: "art-pyre",
    label: "Art — Varkha Cindral (Pyre)",
    publicPath: "cards/art/pyre.jpg",
    kind: "art",
    promptFile: "library/factions/pyre/cards/pyre-003-varkha-cindral-first-hammer.md",
  },
  {
    id: "art-abyss",
    label: "Art — Maelvyra (Abyss)",
    publicPath: "cards/art/abyss.jpg",
    kind: "art",
    promptFile: "library/factions/abyss/cards/abyss-003-maelvyra-the-first-voice.md",
  },
  {
    id: "art-verdant",
    label: "Art — Oremma (Verdant)",
    publicPath: "cards/art/verdant.jpg",
    kind: "art",
    promptFile: "library/factions/verdant/cards/verdant-003-oremma-the-undersown.md",
  },
  {
    id: "frame-pyre",
    label: "Frame — Pyre Dominion",
    publicPath: "cards/frames/pyre.png",
    kind: "frame",
    defaultPrompt: EDIT_HINT,
  },
  {
    id: "frame-abyss",
    label: "Frame — Abyssal Choir",
    publicPath: "cards/frames/abyss.png",
    kind: "frame",
    defaultPrompt: EDIT_HINT,
  },
  {
    id: "frame-verdant",
    label: "Frame — Verdant Compact",
    publicPath: "cards/frames/verdant.png",
    kind: "frame",
    defaultPrompt: EDIT_HINT,
  },
  {
    id: "card-back",
    label: "Card back",
    publicPath: "cards/back.jpg",
    kind: "image",
    defaultPrompt: EDIT_HINT,
  },
  {
    id: "battlefield-glasswake",
    label: "Battlefield — The Glasswake",
    publicPath: "board/glasswake.jpg",
    kind: "image",
    promptFile: "library/battlefields/glasswake.md",
  },
];

export const findSlot = (id: string) => STUDIO_SLOTS.find((s) => s.id === id);

export const projectRoot = () => process.cwd();

export const publicFile = (slot: StudioSlot) =>
  path.join(projectRoot(), "public", slot.publicPath);
