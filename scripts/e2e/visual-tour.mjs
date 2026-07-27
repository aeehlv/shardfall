/** Visual QA tour: captures every screen with real data into $SCRATCH. */
import { BASE, launch, newPage, sleep } from "./helpers.mjs";

const S = process.env.SCRATCH ?? "/tmp";
const browser = await launch();
const { page, errors } = await newPage(browser);

await page.goto(BASE + "/", { waitUntil: "networkidle0" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle0" });
await sleep(6500); // intro mid-triptych
await page.screenshot({ path: `${S}/qa_intro.png` });
const skip = await page.$('[data-testid="intro-skip"]');
if (skip) await skip.click();
await sleep(600);
await page.screenshot({ path: `${S}/qa_menu.png` });

await page.click('[data-testid="menu-play"]');
await sleep(400);
await page.screenshot({ path: `${S}/qa_deckpick.png` });

await page.goto(BASE + "/play?deck=verdant", { waitUntil: "networkidle0" });
await sleep(1800);
// play a few turns to populate the board
for (let round = 0; round < 4; round++) {
  if (await page.$('[data-testid="end-overlay"]')) break;
  for (let i = 0; i < 4; i++) {
    const playable = await page.$(".handSlot .cardFace.playable");
    if (!playable) break;
    await playable.click();
    await sleep(900);
    if (await page.$(".targetArrow")) {
      const t = await page.$(".unitTile.legalTarget");
      if (t) await t.click(); else await page.keyboard.press("Escape");
      await sleep(700);
    }
  }
  const btn = await page.$('[data-testid="end-turn"]:not([disabled])');
  if (!btn) break;
  await btn.click();
  await page.waitForSelector('[data-testid="end-turn"]:not([disabled]), [data-testid="end-overlay"]', { timeout: 45000 }).catch(() => {});
  await sleep(300);
}
// framed zoom preview
const slot = await page.$(".handSlot");
if (slot) { await slot.hover(); await sleep(500); }
await page.screenshot({ path: `${S}/qa_match.png` });
await page.mouse.move(40, 400);

await page.goto(BASE + "/collection", { waitUntil: "networkidle0" });
await sleep(1000);
await page.screenshot({ path: `${S}/qa_collection.png` });
const cell = await page.$(".colCard");
if (cell) { await cell.click(); await sleep(600); await page.screenshot({ path: `${S}/qa_viewer.png` }); await page.keyboard.press("Escape"); }

await page.goto(BASE + "/store", { waitUntil: "networkidle0" });
await sleep(900);
await page.click('[data-testid="buy-standard"]').catch(() => {});
await sleep(3200);
await page.screenshot({ path: `${S}/qa_pack.png` });

console.log("tour done; console errors:", errors.length ? errors.slice(0, 5) : "none");
await browser.close();
process.exit(errors.length ? 1 : 0);
