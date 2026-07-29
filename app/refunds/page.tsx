import type { Metadata } from "next";
import Link from "next/link";
import "@/app/legal.css";

export const metadata: Metadata = {
  title: "Refund Policy — Shardfall",
  description: "Refunds in Shardfall — and why there is currently nothing to refund.",
};

export default function RefundsPage() {
  return (
    <main className="legalMain">
      <div className="legalCol">
        <Link className="legalBack" href="/">← Back to Shardfall</Link>

        <header className="legalHeader">
          <p className="legalKicker">Shardfall · Kelvarrow</p>
          <h1 className="legalTitle">Refund Policy</h1>
          <p className="legalMeta">Effective date: July 29, 2026 · Operator: shardfall.app</p>
          <hr className="legalRule" />
        </header>

        <div className="legalBody">
          <h2>No real payments today</h2>
          <div className="legalNote">
            <p>
              Shardfall currently processes <strong>no real-money transactions</strong>. Every shard
              top-up, pack and store offer — including any that display a price — is a{" "}
              <strong>free demo grant</strong>. No card is charged, no money changes hands, and there
              is therefore nothing to refund.
            </p>
          </div>
          <p>
            Prices shown in the store exist to demonstrate the intended economy while the game is in
            development. Gold and Aethershards are in-game points with no monetary value (see the{" "}
            <Link href="/terms">Terms of Service</Link>).
          </p>

          <h2>If real payments launch</h2>
          <p>
            Should Shardfall introduce real-money purchases in the future, this policy will be
            updated before any payment is taken, and the following will apply for EU consumers:
          </p>
          <ul>
            <li>
              The statutory <strong>14-day right of withdrawal</strong> for distance purchases under
              EU consumer law.
            </li>
            <li>
              The standard <strong>digital-content exception</strong>: by requesting immediate
              delivery of digital content (e.g. opening a purchased pack or spending purchased
              shards) and acknowledging it, you consent to performance beginning at once and the
              withdrawal right lapsing for that purchase, as permitted by Directive 2011/83/EU.
            </li>
            <li>Clear pricing, receipts, and a documented refund process before checkout.</li>
          </ul>

          <h2>Billing questions</h2>
          <p>
            If you believe you were charged anything in connection with Shardfall, or have any other
            billing question, reach us through <a href="https://shardfall.app">shardfall.app</a> and
            we will sort it out.
          </p>
        </div>

        <p className="legalContact">
          See also the <Link href="/privacy">Privacy Policy</Link> and{" "}
          <Link href="/terms">Terms of Service</Link>.
        </p>
      </div>
    </main>
  );
}
