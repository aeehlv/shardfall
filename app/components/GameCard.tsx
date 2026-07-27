"use client";

import { useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from "react";
import { RULES_BOX, type CardDef } from "@/lib/cards";

interface Props {
  card: CardDef;
  index: number;
}

const rect = (box: readonly [number, number, number, number]): CSSProperties => ({
  left: `${box[0]}%`,
  top: `${box[1]}%`,
  width: `${box[2]}%`,
  height: `${box[3]}%`,
});

const gem = ([x, y]: readonly [number, number]): CSSProperties => ({
  left: `${x}%`,
  top: `${y}%`,
});

export default function GameCard({ card, index }: Props) {
  const tiltRef = useRef<HTMLDivElement>(null);
  const [flipped, setFlipped] = useState(false);
  const { layout } = card;

  const handleMove = (e: MouseEvent<HTMLDivElement>) => {
    const el = tiltRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    el.style.setProperty("--rx", `${((py - 0.5) * -9).toFixed(2)}deg`);
    el.style.setProperty("--ry", `${((px - 0.5) * 9).toFixed(2)}deg`);
    el.style.setProperty("--mx", `${(px * 100).toFixed(1)}%`);
    el.style.setProperty("--my", `${(py * 100).toFixed(1)}%`);
  };

  const handleLeave = () => {
    const el = tiltRef.current;
    if (!el) return;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
  };

  const toggle = () => setFlipped((f) => !f);

  const handleKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle();
    }
  };

  /* eslint-disable @next/next/no-img-element */
  return (
    <div
      className="stage"
      style={{ "--delay": `${index * 140}ms`, "--glow": card.glow, "--accent": card.accent } as CSSProperties}
    >
      <div className="tilt" ref={tiltRef} onMouseMove={handleMove} onMouseLeave={handleLeave}>
        <div
          className={`card3d${flipped ? " flipped" : ""}`}
          role="button"
          tabIndex={0}
          aria-pressed={flipped}
          aria-label={`${card.name} — press to turn the card over`}
          onClick={toggle}
          onKeyDown={handleKey}
        >
          <div className="face front">
            <img className="art" src={card.art} alt="" style={rect(layout.art)} draggable={false} />
            <img className="frame" src={card.frame} alt="" draggable={false} />
            <div className="plate name" style={rect(layout.name)}>
              <span style={{ fontSize: `${layout.nameSize}cqw` }}>
                {card.name.includes(",") ? (
                  <>
                    {card.name.slice(0, card.name.indexOf(",") + 1)}
                    <br />
                    {card.name.slice(card.name.indexOf(",") + 1).trim()}
                  </>
                ) : (
                  card.name
                )}
              </span>
            </div>
            <div className="plate rules" style={rect(RULES_BOX)}>
              <p className="rulesText">{card.rules}</p>
              <p className="flavorText">{card.flavor}</p>
            </div>
            {layout.rarity && <div className="gem rarity" style={gem(layout.rarity)} aria-hidden="true" />}
            <div className="gem mana" style={gem(layout.mana)}>{card.cost}</div>
            <div className="gem attack" style={gem(layout.attack)}>{card.attack}</div>
            <div className="gem health" style={gem(layout.health)}>{card.health}</div>
            <div className="sheen" />
          </div>
          <div className="face back">
            <img className="backArt" src="/cards/back.jpg" alt="Shardfall card back" draggable={false} />
            <div className="sheen" />
          </div>
        </div>
      </div>
      <div className="caption">
        <span className="captionFaction">{card.factionName}</span>
        <span className="captionMeta">{card.id} · legendary</span>
      </div>
    </div>
  );
  /* eslint-enable @next/next/no-img-element */
}
