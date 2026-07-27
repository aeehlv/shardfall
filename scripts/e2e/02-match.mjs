import { BASE, launch, newPage, report, sleep } from "./helpers.mjs";

const browser = await launch();
const { page, errors } = await newPage(browser);
const checks = [];

await page.goto(BASE + "/play?deck=pyre", { waitUntil: "networkidle0" });
await sleep(1600);

checks.push(["hand rendered", (await page.$$(".handSlot")).length >= 4]);
checks.push(["end turn button", !!(await page.$('[data-testid="end-turn"]'))]);
checks.push(["hero corners", (await page.$$(".heroCorner")).length === 2]);

let sawUnits = false;
let playedCard = false;

for (let round = 0; round < 10; round++) {
  if (await page.$('[data-testid="end-overlay"]')) break;
  // play all playable no-target cards
  for (let i = 0; i < 6; i++) {
    const playable = await page.$(".handSlot .cardFace.playable");
    if (!playable) break;
    await playable.click();
    playedCard = true;
    await sleep(900);
    // if a targeting arrow appeared (targeted card), cancel via Escape
    if (await page.$(".targetArrow")) await page.keyboard.press("Escape");
  }
  // attack with ready units → enemy hero
  for (let i = 0; i < 8; i++) {
    if (await page.$('[data-testid="end-overlay"]')) break;
    const ready = await page.$(".boardRow.mine .unitTile.ready");
    if (!ready) break;
    await ready.click();
    await sleep(200);
    const enemyUnitTarget = await page.$(".boardRow.enemy .unitTile.legalTarget");
    const heroTarget = await page.$(".heroCorner.foe.legalTarget");
    if (heroTarget) await heroTarget.click();
    else if (enemyUnitTarget) await enemyUnitTarget.click();
    else { await page.keyboard.press("Escape"); break; }
    await sleep(1100);
  }
  if ((await page.$$(".unitTile")).length > 0) sawUnits = true;
  if (await page.$('[data-testid="end-overlay"]')) break;
  // end turn and wait out the AI turn
  await page.waitForSelector('[data-testid="end-turn"]:not([disabled])', { timeout: 15000 }).catch(() => {});
  const btn = await page.$('[data-testid="end-turn"]:not([disabled])');
  if (!btn) break;
  await btn.click();
  await page.waitForSelector('[data-testid="end-turn"]:not([disabled]), [data-testid="end-overlay"]', { timeout: 45000 }).catch(() => {});
  await sleep(400);
}

checks.push(["at least one card was played", playedCard]);
checks.push(["units appeared on the board", sawUnits]);

const enemyHp = await page.$eval(".heroCorner.foe .heroHp", (el) => Number(el.textContent));
const myHp = await page.$eval('.heroCorner.mine .heroHp', (el) => Number(el.textContent)).catch(() => 30);
const over = !!(await page.$('[data-testid="end-overlay"]'));
checks.push(["damage was dealt to someone or game ended", over || enemyHp < 30 || myHp < 30]);

await page.screenshot({ path: process.env.SCRATCH ? `${process.env.SCRATCH}/e2e_match.png` : "/tmp/e2e_match.png" });
await browser.close();
process.exit(report("02-match", checks, errors));
