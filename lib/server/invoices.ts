import type { WithId } from "mongodb";
import type { TransactionDoc } from "./db";

/** Buyer identity printed on the invoice; email may be unknown (deleted user). */
export interface InvoiceBuyer {
  name: string;
  email: string | null;
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

const humanizeKind = (kind: string) =>
  kind.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

const CURRENCY_NAME: Record<string, string> = { gold: "Gold", shards: "Aethershards" };

/** Attachment filename — invoice number when the row has one, txn id for legacy rows. */
export function invoiceFilename(txn: WithId<TransactionDoc>): string {
  return `invoice-${txn.invoiceNo ?? String(txn._id)}.html`;
}

/** A complete standalone HTML invoice (inline CSS, no external assets).
 *  All user-provided strings (name, email, label) are HTML-escaped. */
export function renderInvoiceHtml(txn: WithId<TransactionDoc>, buyer: InvoiceBuyer): string {
  const invoiceNo = txn.invoiceNo ?? "—";
  const item = txn.label ?? humanizeKind(txn.kind);
  const currency = txn.currency ? CURRENCY_NAME[txn.currency] ?? txn.currency : null;
  const amount = currency
    ? `${txn.amount > 0 ? "+" : ""}${txn.amount} ${currency}`
    : "—";
  const balance = currency && txn.balanceAfter !== undefined
    ? `${txn.balanceAfter} ${currency}`
    : "—";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Shardfall invoice ${escapeHtml(invoiceNo)}</title>
<style>
  body { margin: 0; padding: 32px 16px; background: #efe7d6; color: #2a2233;
         font: 15px/1.5 Georgia, "Times New Roman", serif; }
  .sheet { max-width: 640px; margin: 0 auto; background: #f7f1e3; border: 1px solid #cdbfa2;
           box-shadow: 0 10px 30px rgba(30, 22, 10, .25); }
  header { padding: 26px 32px; color: #f3ead9;
           background: linear-gradient(180deg, #241d2f, #171219);
           border-bottom: 3px solid #b98a3a; }
  header h1 { margin: 0; font-size: 26px; letter-spacing: .35em; color: #e3a44a; }
  header p { margin: 4px 0 0; font-size: 12px; letter-spacing: .18em; text-transform: uppercase;
             color: #9c93a8; }
  .body { padding: 26px 32px 30px; }
  table { width: 100%; border-collapse: collapse; }
  .meta td { padding: 5px 0; vertical-align: top; }
  .meta td:first-child { width: 140px; font-size: 11px; letter-spacing: .18em;
                         text-transform: uppercase; color: #7a6f5a; }
  .lines { margin-top: 22px; }
  .lines th { padding: 8px 10px; text-align: left; font-size: 11px; letter-spacing: .18em;
              text-transform: uppercase; color: #7a6f5a; border-bottom: 2px solid #b98a3a; }
  .lines td { padding: 12px 10px; border-bottom: 1px solid #d8cbae; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  footer { padding: 18px 32px 26px; font-size: 12px; font-style: italic; color: #7a6f5a;
           border-top: 1px solid #d8cbae; }
  @media print { body { padding: 0; background: #f7f1e3; } .sheet { border: 0; box-shadow: none; } }
</style>
</head>
<body>
<div class="sheet">
  <header>
    <h1>SHARDFALL</h1>
    <p>Invoice ${escapeHtml(invoiceNo)}</p>
  </header>
  <div class="body">
    <table class="meta">
      <tr><td>Invoice no.</td><td>${escapeHtml(invoiceNo)}</td></tr>
      <tr><td>Date</td><td>${escapeHtml(new Date(txn.ts).toUTCString())}</td></tr>
      <tr><td>Buyer</td><td>${escapeHtml(buyer.name)}${buyer.email ? `<br>${escapeHtml(buyer.email)}` : ""}</td></tr>
    </table>
    <table class="lines">
      <tr><th>Item</th><th class="num">Amount</th><th class="num">Balance after</th></tr>
      <tr>
        <td>${escapeHtml(item)}</td>
        <td class="num">${escapeHtml(amount)}</td>
        <td class="num">${escapeHtml(balance)}</td>
      </tr>
    </table>
  </div>
  <footer>
    Shardfall is in alpha: gold and Aethershards are in-game currencies only.
    Transactions made during the alpha period carry no real-money value.
  </footer>
</div>
</body>
</html>
`;
}
