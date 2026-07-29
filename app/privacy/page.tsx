import type { Metadata } from "next";
import Link from "next/link";
import "@/app/legal.css";

export const metadata: Metadata = {
  title: "Privacy Policy — Shardfall",
  description: "How Shardfall collects, stores and protects your data.",
};

export default function PrivacyPage() {
  return (
    <main className="legalMain">
      <div className="legalCol">
        <Link className="legalBack" href="/">← Back to Shardfall</Link>

        <header className="legalHeader">
          <p className="legalKicker">Shardfall · Kelvarrow</p>
          <h1 className="legalTitle">Privacy Policy</h1>
          <p className="legalMeta">Effective date: July 29, 2026 · Operator: shardfall.app</p>
          <hr className="legalRule" />
        </header>

        <div className="legalBody">
          <p>
            Shardfall is a free-to-play browser card game. This policy explains what data the game
            handles, where it lives, and how to get it removed. We collect the minimum needed to run
            the game — nothing more.
          </p>

          <h2>What we collect</h2>
          <ul>
            <li>
              <strong>Account data</strong> — when you register we store your email address, your
              chosen display name, and a hash of your password (the password itself is never stored).
            </li>
            <li>
              <strong>Gameplay data</strong> — your match results, rating, level, experience, card
              collection, decks, virtual-currency balances and a ledger of in-game grants, tied to
              your account.
            </li>
            <li>
              <strong>Guest profile</strong> — if you play without an account, your progress, decks
              and collection are stored only in your own browser&apos;s localStorage. That data never
              leaves your device unless you later sign up.
            </li>
          </ul>
          <p>
            Account and gameplay data are stored in a managed MongoDB Atlas cloud database.
          </p>

          <h2>GDPR &amp; your rights</h2>
          <p>
            Shardfall is operated from the European Union and processes personal data in accordance
            with the GDPR. We rely on the performance of our contract with you (running the game and
            your account) and on our legitimate interest in keeping the game secure and fair as the
            legal bases for processing. Under the GDPR you have the right to access, rectify, export
            and erase your data, to restrict or object to its processing, and to lodge a complaint
            with your local supervisory authority. Most of these you can exercise directly: your{" "}
            <Link href="/account">account page</Link> shows the data we hold and lets you rename the
            account, review every transaction, and delete the account outright.
          </p>

          <h2>Where data is processed</h2>
          <p>
            Our database is hosted with MongoDB Atlas on cloud infrastructure that may be located
            outside the EU (currently AWS, United States). Transfers to these processors are covered
            by the EU Commission&apos;s Standard Contractual Clauses and the processors&apos;
            EU&ndash;U.S. Data Privacy Framework commitments, under their respective data processing
            agreements. We follow data minimisation: only the account and gameplay data listed above
            is processed, and nothing is retained after account deletion.
          </p>

          <h2>Payment data</h2>
          <p>
            Shardfall currently processes <strong>no payments and stores no payment data</strong> —
            shard top-ups are free demo grants. When real payments launch, checkout will be handled
            by a certified PCI&nbsp;DSS-compliant payment provider, card details will never touch our
            servers, and this section will be updated with the provider&apos;s details before any
            payment is taken.
          </p>

          <h2>What we do not collect</h2>
          <p>
            Shardfall runs <strong>no third-party analytics and no advertising trackers</strong>. We
            do not sell, rent or share your data with anyone, and we do not build profiles of you
            beyond the game state described above.
          </p>

          <h2>Cookies &amp; local storage</h2>
          <ul>
            <li>
              <strong>Session cookies</strong> — signing in sets first-party session cookies managed
              by our authentication layer (better-auth). They exist solely to keep you signed in and
              are strictly essential; there are no marketing or tracking cookies.
            </li>
            <li>
              <strong>localStorage</strong> — the game keeps your guest profile and local settings
              (e.g. whether you have seen the intro) in your browser&apos;s localStorage. You can clear
              it at any time through your browser; doing so resets guest progress.
            </li>
          </ul>

          <h2>Data deletion</h2>
          <p>
            You can have your account and all associated data deleted at any time from your{" "}
            <Link href="/account">account page</Link>. Guest data is deleted simply by clearing your
            browser storage.
          </p>

          <h2>Changes</h2>
          <p>
            Shardfall is a work in progress and this policy may evolve with it. Material changes will
            be reflected here with a new effective date.
          </p>
        </div>

        <p className="legalContact">
          Manage your data from your <Link href="/account">account page</Link> · See also the{" "}
          <Link href="/terms">Terms of Service</Link> and <Link href="/refunds">Refund Policy</Link>.
        </p>
      </div>
    </main>
  );
}
