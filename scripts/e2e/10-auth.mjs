import { BASE, launch, magicLinkTokenFor, newPage, report, sleep } from "./helpers.mjs";

const browser = await launch();
const { page, errors } = await newPage(browser);
const checks = [];
// REAL mail is sent locally (RESEND_API_KEY) — the Resend sink address swallows it
const email = `delivered+e2e-${Date.now()}@resend.dev`;

// --- the passwordless login page --------------------------------------------
await page.goto(BASE + "/login", { waitUntil: "networkidle0" });
await sleep(500);
checks.push(["email input rendered", !!(await page.$('[data-testid="auth-email"]'))]);
checks.push(["NO password input anywhere", (await page.$("input[type=password]")) === null]);

await page.type('[data-testid="auth-email"]', email);
await page.click('[data-testid="auth-submit"]');
const sentUp = await page
  .waitForSelector('[data-testid="auth-magic-sent"]', { timeout: 15000 })
  .then(() => true).catch(() => false);
checks.push(["magic-link sent state", sentUp]);

// --- complete the login without a mailbox -----------------------------------
// the magicLink plugin stores the raw token in the "verification" collection;
// opening the verify URL is exactly what the emailed link would do
const token = await magicLinkTokenFor(email);
checks.push(["raw token found in the verification collection", !!token]);
if (token) {
  await page.goto(
    `${BASE}/api/auth/magic-link/verify?token=${encodeURIComponent(token)}&callbackURL=%2F`,
    { waitUntil: "networkidle0" },
  );
  await sleep(1500);
  // a first-ever login lands on the lore prologue, then the short intro
  for (const sel of ['[data-testid="lore-skip"]', '[data-testid="intro-skip"]']) {
    const el = await page.$(sel);
    if (el) { await el.click(); await sleep(600); }
  }
  await page.waitForSelector('[data-testid="account"] b', { timeout: 15000 }).catch(() => {});
  const chip = await page.$eval('[data-testid="account"] b', (el) => el.textContent).catch(() => "");
  checks.push(["menu shows the signed-in account chip", !!chip, chip]);
}

await page.screenshot({ path: (process.env.SCRATCH ?? "/tmp") + "/e2e_auth.png" });
await browser.close();
process.exit(report("10-auth", checks, errors));
