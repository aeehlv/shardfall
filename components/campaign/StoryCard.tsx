"use client";

/**
 * Shardfall — campaign STORY CARD.
 *
 * Full-screen briefing shown before a campaign battle starts (and, in `intro`
 * mode, for the per-chapter prologue). The plate is built from the generated
 * 9-slice ornament (`/ui/panel-frame.png`) — no plain CSS borders anywhere.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import "./story-card.css";

export interface StoryCardEnemy {
  /** display name, e.g. "Pellin Quickthorn" */
  name: string;
  /** honorific / role, e.g. "Orchard Sprigcaller of the Glasswake" */
  title: string;
  /** faction id — picks the portrait art at /cards/art/<faction>.jpg */
  faction: string;
  /** readable faction name, e.g. "Verdant Compact" */
  factionName?: string;
  /** faction accent colour (hex) */
  accent?: string;
  /** enemy hero bonus HP, shown as a difficulty note when > 0 */
  hpBonus?: number;
}

export interface StoryCardProps {
  /** "briefing" = pre-battle (default), "intro" = chapter prologue */
  mode?: "briefing" | "intro";
  chapterTitle: string;
  title: string;
  subtitle?: string;
  body: string[];
  enemy?: StoryCardEnemy | null;
  stakes?: string;
  /** label of the gold button (briefing mode) */
  beginLabel?: string;
  /** label of the dark button */
  backLabel?: string;
  busy?: boolean;
  error?: string | null;
  onBegin?: () => void;
  onBack: () => void;
}

const PORTRAIT_FACTIONS = new Set(["pyre", "abyss", "verdant"]);

export default function StoryCard({
  mode = "briefing",
  chapterTitle,
  title,
  subtitle,
  body,
  enemy,
  stakes,
  beginLabel = "Begin Battle",
  backLabel,
  busy = false,
  error = null,
  onBegin,
  onBack,
}: StoryCardProps) {
  const isIntro = mode === "intro";
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [showHint, setShowHint] = useState(false);

  const close = useCallback(() => {
    if (!busy) onBack();
  }, [busy, onBack]);

  /* scroll-hint chevron: only while the body overflows and isn't at the end */
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const update = () => {
      const overflows = el.scrollHeight - el.clientHeight > 8;
      const atEnd = el.scrollTop + el.clientHeight >= el.scrollHeight - 14;
      setShowHint(overflows && !atEnd);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(update);
      ro.observe(el);
    }
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      ro?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [body, enemy, stakes]);

  /* escape closes, and the page behind never scrolls while the card is up */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [close]);

  const accent = enemy?.accent ?? "#e3a44a";
  const portrait =
    enemy && PORTRAIT_FACTIONS.has(enemy.faction)
      ? `/cards/art/${enemy.faction}.jpg`
      : "/ui/emblem.png";

  /* eslint-disable @next/next/no-img-element */
  return (
    <div
      className={`storyWrap${isIntro ? " intro" : ""}`}
      data-testid="story-card"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="storyVeil" onClick={close} aria-hidden="true" />

      <article className="storyCard" onClick={(e) => e.stopPropagation()}>
        <div className="storyPlate">
          <header className="storyHead">
            <span className="storyChapter">{chapterTitle}</span>
            <h2 className="storyTitle">{title}</h2>
            {subtitle && <p className="storySub">{subtitle}</p>}
            <div className="storyRule" aria-hidden="true">
              <i />
              <span>◆</span>
              <i />
            </div>
          </header>

          <div className="storyScrollBox">
            <div className="storyBody" ref={bodyRef} tabIndex={0}>
              {body.map((para, i) => (
                <p className="storyPara" key={i} style={{ "--i": i } as CSSProperties}>
                  {para}
                </p>
              ))}
            </div>
            <span
              className={`storyScrollHint${showHint ? " show" : ""}`}
              aria-hidden="true"
            >
              ⌄
            </span>
          </div>

          {!isIntro && enemy && (
            <div className="storyEnemy" style={{ "--fac": accent } as CSSProperties}>
              <div className="storyPortrait">
                <img src={portrait} alt="" draggable={false} />
                <span className="storyPortraitRing" aria-hidden="true" />
              </div>
              <div className="storyEnemyText">
                <span className="storyEnemyLabel">Opposing you</span>
                <span className="storyEnemyName">{enemy.name}</span>
                <span className="storyEnemyTitle">{enemy.title}</span>
                {(enemy.factionName || (enemy.hpBonus ?? 0) > 0) && (
                  <span className="storyEnemyMeta">
                    {enemy.factionName}
                    {(enemy.hpBonus ?? 0) > 0 && (
                      <em>
                        {enemy.factionName ? " · " : ""}+{enemy.hpBonus} hero HP
                      </em>
                    )}
                  </span>
                )}
              </div>
            </div>
          )}

          {!isIntro && stakes && (
            <p className="storyStakes">
              <span className="storyStakesTag">Stakes</span>
              {stakes}
            </p>
          )}

          {error && <div className="storyErr">{error}</div>}

          <div className="storyActions">
            {isIntro ? (
              <button
                type="button"
                className="storyBtnDark"
                data-testid="story-back"
                onClick={onBack}
              >
                {backLabel ?? "Close"}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="storyBtn"
                  data-testid="story-begin"
                  disabled={busy}
                  onClick={onBegin}
                >
                  {busy ? "Summoning…" : beginLabel}
                </button>
                <button
                  type="button"
                  className="storyBtnDark"
                  data-testid="story-back"
                  disabled={busy}
                  onClick={onBack}
                >
                  {backLabel ?? "Back"}
                </button>
              </>
            )}
          </div>
        </div>
      </article>
    </div>
  );
  /* eslint-enable @next/next/no-img-element */
}
