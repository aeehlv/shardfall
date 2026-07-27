import GameCard from "@/app/components/GameCard";
import { CARDS } from "@/lib/cards";
import "../cards.css";

export default function Home() {
  return (
    <main className="galleryMain">
      <div className="backdrop" aria-hidden="true" />

      <header className="galleryHeader">
        <span className="eyebrow">Shardfall · Kelvarrow</span>
        <h1>The First Legendaries</h1>
        <p>
          One leader per faction, assembled from generated art and faction frames — stats,
          name, and rules render as live HTML on top, so every card stays translatable and
          data-driven.
        </p>
      </header>

      <section className="cardRow" aria-label="Card gallery">
        {CARDS.map((card, i) => (
          <GameCard key={card.id} card={card} index={i} />
        ))}
      </section>

      <p className="hint">
        <b>Click a card</b> to turn it over and see the card back. Hover to tilt.
      </p>

      <footer className="galleryFooter">
        art · gemini-3.1-flash-image — frames · recraft-v4.1 — via Vercel AI Gateway — battlefield: The Glasswake
        {" — "}
        <a href="/studio">Card Studio →</a>
      </footer>
    </main>
  );
}
