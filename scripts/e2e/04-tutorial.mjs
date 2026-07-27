import { BASE, launch, newPage, report, sleep } from "./helpers.mjs";

const browser = await launch();
const { page, errors } = await newPage(browser);
const checks = [];

await page.goto(BASE + "/play?deck=pyre&tutorial=1", { waitUntil: "networkidle0" });
await sleep(1800);

checks.push(["tutorial overlay shows", !!(await page.$('[data-testid="tutorial"]'))]);

// advance two informational steps
for (let i = 0; i < 2; i++) {
  const next = await page.$(".tutBtns .btn.primary");
  if (next) { await next.click(); await sleep(400); }
}
checks.push(["tutorial still guiding", !!(await page.$('[data-testid="tutorial"]'))]);

// skip ends it and marks profile
const skipBtn = await page.$(".tutBtns .btn.subtle");
if (skipBtn) { await skipBtn.click(); await sleep(500); }
checks.push(["tutorial dismissed", !(await page.$('[data-testid="tutorial"]'))]);
const done = await page.evaluate(() =>
  JSON.parse(localStorage.getItem("shardfall-profile-v1") ?? "{}").tutorialDone === true);
checks.push(["profile.tutorialDone set", done]);

await browser.close();
process.exit(report("04-tutorial", checks, errors));
