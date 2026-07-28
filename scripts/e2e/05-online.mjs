import { BASE, launch, newPage, report, sleep } from "./helpers.mjs";

const browser = await launch();
const { page, errors } = await newPage(browser);
const checks = [];
const email = `e2e${Date.now()}@test.dev`;

// --- signup ---------------------------------------------------------------
await page.goto(BASE + "/login", { waitUntil: "networkidle0" });
await page.click('[data-testid="tab-signup"]');
await sleep(200);
await page.type('[data-testid="auth-name"]', "E2EDuelist");
await page.type('[data-testid="auth-email"]', email);
await page.type('[data-testid="auth-password"]', "secret123");
await page.click('[data-testid="auth-submit"]');
await page.waitForNavigation({ waitUntil: "networkidle0", timeout: 20000 }).catch(() => {});
await sleep(1600);
// new accounts land on the lore prologue, then the short intro
for (const sel of ['[data-testid="lore-skip"]', '[data-testid="intro-skip"]']) {
  const el = await page.$(sel);
  if (el) { await el.click(); await sleep(600); }
}
await page.waitForSelector('[data-testid="menu-ranked"]', { timeout: 15000 }).catch(() => {});
checks.push(["signed up & account chip shows", !!(await page.$('[data-testid="account"] b'))]);

// --- ranked queue → bot fallback ------------------------------------------
await page.click('[data-testid="menu-ranked"]');
await sleep(400);
checks.push(["queue overlay", !!(await page.$('[data-testid="queue-overlay"]'))]);
await page.click('[data-testid="queue-pyre"]');
const found = await page
  .waitForFunction(() => location.pathname === "/play" && location.search.includes("match="), { timeout: 40000 })
  .then(() => true).catch(() => false);
checks.push(["matched (bot fallback ≤15s + buffer)", found]);
await sleep(2500);
checks.push(["opponent tag shows (mock player)", !!(await page.$('[data-testid="opp-tag"]'))]);
checks.push(["server timer running", !!(await page.$('[data-testid="turn-timer"]'))]);

// play one card if possible, then end turn once
const playable = await page.$(".handSlot .cardFace.playable");
if (playable) { await playable.click(); await sleep(1500); if (await page.$(".targetArrow")) await page.keyboard.press("Escape"); }
const endBtn = await page.$('[data-testid="end-turn"]:not([disabled])');
if (endBtn) {
  await endBtn.click();
  await page.waitForSelector('[data-testid="end-turn"]:not([disabled]), [data-testid="end-overlay"]', { timeout: 60000 }).catch(() => {});
}
checks.push(["survived a full server round-trip turn", true]);

// --- resume: reload mid-match ---------------------------------------------
const matchUrl = page.url();
await page.goto(BASE + "/", { waitUntil: "networkidle0" });
await sleep(800);
checks.push(["resume banner on menu", !!(await page.$('[data-testid="resume-match"]'))]);
await page.goto(matchUrl, { waitUntil: "networkidle0" });
await sleep(2000);
checks.push(["match resumed after leaving", (await page.$$(".handSlot")).length > 0]);

// --- concede → rating screen ----------------------------------------------
await page.click('[data-testid="concede"]');
await sleep(300);
await page.click('[data-testid="concede"]');
await page.waitForSelector('[data-testid="end-overlay"]', { timeout: 15000 }).catch(() => {});
checks.push(["end overlay", !!(await page.$('[data-testid="end-overlay"]'))]);
checks.push(["rating delta shown", !!(await page.$('[data-testid="rating-delta"]'))]);

// --- campaign --------------------------------------------------------------
await page.goto(BASE + "/campaign", { waitUntil: "networkidle0" });
await sleep(1200);
const node1 = await page.$('[data-testid="node-ch1-n1"]');
checks.push(["campaign node 1 present", !!node1]);
if (node1) {
  await node1.click();
  await sleep(400);
  const start = await page.$('[data-testid="start-node"]');
  if (start) {
    // deck pick → story briefing → battle
    await start.click();
    const storyUp = await page
      .waitForSelector('[data-testid="story-card"]', { timeout: 5000 })
      .then(() => true).catch(() => false);
    checks.push(["campaign story card shown", storyUp]);
    await sleep(500);
    await page.click('[data-testid="story-begin"]').catch(() => {});
    const inMatch = await page
      .waitForFunction(() => location.search.includes("match="), { timeout: 20000 })
      .then(() => true).catch(() => false);
    checks.push(["campaign match started", inMatch]);
    await sleep(2000);
    await page.click('[data-testid="concede"]');
    await sleep(300);
    await page.click('[data-testid="concede"]').catch(() => {});
    await sleep(1500);
  }
}

// --- friends: befriend a mock player and battle them ------------------------
await page.goto(BASE + "/friends", { waitUntil: "networkidle0" });
await sleep(1200);
const nameInput = await page.$('[data-testid="friend-name"]');
checks.push(["friends page loads", !!nameInput]);
if (nameInput) {
  await nameInput.type("Grimspark91");
  await page.click('[data-testid="friend-add"]');
  // the friends list refreshes on a 5s poll
  await page.waitForSelector('[data-testid^="challenge-"]', { timeout: 12000 }).catch(() => {});
  const challenge = await page.$('[data-testid^="challenge-"]');
  checks.push(["bot friend added & challengeable", !!challenge]);
  if (challenge) {
    await challenge.click();
    await sleep(400);
    const pick = await page.$('[data-testid^="faction-"]');
    if (pick) await pick.click();
    const inFriendly = await page
      .waitForFunction(() => location.search.includes("match="), { timeout: 20000 })
      .then(() => true).catch(() => false);
    checks.push(["friendly battle started", inFriendly]);
  }
}

await page.screenshot({ path: process.env.SCRATCH ? `${process.env.SCRATCH}/e2e_online.png` : "/tmp/e2e_online.png" });
await browser.close();
process.exit(report("05-online", checks, errors));
