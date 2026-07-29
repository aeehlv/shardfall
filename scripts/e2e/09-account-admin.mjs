import { BASE, launch, newPage, report, sleep } from "./helpers.mjs";

const browser = await launch();
const { page, errors } = await newPage(browser);
const checks = [];
const userEmail = `acct${Date.now()}@test.dev`;
const userName = `AcctTester${String(Date.now()).slice(-5)}`;
// the allowlisted admin (ADMIN_EMAILS) — created on first run, reused after
const ADMIN_EMAIL = "apps@etik.lv";
const ADMIN_PASSWORD = "e2e-warden-9931";

async function signUp(name, email, password) {
  await page.goto(BASE + "/login", { waitUntil: "networkidle0" });
  await page.click('[data-testid="tab-signup"]');
  await sleep(200);
  await page.type('[data-testid="auth-name"]', name);
  await page.type('[data-testid="auth-email"]', email);
  await page.type('[data-testid="auth-password"]', password);
  await page.click('[data-testid="auth-submit"]');
  await page.waitForNavigation({ waitUntil: "networkidle0", timeout: 20000 }).catch(() => {});
  await sleep(1500);
  for (const sel of ['[data-testid="lore-skip"]', '[data-testid="intro-skip"]']) {
    const el = await page.$(sel);
    if (el) { await el.click(); await sleep(600); }
  }
}

async function signIn(email, password) {
  await page.goto(BASE + "/login", { waitUntil: "networkidle0" });
  await page.type('[data-testid="auth-email"]', email);
  await page.type('[data-testid="auth-password"]', password);
  await page.click('[data-testid="auth-submit"]');
  await page.waitForNavigation({ waitUntil: "networkidle0", timeout: 20000 }).catch(() => {});
  await sleep(1200);
}

async function signOut() {
  await page.evaluate(async () => {
    await fetch("/api/auth/sign-out", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  });
  await sleep(500);
}

// --- fresh user: account page ----------------------------------------------
await signUp(userName, userEmail, "secret123");
// a demo top-up seeds the ledger so the txn table has a row to show
await page.goto(BASE + "/", { waitUntil: "networkidle0" });
await page.waitForSelector(".moreBtn", { timeout: 10000 }).catch(() => {});
await page.click(".moreBtn").catch(() => {});
await sleep(300);
const topup = await page.$('[data-testid="admin-gold"]');
if (topup) { await topup.click(); await sleep(1200); }

await page.goto(BASE + "/account", { waitUntil: "networkidle0" });
await page.waitForSelector('[data-testid="account-identity"]', { timeout: 12000 }).catch(() => {});
checks.push(["account page renders", !!(await page.$('[data-testid="account-page"]'))]);
checks.push(["identity section", !!(await page.$('[data-testid="account-identity"]'))]);
const shownName = await page.$eval('[data-testid="account-name"]', (el) => el.textContent).catch(() => "");
checks.push(["identity shows the duelist name", shownName === userName, shownName]);
checks.push(["wallet section", !!(await page.$('[data-testid="account-wallet"]'))]);
const txnTable = await page
  .waitForSelector('[data-testid="txn-table"]', { timeout: 10000 })
  .then(() => true).catch(() => false);
checks.push(["transaction table renders", txnTable]);
const txnRows = txnTable
  ? await page.$$eval('[data-testid="txn-table"] tbody tr', (rows) => rows.length)
  : 0;
checks.push(["ledger has the top-up row", txnRows >= 1, `${txnRows} rows`]);

// --- plain user is denied on /admin -----------------------------------------
await page.goto(BASE + "/admin", { waitUntil: "networkidle0" });
const deniedUp = await page
  .waitForSelector('[data-testid="admin-denied"]', { timeout: 10000 })
  .then(() => true).catch(() => false);
checks.push(["/admin denied for a plain user", deniedUp]);
checks.push(["no admin table for a plain user", !(await page.$('[data-testid="admin-players"]'))]);

// --- the allowlisted admin --------------------------------------------------
await signOut();
await signUp("Warden", ADMIN_EMAIL, ADMIN_PASSWORD);
// on re-runs the account already exists — fall back to signing in
const adminSession = await page.evaluate(async () => {
  const r = await fetch("/api/auth/get-session", { cache: "no-store" });
  const j = await r.json().catch(() => null);
  return j?.user?.email ?? null;
});
if (adminSession !== ADMIN_EMAIL) await signIn(ADMIN_EMAIL, ADMIN_PASSWORD);

await page.goto(BASE + "/admin", { waitUntil: "networkidle0" });
const adminUp = await page
  .waitForSelector('[data-testid="admin-page"]', { timeout: 12000 })
  .then(() => true).catch(() => false);
checks.push(["/admin renders for the allowlisted admin", adminUp]);
checks.push(["stats tiles render", !!(await page.$('[data-testid="admin-stats"]'))]);
const statPlayers = await page.$eval('[data-testid="admin-stats"] .admTile b', (el) => el.textContent).catch(() => "—");
checks.push(["player count populated", statPlayers !== "—" && Number(statPlayers.replace(/\D/g, "")) > 0, statPlayers]);

// --- find the fresh user and grant them gold --------------------------------
await page.type('[data-testid="admin-search"]', userName);
await page.waitForFunction(
  (n) => document.querySelector('[data-testid="admin-players"]')?.textContent.includes(n),
  { timeout: 10000 }, userName,
).catch(() => {});
const row = await page.$('[data-testid="admin-players"] tr[data-testid^="admin-row-"]');
checks.push(["player table shows the searched user", !!row]);
if (row) {
  const rowId = await row.evaluate((el) => el.dataset.testid.replace("admin-row-", ""));
  const goldBefore = await row.$eval(".cNum.gold", (el) => Number(el.textContent.replace(/\D/g, "")));
  await row.click();
  await page.waitForSelector(`[data-testid="admin-drawer-${rowId}"]`, { timeout: 8000 }).catch(() => {});
  await page.type(`[data-testid="admin-grant-gold-${rowId}"]`, "100");
  await page.click(`[data-testid="admin-grant-btn-${rowId}"]`);
  const grew = await page.waitForFunction(
    (id, want) => {
      const cell = document.querySelector(`[data-testid="admin-row-${id}"] .cNum.gold`);
      return cell && Number(cell.textContent.replace(/\D/g, "")) === want;
    },
    { timeout: 10000 }, rowId, goldBefore + 100,
  ).then(() => true).catch(() => false);
  const goldAfter = await page.$eval(`[data-testid="admin-row-${rowId}"] .cNum.gold`,
    (el) => Number(el.textContent.replace(/\D/g, ""))).catch(() => NaN);
  checks.push(["grant raises the player's gold in the table", grew, `${goldBefore}→${goldAfter}`]);
}

await page.screenshot({ path: (process.env.SCRATCH ?? "/tmp") + "/e2e_account_admin.png" });
await browser.close();
// expected responses: 403 (the plain-user /admin denial IS the test) and 422
// (admin signup on re-runs answers already-exists before the sign-in fallback)
const realErrors = errors.filter((e) => !e.includes("403") && !e.includes("422"));
process.exit(report("09-account-admin", checks, realErrors));
