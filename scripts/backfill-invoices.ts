/** One-shot: assign invoice numbers to ledger transactions that predate
 *  invoice numbering (chronological order, same SF-XXXXXX counter used for new
 *  rows). Idempotent — rows that already carry an invoiceNo are untouched.
 *  Run: npx tsx scripts/backfill-invoices.ts  (locally, and once on prod at deploy) */

import { getMongoClient, nextInvoiceNo, transactionsCol } from "../lib/server/db";

for (const file of [".env.local", ".env"]) {
  try { process.loadEnvFile(file); } catch { /* optional */ }
}

async function main() {
  const txns = await transactionsCol();
  const missing = await txns
    .find({ invoiceNo: { $exists: false } }, { projection: { _id: 1 } })
    .sort({ ts: 1 })
    .toArray();
  console.log(`backfilling ${missing.length} transactions`);

  let done = 0;
  for (const t of missing) {
    await txns.updateOne({ _id: t._id }, { $set: { invoiceNo: await nextInvoiceNo() } });
    done += 1;
    if (done % 200 === 0) process.stdout.write(`  ${done}/${missing.length}\r`);
  }
  process.stdout.write("\n");

  const left = await txns.countDocuments({ invoiceNo: { $exists: false } });
  console.log(`done — ${left} transactions still without invoiceNo`);
  await getMongoClient().close();
}

main().catch(async (err) => {
  console.error(err);
  await getMongoClient().close().catch(() => {});
  process.exit(1);
});
