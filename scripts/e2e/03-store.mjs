import { BASE, launch, newPage, report, sleep } from "./helpers.mjs";

const browser = await launch();
const { page, errors } = await newPage(browser);
const checks = [];

// seed a profile with gold
await page.goto(BASE + "/", { waitUntil: "networkidle0" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle0" });
await sleep(500);
const skip = await page.$('[data-testid="intro-skip"]');
if (skip) { await skip.click(); await sleep(300); }

await page.goto(BASE + "/store", { waitUntil: "networkidle0" });
await sleep(800);

checks.push(["wallet gold shown", !!(await page.$('[data-testid="wallet-gold"]'))]);
checks.push(["buy buttons present", !!(await page.$('[data-testid="buy-small"]')) && !!(await page.$('[data-testid="buy-grand"]'))]);

const goldBefore = await page.$eval('[data-testid="wallet-gold"]', (el) => Number(el.textContent.replace(/\D/g, "")));
const colBefore = await page.evaluate(() => {
  const p = JSON.parse(localStorage.getItem("shardfall-profile-v1") ?? "{}");
  return Object.values(p.collection ?? {}).reduce((s, n) => s + n, 0);
});

await page.click('[data-testid="buy-small"]');
await sleep(1500);
checks.push(["pack opening overlay", !!(await page.$('[data-testid="pack-done"]'))]);
// flip any face-down cards then close
for (const el of await page.$$(".packCard, .packReveal *")) { try { await el.click(); } catch {} }
await sleep(1200);
await page.click('[data-testid="pack-done"]');
await sleep(600);

const goldAfter = await page.$eval('[data-testid="wallet-gold"]', (el) => Number(el.textContent.replace(/\D/g, "")));
const colAfter = await page.evaluate(() => {
  const p = JSON.parse(localStorage.getItem("shardfall-profile-v1") ?? "{}");
  return Object.values(p.collection ?? {}).reduce((s, n) => s + n, 0);
});
checks.push(["gold deducted (100)", goldBefore - goldAfter === 100, `${goldBefore}→${goldAfter}`]);
checks.push(["3 cards added to collection", colAfter - colBefore === 3, `${colBefore}→${colAfter}`]);

// demo shard top-up
const shardsBefore = await page.$eval('[data-testid="wallet-shards"]', (el) => Number(el.textContent.replace(/\D/g, "")));
const topup = await page.$('[data-testid="topup-10"]');
if (topup) {
  await topup.click();
  await sleep(500);
  const shardsAfter = await page.$eval('[data-testid="wallet-shards"]', (el) => Number(el.textContent.replace(/\D/g, "")));
  checks.push(["demo top-up adds 10 shards", shardsAfter - shardsBefore === 10, `${shardsBefore}→${shardsAfter}`]);
}

await page.screenshot({ path: process.env.SCRATCH ? `${process.env.SCRATCH}/e2e_store.png` : "/tmp/e2e_store.png" });
await browser.close();
process.exit(report("03-store", checks, errors));
