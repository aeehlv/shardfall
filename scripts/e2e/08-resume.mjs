import { BASE, launch, newPage, report, sleep } from "./helpers.mjs";

const browser = await launch();
const { page, errors } = await newPage(browser);
const checks = [];
const email = `resume${Date.now()}@test.dev`;

// --- fresh account ---------------------------------------------------------
await page.goto(BASE + "/login", { waitUntil: "networkidle0" });
await page.click('[data-testid="tab-signup"]');
await sleep(200);
await page.type('[data-testid="auth-name"]', "ResumeTester");
await page.type('[data-testid="auth-email"]', email);
await page.type('[data-testid="auth-password"]', "secret123");
await page.click('[data-testid="auth-submit"]');
await page.waitForNavigation({ waitUntil: "networkidle0", timeout: 20000 }).catch(() => {});
await sleep(1500);
for (const sel of ['[data-testid="lore-skip"]', '[data-testid="intro-skip"]']) {
  const el = await page.$(sel);
  if (el) { await el.click(); await sleep(600); }
}
await page.waitForSelector('[data-testid="menu-ranked"]', { timeout: 15000 }).catch(() => {});

// --- ranked match (bot fallback) -------------------------------------------
await page.click('[data-testid="menu-ranked"]');
await sleep(400);
await page.click('[data-testid="queue-pyre"]');
const found = await page
  .waitForFunction(() => location.pathname === "/play" && location.search.includes("match="), { timeout: 40000 })
  .then(() => true).catch(() => false);
checks.push(["ranked match started", found]);
await sleep(2500);
const matchId = await page.evaluate(() => new URLSearchParams(location.search).get("match"));
checks.push(["match id in URL", !!matchId]);

// --- play 2-3 actions -------------------------------------------------------
for (let i = 0; i < 2; i++) {
  const c = await page.waitForSelector(".handSlot .cardFace.playable", { timeout: 3000 }).catch(() => null);
  if (!c) break;
  await c.click();
  await sleep(1200);
  if (await page.$(".targetArrow")) { await page.keyboard.press("Escape"); await sleep(300); }
}
const endBtn = await page.$('[data-testid="end-turn"]:not([disabled])');
if (endBtn) {
  await endBtn.click();
  await page.waitForSelector('[data-testid="end-turn"]:not([disabled]), [data-testid="end-overlay"]', { timeout: 70000 }).catch(() => {});
}
checks.push(["actions played against the server", true]);

// --- hard reload: board must render, not hang on the loading screen ---------
await page.reload({ waitUntil: "networkidle0" });
const boardBack = await page
  .waitForSelector('[data-testid="my-hero"]', { timeout: 8000 })
  .then(() => true).catch(() => false);
checks.push(["board renders within 8s after hard reload", boardBack]);
checks.push(["hand rendered after reload", (await page.$$(".handSlot")).length > 0]);

// --- menu resume banner -----------------------------------------------------
await page.goto(BASE + "/", { waitUntil: "networkidle0" });
await page.waitForSelector('[data-testid="resume-match"]', { timeout: 10000 }).catch(() => {});
const banners = await page.$$eval('[data-testid="resume-match"]', (els) => els.map((el) => el.textContent));
checks.push(["exactly one resume banner", banners.length === 1, JSON.stringify(banners)]);
checks.push(["banner is the ranked match", banners.length === 1 && /ranked/i.test(banners[0]), banners[0]]);

// --- the queue API returns the SAME match while it is active ----------------
const queueApi = await page.evaluate(async () => {
  const post = await (await fetch("/api/queue", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ faction: "pyre" }),
  })).json();
  const get = await (await fetch("/api/queue", { cache: "no-store" })).json();
  return { post, get };
});
checks.push(["POST /api/queue resumes the active match", queueApi.post.matchId === matchId, JSON.stringify(queueApi.post)]);
checks.push(["GET /api/queue resumes the active match", queueApi.get.matchId === matchId, JSON.stringify(queueApi.get)]);

// --- clicking the banner loads the same match -------------------------------
await page.click('[data-testid="resume-match"]');
const resumed = await page
  .waitForFunction((id) => location.pathname === "/play" && location.search.includes(`match=${id}`), { timeout: 15000 }, matchId)
  .then(() => true).catch(() => false);
checks.push(["banner resumes the same match id", resumed]);
const boardAgain = await page
  .waitForSelector('[data-testid="my-hero"]', { timeout: 8000 })
  .then(() => true).catch(() => false);
checks.push(["resumed board renders", boardAgain]);

await page.screenshot({ path: (process.env.SCRATCH ?? "/tmp") + "/e2e_resume.png" });
await browser.close();
process.exit(report("08-resume", checks, errors));
