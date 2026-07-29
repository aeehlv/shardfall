import type { Metadata } from "next";
import Link from "next/link";
import "@/app/legal.css";

export const metadata: Metadata = {
  title: "Terms of Service — Shardfall",
  description: "The rules of playing Shardfall.",
};

export default function TermsPage() {
  return (
    <main className="legalMain">
      <div className="legalCol">
        <Link className="legalBack" href="/">← Back to Shardfall</Link>

        <header className="legalHeader">
          <p className="legalKicker">Shardfall · Kelvarrow</p>
          <h1 className="legalTitle">Terms of Service</h1>
          <p className="legalMeta">Effective date: July 29, 2026 · Operator: shardfall.app</p>
          <hr className="legalRule" />
        </header>

        <div className="legalBody">
          <h2>The service</h2>
          <p>
            Shardfall is a free-to-play, turn-based collectible card game played in your browser. It
            is an actively developed <strong>work in progress</strong>: features, cards, rules and
            balance change frequently, and content may be added, reworked or removed without notice.
            By playing you accept these terms.
          </p>

          <h2>Accounts</h2>
          <ul>
            <li>You may play as a guest or register with an email address and display name.</li>
            <li>Keep your credentials to yourself; you are responsible for activity on your account.</li>
            <li>One person per account. Choose a display name that is not offensive or impersonating.</li>
            <li>
              We may suspend or remove accounts that break these terms. You may request deletion of
              your account at any time (see the <Link href="/privacy">Privacy Policy</Link>).
            </li>
          </ul>

          <h2>Virtual currencies</h2>
          <div className="legalNote">
            <p>
              Gold and Aethershards are in-game points with <strong>no monetary value</strong>. They
              cannot be redeemed, refunded, exchanged or transferred outside the game. All
              current &quot;top-ups&quot; and store offers are <strong>free demo grants</strong> —{" "}
              no real-money transactions are processed anywhere in Shardfall today.
            </p>
          </div>
          <p>
            Cards, packs, decks and any other in-game items are licensed for use inside the game
            only; they are not your property and may be adjusted as the game evolves.
          </p>

          <h2>Fair play</h2>
          <p>
            Play the game as it is meant to be played. The following are not allowed: exploiting
            bugs, tampering with client or server requests, automating play (bots), manipulating
            matchmaking or ratings, and any attempt to gain currency, cards or rank outside the
            game&apos;s intended systems. If you find a bug, please let us know through{" "}
            <a href="https://shardfall.app">shardfall.app</a> instead of using it.
          </p>

          <h2>Availability</h2>
          <p>
            Shardfall is provided &quot;as is&quot;, free of charge and without warranties of any
            kind. We do not guarantee uptime, and the service — including accounts and progress — may
            be interrupted, changed or discontinued at any time during development.
          </p>

          <h2>Contact &amp; governing terms</h2>
          <p>
            The service is operated from the European Union and these terms are governed by the law
            applicable at the operator&apos;s seat. Any questions about these terms are handled
            through <a href="https://shardfall.app">shardfall.app</a>.
          </p>
        </div>

        <p className="legalContact">
          See also the <Link href="/privacy">Privacy Policy</Link> and{" "}
          <Link href="/refunds">Refund Policy</Link>.
        </p>
      </div>
    </main>
  );
}
