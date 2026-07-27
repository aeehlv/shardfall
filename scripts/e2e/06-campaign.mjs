import { BASE, launch, newPage, report, sleep } from "./helpers.mjs";

const browser = await launch();
const { page, errors } = await newPage(browser);
const checks = [];
const email = `camp${Date.now()}@test.dev`;

// fresh account
await page.goto(BASE + "/login", { waitUntil: "networkidle0" });
await page.click('[data-testid="tab-signup"]');
await sleep(200);
await page.type('[data-testid="auth-name"]', "CampTester");
await page.type('[data-testid="auth-email"]', email);
await page.type('[data-testid="auth-password"]', "secret123");
await page.click('[data-testid="auth-submit"]');
await page.waitForNavigation({ waitUntil: "networkidle0", timeout: 20000 }).catch(() => {});
await sleep(1500);
const loreSkip = await page.$('[data-testid="lore-skip"]');
if (loreSkip) { await loreSkip.click(); await sleep(600); }
const introSkip = await page.$('[data-testid="intro-skip"]');
if (introSkip) { await introSkip.click(); await sleep(400); }

// campaign page
await page.goto(BASE + "/campaign", { waitUntil: "networkidle0" });
await sleep(1500);
checks.push(["journey/progress visible", !!(await page.$('[data-testid="node-ch1-n1"]'))]);
const starsOnPage = await page.$$eval("[class*=tar], [class*=Star]", els => els.length).catch(() => 0);
checks.push(["star UI present", starsOnPage > 0]);

// start node 1
await page.click('[data-testid="node-ch1-n1"]');
await sleep(500);
const pick = await page.$('[data-testid="pick-pyre"]');
if (pick) { await pick.click(); await sleep(300); }
await page.click('[data-testid="start-node"]');
await sleep(900);
checks.push(["story card", !!(await page.$('[data-testid="story-card"]'))]);
await page.click('[data-testid="story-begin"]');
const inMatch = await page.waitForFunction(() => location.search.includes("match="), { timeout: 25000 })
  .then(() => true).catch(() => false);
checks.push(["campaign match started", inMatch]);
await sleep(2500);

// play to win: dump cards, always swing face
let won = false;
for (let round = 0; round < 26 && !won; round++) {
  if (await page.$('[data-testid="end-overlay"], [data-testid="campaign-rewards"]')) break;
  for (let i = 0; i < 6; i++) {
    const c = await page.$(".handSlot .cardFace.playable");
    if (!c) break;
    await c.click();
    await sleep(900);
    if (await page.$(".targetArrow")) {
      const t = await page.$(".boardRow.enemy .unitTile.legalTarget") ?? await page.$(".unitTile.legalTarget");
      if (t) await t.click(); else await page.keyboard.press("Escape");
      await sleep(800);
    }
  }
  for (let i = 0; i < 8; i++) {
    const ready = await page.$(".boardRow.mine .unitTile.ready");
    if (!ready) break;
    await ready.click();
    await sleep(250);
    const hero = await page.$(".heroCorner.foe.legalTarget");
    const unit = await page.$(".boardRow.enemy .unitTile.legalTarget");
    if (hero) await hero.click();
    else if (unit) await unit.click();
    else { await page.keyboard.press("Escape"); break; }
    await sleep(1100);
  }
  if (await page.$('[data-testid="campaign-rewards"], [data-testid="end-overlay"]')) break;
  const bt = await page.$('[data-testid="end-turn"]:not([disabled])');
  if (!bt) break;
  await bt.click();
  await page.waitForSelector('[data-testid="end-turn"]:not([disabled]), [data-testid="end-overlay"], [data-testid="campaign-rewards"]', { timeout: 70000 }).catch(() => {});
  await sleep(500);
}

const rewardsUp = !!(await page.$('[data-testid="campaign-rewards"]'));
const genericUp = !!(await page.$('[data-testid="end-overlay"]'));
checks.push(["a result screen appeared", rewardsUp || genericUp]);
if (rewardsUp) {
  const txt = await page.$eval('[data-testid="campaign-rewards"]', el => el.innerText).catch(() => "");
  console.log("      reward screen text:", txt.replace(/\n+/g, " | ").slice(0, 260));
  checks.push(["campaign reward screen (stars/rewards)", /star|★|gold|pack/i.test(txt)]);
  await page.screenshot({ path: (process.env.SCRATCH ?? "/tmp") + "/e2e_campaign_rewards.png" });
} else if (genericUp) {
  const txt = await page.$eval('[data-testid="end-overlay"]', el => el.innerText).catch(() => "");
  console.log("      generic end text:", txt.replace(/\n+/g, " | ").slice(0, 200));
}

// back to campaign: progress must persist
await page.goto(BASE + "/campaign", { waitUntil: "networkidle0" });
await sleep(1500);
const apiState = await page.evaluate(async () => {
  const r = await fetch("/api/campaign", { cache: "no-store" });
  const j = await r.json();
  const n1 = (j.nodes ?? []).find(n => n.id === "ch1-n1") ?? {};
  return { cleared: n1.cleared, stars: n1.stars, unlockedNext: (j.nodes ?? []).find(n => n.id === "ch1-n2")?.unlocked };
});
console.log("      api after match:", JSON.stringify(apiState));
checks.push(["campaign API reports node state", apiState.cleared !== undefined]);

await page.screenshot({ path: (process.env.SCRATCH ?? "/tmp") + "/e2e_campaign_page.png" });
await browser.close();
process.exit(report("06-campaign", checks, errors));
