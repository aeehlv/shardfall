"use client";

/** Full ornate-frame card render (gallery frames) for zoom/reveal in matches. */

import { FRAMES, RULES_BOX, frameSrcFor } from "@/lib/frames";
import type { GameCard } from "@/lib/game/types";
import type { CSSProperties } from "react";
import "@/app/cards.css";

const rect = (box: readonly [number, number, number, number]): CSSProperties => ({
  left: `${box[0]}%`, top: `${box[1]}%`, width: `${box[2]}%`, height: `${box[3]}%`,
});

export default function FramedCard({ card, width }: { card: GameCard; width?: number }) {
  const frameDef = FRAMES[card.faction];
  if (!frameDef) return null;
  const L = frameDef.layout;
  const name = card.name;
  const comma = name.indexOf(",");

  /* eslint-disable @next/next/no-img-element */
  return (
    <div className="framedCard" data-rarity={card.rarity} style={width ? { width, height: (width * 4) / 3 } : { width: "100%", aspectRatio: "3 / 4" }}>
      <img className="art" src={card.art ?? ""} alt="" style={rect(L.art)} draggable={false} />
      <img className="frame" src={frameSrcFor(card.faction, card.rarity)} alt="" draggable={false} />
      <div className="plate name" style={rect(L.name)}>
        <span style={{ fontSize: `${L.nameSize}cqw` }}>
          {comma > -1 ? (<>{name.slice(0, comma + 1)}<br />{name.slice(comma + 1).trim()}</>) : name}
        </span>
      </div>
      <div className="plate rules" style={rect(frameDef.rules ?? RULES_BOX)}>
        <p className="rulesText">{card.text}</p>
        {card.flavor && <p className="flavorText">{card.flavor}</p>}
      </div>
      {L.rarity && <div className="gem rarity" style={{ left: `${L.rarity[0]}%`, top: `${L.rarity[1]}%` }} aria-hidden="true" />}
      <div className="gem mana" style={{ left: `${L.mana[0]}%`, top: `${L.mana[1]}%` }}>{card.cost}</div>
      {card.type === "unit" ? (
        <>
          <div className="gem attack" style={{ left: `${L.attack[0]}%`, top: `${L.attack[1]}%` }}>{card.attack}</div>
          <div className="gem health" style={{ left: `${L.health[0]}%`, top: `${L.health[1]}%` }}>{card.health}</div>
        </>
      ) : (
        <div className="gem attack spellGem" style={{ left: `${L.attack[0]}%`, top: `${L.attack[1]}%` }}>✦</div>
      )}
    </div>
  );
  /* eslint-enable @next/next/no-img-element */
}
