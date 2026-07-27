"use client";

/**
 * Shardfall — LORE PROLOGUE.
 *
 * A full-screen, scroll-driven cinematic shown exactly once, right after a player
 * registers. Eight chapters, one per generated key art, each snapping into place
 * with a slow ken-burns drift and narration that fades in as it enters view.
 *
 * All classes are prefixed `lp-` (see lore-prologue.css).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import "./lore-prologue.css";

interface Chapter {
  /** file in /public/lore */
  img: string;
  /** small gold eyebrow */
  kicker: string;
  title: string;
  /** short dot-rail label */
  dot: string;
  body: string[];
  /** faction / mood accent used for the title glow + missing-image fallback */
  accent: string;
  /** ken-burns variant */
  kb: "a" | "b" | "c" | "d";
}

const CHAPTERS: Chapter[] = [
  {
    img: "/lore/01-undersun.jpg",
    kicker: "I · Before the Breaking",
    title: "The Undersun",
    dot: "The Undersun",
    accent: "#e3a44a",
    kb: "a",
    body: [
      "Before the breaking, Kelvarrow had a heart of light. Deep beneath the crust burned the Undersun — a buried crystalline star, older than stone.",
      "It did not merely shine. It sang, and its song seeped up through veins of quartz into rivers, forests, and the breath of every living thing. The first mages were only people who learned to hum along.",
    ],
  },
  {
    img: "/lore/02-shattering.jpg",
    kicker: "II · The Night the Song Broke",
    title: "The Shattering",
    dot: "The Shattering",
    accent: "#ffd98a",
    kb: "b",
    body: [
      "Then the song reached a note no throat was built to survive.",
      "One perfect chord, felt in the teeth of every creature alive — and the floor of the world heaved. Continents tore along their crystal seams. The Sunken Sea poured into a chasm that had been a kingdom an hour before. The Undersun burst.",
    ],
  },
  {
    img: "/lore/03-falling.jpg",
    kicker: "III · The Falling",
    title: "The Year of Falling Light",
    dot: "Falling Light",
    accent: "#cfe0ff",
    kb: "c",
    body: [
      "For a full year it snowed radiance on the ruins, and no night was ever truly dark again.",
      "Children ran the ash-fields catching splinters of frozen songlight — warm to the touch, faintly chiming, luminous forever. Aethershards. One the size of a knuckle can light a city for a generation, or level one in an afternoon.",
    ],
  },
  {
    img: "/lore/04-pyre-city.jpg",
    kicker: "IV · The Forge",
    title: "The Pyre Dominion",
    dot: "Pyre Dominion",
    accent: "#e0562f",
    kb: "d",
    body: [
      "In the caldera-lands of the Cinderreach, the Pyre Dominion built an empire out of the wound itself.",
      "The Shattering was no tragedy, they preach — it was a forging, the first blow of a work unfinished. Every shard they take is cast into the Great Crucible, and when the last one melts the world will be remade, whole and burning. They do not besiege. They ignite.",
    ],
  },
  {
    img: "/lore/05-abyss-city.jpg",
    kicker: "V · The Deep",
    title: "The Abyssal Choir",
    dot: "Abyssal Choir",
    accent: "#45c4b8",
    kb: "a",
    body: [
      "When the Sunken Sea swallowed the kingdom of the deeps, not all of its people drowned. Some changed — and in the crushing dark they heard the shards still singing.",
      "The Choir has spent generations learning to sing back. The Shattering was no ending, they answer, but an opening: a second movement, performable only when every note is gathered and sung in true order.",
    ],
  },
  {
    img: "/lore/06-verdant-city.jpg",
    kicker: "VI · The Root",
    title: "The Verdant Compact",
    dot: "Verdant Compact",
    accent: "#8cc152",
    kb: "b",
    body: [
      "Where the shards fell on forest, the forest answered. Roots found the buried songlight, coiled around it, and woke.",
      "The Compact tends the fall-sites like sacred orchards, because the shards are neither weapons nor notes. They are seeds. The Undersun went to seed so that something new could grow. To melt one is murder. To hoard one in the dark is worse.",
    ],
  },
  {
    img: "/lore/07-war.jpg",
    kicker: "VII · The War",
    title: "The Shardfields",
    dot: "The Shardfields",
    accent: "#c96a4a",
    kb: "c",
    body: [
      "Three faiths. One heart, broken into pieces. They cannot all be right.",
      "The sky stopped falling long ago — every shard that will ever exist already lies somewhere in the broken world, and the easy ones are gone. What remains is dredged from flooded vaults, chipped from caldera walls, cut from roots that refuse to let go. The argument is settled the old way.",
    ],
  },
  {
    img: "/lore/08-heartwound.jpg",
    kicker: "VIII · Your Arrival",
    title: "The Heartwound",
    dot: "The Heartwound",
    accent: "#e3a44a",
    kb: "d",
    body: [
      "This is the Heartwound: the crater where the Undersun burst, ringed by fragments of frozen songlight the size of towers.",
      "You arrive with no banner, no debt, and no name the shardfields have learned yet. One splinter waits at the rim, still warm, still humming its single note. Hold it to your ear — it is already singing your part.",
    ],
  },
];

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export default function LorePrologue({ onDone }: { onDone: () => void }) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const secRefs = useRef<(HTMLElement | null)[]>([]);
  const rafRef = useRef(0);

  const [revealed, setRevealed] = useState<Set<number>>(() => new Set());
  const [broken, setBroken] = useState<Set<number>>(() => new Set());
  const [progress, setProgress] = useState(0);
  const [active, setActive] = useState(0);
  const [scrolled, setScrolled] = useState(false);

  /* the prologue owns the screen while it is mounted */
  useEffect(() => {
    const el = document.documentElement;
    const prev = el.style.overflow;
    el.style.overflow = "hidden";
    scrollRef.current?.focus({ preventScroll: true });
    return () => {
      el.style.overflow = prev;
    };
  }, []);

  /* reveal each chapter once, when it enters the scroller */
  useEffect(() => {
    const root = scrollRef.current;
    const all = () => setRevealed(new Set(CHAPTERS.map((_, i) => i)));
    if (!root) return;
    if (typeof IntersectionObserver === "undefined") {
      all();
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const i = Number((e.target as HTMLElement).dataset.index);
          setRevealed((prev) => {
            if (prev.has(i)) return prev;
            const next = new Set(prev);
            next.add(i);
            return next;
          });
          io.unobserve(e.target);
        }
      },
      { root, threshold: 0.35 },
    );
    for (const el of secRefs.current) if (el) io.observe(el);
    return () => io.disconnect();
  }, []);

  const handleScroll = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const el = scrollRef.current;
      if (!el) return;
      const max = el.scrollHeight - el.clientHeight;
      const top = el.scrollTop;
      setProgress(max > 0 ? Math.min(1, Math.max(0, top / max)) : 0);
      setActive(Math.min(CHAPTERS.length - 1, Math.round(top / Math.max(1, el.clientHeight))));
      if (top > 8) setScrolled(true);
    });
  }, []);

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  const goTo = useCallback((i: number) => {
    secRefs.current[i]?.scrollIntoView({
      behavior: prefersReducedMotion() ? "auto" : "smooth",
      block: "start",
    });
  }, []);

  /* eslint-disable @next/next/no-img-element */
  return (
    <div className="lp-root" data-testid="lore-prologue" role="region" aria-label="Shardfall prologue">
      <div className="lp-progress" aria-hidden="true">
        <i style={{ width: `${(progress * 100).toFixed(2)}%` }} />
      </div>

      <button className="lp-skip" data-testid="lore-skip" onClick={onDone}>
        Skip prologue ›
      </button>

      <nav className="lp-dots" aria-label="Chapters">
        {CHAPTERS.map((c, i) => (
          <button
            key={c.img}
            type="button"
            className={`lp-dot${i === active ? " is-active" : ""}`}
            data-label={c.dot}
            aria-label={`Chapter ${i + 1}: ${c.title}`}
            aria-current={i === active ? "true" : undefined}
            onClick={() => goTo(i)}
          />
        ))}
      </nav>

      <div
        className="lp-scroll"
        ref={scrollRef}
        onScroll={handleScroll}
        tabIndex={0}
        aria-label="Prologue chapters"
      >
        {CHAPTERS.map((c, i) => {
          const last = i === CHAPTERS.length - 1;
          return (
            <section
              key={c.img}
              data-index={i}
              ref={(el) => { secRefs.current[i] = el; }}
              className={
                `lp-ch lp-kb-${c.kb}` +
                (revealed.has(i) ? " is-in" : "") +
                (last ? " lp-final" : "")
              }
              style={{ "--lp-accent": c.accent } as React.CSSProperties}
            >
              <div className="lp-bg" aria-hidden="true">
                {!broken.has(i) && (
                  <img
                    src={c.img}
                    alt=""
                    decoding="async"
                    loading={i < 2 ? "eager" : "lazy"}
                    onError={() =>
                      setBroken((prev) => {
                        const next = new Set(prev);
                        next.add(i);
                        return next;
                      })
                    }
                  />
                )}
              </div>
              <div className="lp-shade" aria-hidden="true" />

              <div className="lp-text">
                <p className="lp-kicker">
                  <span className="lp-rule" aria-hidden="true" />
                  {c.kicker}
                </p>
                <h2 className="lp-title">{c.title}</h2>
                {c.body.map((para, k) => (
                  <p className="lp-p" key={k}>{para}</p>
                ))}
                {last && (
                  <div className="lp-ctaRow">
                    <button className="lp-cta" data-testid="lore-enter" onClick={onDone}>
                      Claim your first shard
                    </button>
                  </div>
                )}
              </div>

              {i === 0 && (
                <div className={`lp-chevron${scrolled ? " is-hidden" : ""}`} aria-hidden="true">
                  <span>Scroll</span>
                  <svg viewBox="0 0 24 14" width="26" height="15" fill="none">
                    <path
                      d="M2 2l10 10L22 2"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
  /* eslint-enable @next/next/no-img-element */
}
