"use client";

/** A unit on the battlefield. Registers its element for animation targeting. */

import { getCardSafe } from "@/lib/game/engine";
import type { UnitInstance } from "@/lib/game/types";
import type { CSSProperties, ReactNode } from "react";

const ACCENT: Record<string, string> = {
  pyre: "#e0562f", abyss: "#45c4b8", verdant: "#8cc152", neutral: "#b9a878",
};

export interface FxNumber { key: number; text: string; kind: "damage" | "heal" | "buff"; }

export default function UnitTile({
  unit, ready, selected, legalTarget, dying, resting, spawning, onClick, onHover, refCb, fx, children,
}: {
  unit: UnitInstance;
  ready?: boolean;
  selected?: boolean;
  legalTarget?: boolean;
  dying?: boolean;
  resting?: boolean;
  spawning?: boolean;
  onClick?: () => void;
  onHover?: (cardId: string | null, el?: HTMLElement) => void;
  refCb?: (el: HTMLDivElement | null) => void;
  fx?: FxNumber[];
  children?: ReactNode;
}) {
  const card = getCardSafe(unit.cardId);
  const damaged = unit.health < unit.maxHealth;
  const cls = [
    "unitTile",
    ready ? "ready" : "",
    selected ? "selected" : "",
    legalTarget ? "legalTarget" : "",
    dying ? "dying" : "",
    resting ? "resting" : "",
    spawning ? "spawnIn" : "",
    unit.keywords.includes("guard") ? "isGuard" : "",
  ].filter(Boolean).join(" ");
  return (
    <div
      className={cls}
      style={{ "--accent": ACCENT[card.faction] } as CSSProperties}
      onClick={onClick}
      onMouseEnter={(e) => onHover?.(unit.cardId, e.currentTarget)}
      onMouseLeave={() => onHover?.(null)}
      ref={refCb}
      data-uid={unit.uid}
    >
      <div className="utArt">
        {card.art ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={card.art} alt={card.name} draggable={false} loading="lazy" />
        ) : (
          <div className="utArtFallback" />
        )}
      </div>
      {unit.keywords.includes("guard") && <div className="utShield" aria-label="Guard" />}
      {resting && <div className="utResting" aria-label="Cannot act yet">z</div>}
      <div className="utAtk">{unit.attack}</div>
      <div className={`utHp${damaged ? " hurt" : ""}`}>{unit.health}</div>
      {unit.igniteX ? <div className="utIgnite">{unit.igniteX}</div> : null}
      <div className="utFx">
        {fx?.map((f) => (
          <span key={f.key} className={`fxNum ${f.kind}`}>{f.text}</span>
        ))}
      </div>
      {children}
    </div>
  );
}
