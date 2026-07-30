import { BASE, apiSignUp, launch, newPage, report, sleep } from "./helpers.mjs";

const browser = await launch();
const { page, errors } = await newPage(browser);
const checks = [];

await page.goto(BASE + "/", { waitUntil: "networkidle0" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle0" });
await sleep(900);

// logged-out visitors get the landing page
checks.push(["landing page for guests", !!(await page.$('[data-testid="landing-cta"]'))]);

// sign in to reach the menu (accounts come from the better-auth API — the
// passwordless login UI itself is covered by 10-auth)
const email = `menu${Date.now()}@test.dev`;
await apiSignUp(page, { name: "MenuTester", email });
await page.goto(BASE + "/", { waitUntil: "networkidle0" });
await sleep(1200);

// new accounts see the lore prologue first, then the short intro
checks.push(["lore prologue for new account", !!(await page.$('[data-testid="lore-prologue"]'))]);
const loreSkip = await page.$('[data-testid="lore-skip"]');
if (loreSkip) { await loreSkip.click(); await sleep(700); }
checks.push(["intro appears after the prologue", !!(await page.$('[data-testid="intro"]'))]);
const introSkip = await page.$('[data-testid="intro-skip"]');
if (introSkip) { await introSkip.click(); await sleep(500); }
checks.push(["intro dismissed by skip", !(await page.$('[data-testid="intro"]'))]);
checks.push(["wallet visible", !!(await page.$('[data-testid="wallet"]'))]);
checks.push(["play button", !!(await page.$('[data-testid="menu-play"]'))]);
checks.push(["ranked button", !!(await page.$('[data-testid="menu-ranked"]'))]);
checks.push(["leaderboard button", !!(await page.$('[data-testid="menu-leaderboard"]'))]);
checks.push(["store link", !!(await page.$('[data-testid="menu-store"]'))]);

// starter decks granted
const deckCount = await page.evaluate(() =>
  Object.keys(JSON.parse(localStorage.getItem("shardfall-profile-v1") ?? "{}").decks ?? {}).length);
checks.push(["3 starter decks granted", deckCount === 3]);

// neither prologue nor intro on revisit
await page.reload({ waitUntil: "networkidle0" });
await sleep(900);
checks.push(["prologue + intro skipped on revisit",
  !(await page.$('[data-testid="intro"]')) && !(await page.$('[data-testid="lore-prologue"]'))]);

// deck picker
await page.click('[data-testid="menu-play"]');
await sleep(300);
checks.push(["deck choices shown", !!(await page.$('[data-testid="deck-pyre"]')) && !!(await page.$('[data-testid="deck-verdant"]'))]);

await browser.close();
process.exit(report("01-menu", checks, errors));
