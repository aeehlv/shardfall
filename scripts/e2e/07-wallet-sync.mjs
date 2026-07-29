import { BASE, launch, newPage, report, sleep } from "./helpers.mjs";

const browser = await launch();
const { page, errors } = await newPage(browser);
const checks = [];
const email = `wallet${Date.now()}@test.dev`;

const menuGold = () =>
  page.$eval('[data-testid="wallet"] .wRes b', (el) => Number(el.textContent.replace(/\D/g, "")));
const storeGold = () =>
  page.$eval('[data-testid="wallet-gold"]', (el) => Number(el.textContent.replace(/\D/g, "")));
const accountGold = () =>
  page.$eval('[data-testid="account-wallet"] .acctStat b', (el) => Number(el.textContent.replace(/\D/g, "")));

/** Poll `fn` until it returns a value passing `ok` (or time runs out). */
async function until(fn, ok, ms = 8000) {
  const t0 = Date.now();
  let v;
  while (Date.now() - t0 < ms) {
    v = await fn().catch(() => undefined);
    if (v !== undefined && ok(v)) return v;
    await sleep(400);
  }
  return v;
}

// --- fresh account ---------------------------------------------------------
await page.goto(BASE + "/login", { waitUntil: "networkidle0" });
await page.click('[data-testid="tab-signup"]');
await sleep(200);
await page.type('[data-testid="auth-name"]', "WalletTester");
await page.type('[data-testid="auth-email"]', email);
await page.type('[data-testid="auth-password"]', "secret123");
await page.click('[data-testid="auth-submit"]');
await page.waitForNavigation({ waitUntil: "networkidle0", timeout: 20000 }).catch(() => {});
await sleep(1500);
for (const sel of ['[data-testid="lore-skip"]', '[data-testid="intro-skip"]']) {
  const el = await page.$(sel);
  if (el) { await el.click(); await sleep(600); }
}
await page.waitForSelector('[data-testid="wallet"] .wRes b', { timeout: 15000 }).catch(() => {});
const goldStart = await until(menuGold, (v) => Number.isFinite(v));
checks.push(["menu wallet shows server gold", Number.isFinite(goldStart)]);

// --- demo top-up (+500 gold) ----------------------------------------------
await page.click(".moreBtn");
await sleep(300);
const topup = await page.$('[data-testid="admin-gold"]');
checks.push(["demo top-up rendered (flags.demoGrants)", !!topup]);
await topup.click();
const goldAfterTopup = await until(menuGold, (v) => v === goldStart + 500);
checks.push(["menu gold +500 after top-up", goldAfterTopup === goldStart + 500, `${goldStart}→${goldAfterTopup}`]);

// --- same number on /store and /account ------------------------------------
await page.goto(BASE + "/store", { waitUntil: "networkidle0" });
const storeGold1 = await until(storeGold, (v) => v === goldAfterTopup);
checks.push(["store wallet matches menu", storeGold1 === goldAfterTopup, `${storeGold1} vs ${goldAfterTopup}`]);

await page.goto(BASE + "/account", { waitUntil: "networkidle0" });
const acctGold1 = await until(accountGold, (v) => v === goldAfterTopup);
checks.push(["account wallet matches menu", acctGold1 === goldAfterTopup, `${acctGold1} vs ${goldAfterTopup}`]);

// --- buy the cheapest gold-priced daily deal via the UI ---------------------
await page.goto(BASE + "/store", { waitUntil: "networkidle0" });
await page.waitForSelector('[data-testid="daily-deals"]', { timeout: 12000 }).catch(() => {});
const deal = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('[data-testid="daily-deals"] .dealCard')];
  const offers = cards.map((c) => {
    const btn = c.querySelector('[data-testid^="deal-"]');
    if (!btn || btn.disabled) return null;
    if (!c.querySelector('.priceRow img[alt="gold"]')) return null; // gold-priced only
    const price = Number(c.querySelector(".priceRow span")?.textContent?.replace(/\D/g, "") ?? NaN);
    return { id: btn.dataset.testid.slice(5), price };
  }).filter((o) => o && Number.isFinite(o.price));
  offers.sort((a, b) => a.price - b.price);
  return offers[0] ?? null;
});
checks.push(["a purchasable gold daily deal exists", !!deal]);

let goldAfterBuy = goldAfterTopup;
if (deal) {
  await page.click(`[data-testid="deal-${deal.id}"]`);
  goldAfterBuy = goldAfterTopup - deal.price;
  const storeGold2 = await until(storeGold, (v) => v === goldAfterBuy);
  checks.push(["store gold decreased by the deal price", storeGold2 === goldAfterBuy, `${goldAfterTopup}→${storeGold2} (price ${deal.price})`]);

  await page.goto(BASE + "/", { waitUntil: "networkidle0" });
  const menuGold2 = await until(menuGold, (v) => v === goldAfterBuy);
  checks.push(["menu gold matches store after purchase", menuGold2 === goldAfterBuy, `${menuGold2} vs ${goldAfterBuy}`]);

  // --- purchase shows up in the account ledger -----------------------------
  await page.goto(BASE + "/account", { waitUntil: "networkidle0" });
  await page.waitForSelector('[data-testid="txn-table"]', { timeout: 12000 }).catch(() => {});
  const ledger = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('[data-testid="txn-table"] tbody tr')];
    return rows.map((r) => ({
      kind: r.querySelector(".txnKind")?.textContent ?? "",
      item: r.querySelector(".txnItem")?.textContent ?? "",
      amount: r.querySelector(".txnAmount")?.textContent ?? "",
    }));
  }).catch(() => []);
  const buyRow = ledger.find((r) => /purchase/i.test(r.kind) && r.item.includes(deal.id));
  checks.push(["purchase row in the account ledger", !!buyRow, JSON.stringify(ledger.slice(0, 3))]);
  checks.push(["ledger row shows the debited amount", !!buyRow && buyRow.amount.replace(/\D/g, "") === String(deal.price), buyRow?.amount]);
  const acctGold2 = await accountGold().catch(() => NaN);
  checks.push(["account wallet matches after purchase", acctGold2 === goldAfterBuy, `${acctGold2} vs ${goldAfterBuy}`]);

  // --- the acquired card shows up in the collection (server counts) --------
  await page.goto(BASE + "/collection", { waitUntil: "networkidle0" });
  await page.waitForSelector('[data-testid="collection-grid"]', { timeout: 12000 }).catch(() => {});
  const cardOwned = await page.$eval(
    `[data-testid="col-card-${deal.id}"]`,
    (el) => ({ owned: el.dataset.owned, copies: el.querySelector(".colCopies")?.textContent ?? "" }),
  ).catch(() => null);
  checks.push(["bought card owned in collection", cardOwned?.owned === "true", JSON.stringify(cardOwned)]);
  const colCount = await page.$eval('[data-testid="collection-count"]', (el) => el.textContent).catch(() => "");
  checks.push(["collection count reflects server cards", /^[1-9]\d* \/ \d+/.test(colCount.trim()), colCount.trim()]);
}

await page.screenshot({ path: (process.env.SCRATCH ?? "/tmp") + "/e2e_wallet_sync.png" });
await browser.close();
process.exit(report("07-wallet-sync", checks, errors));
