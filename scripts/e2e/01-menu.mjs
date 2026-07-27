import { BASE, launch, newPage, report, sleep } from "./helpers.mjs";

const browser = await launch();
const { page, errors } = await newPage(browser);
const checks = [];

await page.goto(BASE + "/", { waitUntil: "networkidle0" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle0" });
await sleep(900);

// logged-out visitors get the landing page
checks.push(["landing page for guests", !!(await page.$('[data-testid="landing-cta"]'))]);

// sign in to reach the menu
const email = `menu${Date.now()}@test.dev`;
await page.goto(BASE + "/login", { waitUntil: "networkidle0" });
await page.click('[data-testid="tab-signup"]');
await sleep(200);
await page.type('[data-testid="auth-name"]', "MenuTester");
await page.type('[data-testid="auth-email"]', email);
await page.type('[data-testid="auth-password"]', "secret123");
await page.click('[data-testid="auth-submit"]');
await page.waitForNavigation({ waitUntil: "networkidle0", timeout: 20000 }).catch(() => {});
await sleep(1200);

checks.push(["intro appears on first visit", !!(await page.$('[data-testid="intro"]'))]);
await page.click('[data-testid="intro-skip"]');
await sleep(400);
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

// intro not shown on revisit
await page.reload({ waitUntil: "networkidle0" });
await sleep(600);
checks.push(["intro skipped on revisit", !(await page.$('[data-testid="intro"]'))]);

// deck picker
await page.click('[data-testid="menu-play"]');
await sleep(300);
checks.push(["deck choices shown", !!(await page.$('[data-testid="deck-pyre"]')) && !!(await page.$('[data-testid="deck-verdant"]'))]);

await browser.close();
process.exit(report("01-menu", checks, errors));
