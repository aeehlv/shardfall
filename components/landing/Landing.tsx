"use client";

/* eslint-disable @next/next/no-img-element */

/**
 * Pre-login landing page for "/" — logged-out visitors only.
 * Self-contained: all classes prefixed `ld-`, styles in ./landing.css.
 * Copy condensed from library/world/overview.md (the Shattering, Aethershards,
 * the three factions, ranked zones). CSS-only motion; respects reduced-motion.
 */

import Link from "next/link";
import SiteFooter from "@/components/SiteFooter";
import "./landing.css";

type AccentStyle = React.CSSProperties & {
  "--fx"?: string;
  "--fx-glow"?: string;
};

const FACTIONS: {
  slug: string;
  name: string;
  art: string;
  color: string;
  glow: string;
  line: string;
  tag: string;
}[] = [
  {
    slug: "pyre",
    name: "Pyre Dominion",
    art: "/cards/art/pyre.jpg",
    color: "#e0562f",
    glow: "rgba(224,86,47,.5)",
    line: "The Shattering was a hammerblow — the first strike of a forging not yet finished. Feed the Crucible.",
    tag: "Aggressive tempo · Direct damage",
  },
  {
    slug: "abyss",
    name: "Abyssal Choir",
    art: "/cards/art/abyss.jpg",
    color: "#45c4b8",
    glow: "rgba(69,196,184,.5)",
    line: "Every shard still sings one note of the worldsong. Gather them all, and perform the second movement.",
    tag: "Control · Spells · Card manipulation",
  },
  {
    slug: "verdant",
    name: "Verdant Compact",
    art: "/cards/art/verdant.jpg",
    color: "#8cc152",
    glow: "rgba(140,193,82,.5)",
    line: "The shards are seeds. The Undersun did not die — it scattered itself so something new could grow.",
    tag: "Growth · Swarm · Healing",
  },
];

const KEYWORDS: { name: string; text: string }[] = [
  { name: "Rush", text: "This unit can attack the turn it is played." },
  {
    name: "Guard",
    text: "Enemies must attack this unit before they can attack your other units or your hero.",
  },
  {
    name: "Piercing",
    text: "When this unit attacks and destroys a unit, excess damage is dealt to the enemy hero.",
  },
  {
    name: "Lifesteal",
    text: "Damage dealt by this card also heals your hero for that much.",
  },
  {
    name: "Ignite X",
    text: "At the end of your turn, deal X damage to a random enemy.",
  },
  {
    name: "Overgrow",
    text: "At the end of each of your turns, if this unit is on the battlefield, it gains +1/+1.",
  },
];

const FEATURES: {
  title: string;
  img: string;
  alt: string;
  contain?: boolean;
  lines: [string, string];
}[] = [
  {
    title: "Ranked Battles",
    img: "/ui/features/ranked.jpg",
    alt: "The Cinderreach battlefield",
    lines: [
      "Climb five zones of shattered Kelvarrow, from the Glasswake to the Heartwound.",
      "Every victory echoes through the broken worldsong.",
    ],
  },
  {
    title: "Campaign of the Five Zones",
    img: "/ui/features/campaign.jpg",
    alt: "The Glasswake battlefield",
    lines: [
      "March from the shard-dusted borderlands to the crater where the Undersun burst.",
      "Duel the three powers that claim its scattered heart.",
    ],
  },
  {
    title: "Collection & Packs",
    img: "/ui/features/collection.jpg",
    alt: "A grand pack of Shardfall cards",
    contain: true,
    lines: [
      "Crack packs of frozen songlight and gather the legendaries of all three factions.",
      "Forge decks worth a pouch of shards.",
    ],
  },
];

const BOARDS: { img: string; name: string; caption: string }[] = [
  {
    img: "/board/glasswake.jpg",
    name: "The Glasswake",
    caption:
      "Rolling borderlands still glittering with shard-dust from the Year of Falling Light.",
  },
  {
    img: "/board/cinderreach.jpg",
    name: "The Cinderreach",
    caption:
      "The Dominion’s caldera-lands — bronze roads and lava-veins, where duels turn fast and hot.",
  },
  {
    img: "/board/sunken-antiphon.jpg",
    name: "The Sunken Antiphon",
    caption:
      "Drowned cathedral-trenches where the shards themselves seem to judge the melody of each play.",
  },
];

function SectionHead({ kicker, title }: { kicker: string; title: string }) {
  return (
    <header className="ld-shead">
      <div className="ld-kicker-row" aria-hidden="true">
        <span className="ld-rule" />
        <span className="ld-kicker">{kicker}</span>
        <span className="ld-rule ld-flip" />
      </div>
      <h2 className="ld-h2">{title}</h2>
    </header>
  );
}

export default function Landing() {
  return (
    <main className="ld-root">
      {/* 1 — Hero */}
      <section className="ld-hero">
        <div className="ld-hero-bg" aria-hidden="true" />
        <div className="ld-hero-shade" aria-hidden="true" />
        <div className="ld-hero-inner">
          <img
            className="ld-hero-logo"
            src="/ui/logo-epic.png"
            alt="Shardfall"
          />
          <img
            className="ld-hero-season"
            src="/ui/season-banner.png"
            alt="First Epoch: The Shattering"
          />
          <p className="ld-hero-hook">
            The world broke into pieces. Everyone wants a shard.
          </p>
          <div className="ld-hero-ctas">
            <Link
              href="/login"
              className="ld-btn ld-btn-gold"
              data-testid="landing-cta"
            >
              Enter Kelvarrow
            </Link>
            <Link href="/login" className="ld-btn ld-btn-dark">
              Create free account
            </Link>
          </div>
          <p className="ld-hero-note">
            Free to play · Plays in your browser · No download
          </p>
        </div>
      </section>

      {/* 2 — Lore */}
      <section className="ld-section">
        <div className="ld-wrap ld-narrow">
          <SectionHead kicker="The Shattering" title="The War for the Shards" />
          <div className="ld-panel">
            <p className="ld-lore">
              Kelvarrow was born with a heart of light. Deep beneath its crust
              burned the <b>Undersun</b> — a buried crystalline star whose slow,
              singing radiance was the source of all magic. Then, on a night the
              calendars refuse to name, the song reached a note no throat was
              built to survive. The Undersun burst.
            </p>
            <p className="ld-lore">
              Continents tore along the old crystal veins, and for a full year
              it snowed radiance on the ruins. What fell were the{" "}
              <b>Aethershards</b>: splinters of frozen songlight, warm to the
              touch, luminous forever. A shard the size of a knuckle can light a
              city for a generation — or level one in an afternoon. Every shard
              that will ever exist already lies somewhere in the broken world,
              and the easy ones are taken.
            </p>
            <p className="ld-lore">
              Three great powers now war over the scattered heart of the world,
              and their quarrel is not merely greed — each believes it knows
              what the Shattering <i>meant</i>. They cannot all be right. On the
              shardfields of Kelvarrow, that argument is settled the old way:
              one battle, one shard, at a time.
            </p>
          </div>
        </div>
      </section>

      {/* 3 — Factions */}
      <section className="ld-section">
        <div className="ld-wrap">
          <SectionHead kicker="Choose your banner" title="Three Powers, One Prize" />
          <div className="ld-factions">
            {FACTIONS.map((f) => (
              <article
                key={f.slug}
                className="ld-faction"
                style={{ "--fx": f.color, "--fx-glow": f.glow } as AccentStyle}
              >
                <div className="ld-faction-art">
                  <img src={f.art} alt={f.name} />
                </div>
                <div className="ld-faction-body">
                  <h3 className="ld-faction-name">{f.name}</h3>
                  <p className="ld-faction-line">{f.line}</p>
                  <span className="ld-faction-tag">{f.tag}</span>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* 4 — Codex */}
      <section className="ld-section ld-codex">
        <div className="ld-wrap">
          <SectionHead kicker="The Codex" title="Learn the Words of War" />
          <p className="ld-sub">
            Eight keywords rule every card in Kelvarrow. Master six and you can
            read any battlefield.
          </p>
          <div className="ld-kw-grid">
            {KEYWORDS.map((k) => (
              <div key={k.name} className="ld-kw">
                <b className="ld-kw-name">{k.name}</b>
                <p className="ld-kw-text">{k.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5 — Features */}
      <section className="ld-section">
        <div className="ld-wrap">
          <SectionHead kicker="Ways to fight" title="Claim Your Shards" />
          <div className="ld-features">
            {FEATURES.map((f) => (
              <article key={f.title} className="ld-feature">
                <div
                  className={
                    "ld-feature-img" + (f.contain ? " ld-feature-contain" : "")
                  }
                >
                  <img src={f.img} alt={f.alt} />
                </div>
                <h3 className="ld-feature-title">{f.title}</h3>
                <p className="ld-feature-text">
                  {f.lines[0]}
                  <br />
                  {f.lines[1]}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* 6 — Battlefields */}
      <section className="ld-section">
        <div className="ld-wrap">
          <SectionHead kicker="Shardfields" title="Where the Argument Is Settled" />
          <div className="ld-boards">
            {BOARDS.map((b) => (
              <figure key={b.name} className="ld-board">
                <img src={b.img} alt={b.name} />
                <figcaption className="ld-board-cap">
                  <b>{b.name}</b>
                  <span>{b.caption}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="ld-section ld-close">
        <div className="ld-wrap ld-close-inner">
          <p className="ld-close-line">
            The shards are running out of sky. Take yours.
          </p>
          <Link href="/login" className="ld-btn ld-btn-gold">
            Enter Kelvarrow
          </Link>
        </div>
      </section>

      {/* 7 — Footer */}
      <footer className="ld-footer">
        <img className="ld-footer-emblem" src="/ui/emblem.png" alt="" />
        <p className="ld-footer-title">Shardfall — First Epoch: The Shattering</p>
        <p className="ld-footer-note">Work in progress — Kelvarrow v0.2</p>
      </footer>
      <SiteFooter />
    </main>
  );
}
