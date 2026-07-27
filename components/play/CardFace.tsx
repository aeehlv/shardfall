"use client";

/** Lightweight in-game card render (hand + zoom). CSS frame, faction accents, art, stats. */

import type { GameCard } from "@/lib/game/types";
import type { CSSProperties } from "react";

const ACCENT: Record<string, string> = {
  pyre: "#e0562f", abyss: "#45c4b8", verdant: "#8cc152", neutral: "#b9a878",
};
const RARITY: Record<string, string> = {
  common: "#9c93a8", rare: "#4e8ee9", epic: "#a45ae0", legendary: "#e3a44a", mythic: "#ff5c8a",
};

export default function CardFace({
  card, playable, className = "", variant = "full",
}: { card: GameCard; playable?: boolean; className?: string; variant?: "full" | "hand" }) {
  const accent = ACCENT[card.faction];
  return (
    <div
      className={`cardFace ${className}${playable ? " playable" : ""}${variant === "hand" ? " handVariant" : ""}`}
      data-rarity={card.rarity}
      style={{ "--accent": accent, "--rarity": RARITY[card.rarity] } as CSSProperties}
    >
      <div className="cfCost">{card.cost}</div>
      <div className="cfArt">
        {card.art ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={card.art} alt="" draggable={false} loading="lazy" />
        ) : (
          <div className="cfArtFallback" />
        )}
      </div>
      <div className="cfName">{card.name}</div>
      <div className="cfText">{card.text}</div>
      {card.type === "unit" && (
        <>
          <div className="cfAtk">{card.attack}</div>
          <div className="cfHp">{card.health}</div>
        </>
      )}
      {card.type === "spell" && <div className="cfSpell">Spell</div>}
    </div>
  );
}
