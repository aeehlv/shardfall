import { BASE, apiSignIn, apiSignUp, deleteAccountToken, launch, newPage, report, sleep } from "./helpers.mjs";

const browser = await launch();
const { page, errors } = await newPage(browser);
const checks = [];
// the delete-account flow sends REAL mail — the Resend sink address swallows it
const userEmail = `delivered+acct${Date.now()}@resend.dev`;
const userName = `AcctTester${String(Date.now()).slice(-5)}`;
const userPassword = "e2epass123";
// the allowlisted admin (ADMIN_EMAILS) — created on first run, reused after
const ADMIN_EMAIL = "apps@etik.lv";
const ADMIN_PASSWORD = "e2e-warden-9931";

async function skipIntros() {
  for (const sel of ['[data-testid="lore-skip"]', '[data-testid="intro-skip"]']) {
    const el = await page.$(sel);
    if (el) { await el.click(); await sleep(600); }
  }
}

async function signOut() {
  await page.evaluate(async () => {
    await fetch("/api/auth/sign-out", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  });
  await sleep(500);
}

// --- fresh user: account page ----------------------------------------------
await apiSignUp(page, { name: userName, email: userEmail, password: userPassword });
// a demo top-up seeds the ledger so the txn table has a row to show
await page.goto(BASE + "/", { waitUntil: "networkidle0" });
await sleep(1200);
await skipIntros();
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
// created on the first run; on re-runs sign-up answers already-exists → sign in
try {
  await apiSignUp(page, { name: "Warden", email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
} catch {
  await apiSignIn(page, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
}
await page.goto(BASE + "/", { waitUntil: "networkidle0" });
await sleep(1000);
await skipIntros();

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

// --- delete account: passwordless flow ends in an email confirmation --------
// the fresh throwaway user deletes itself; the admin account must survive re-runs
await signOut();
await apiSignIn(page, { email: userEmail, password: userPassword });
await page.goto(BASE + "/account", { waitUntil: "networkidle0" });
await page.waitForSelector('[data-testid="account-page"]', { timeout: 12000 }).catch(() => {});
const delBtn = await page.$('[data-testid="account-delete"]');
if (delBtn) {
  const clickedAt = new Date(Date.now() - 10000); // slack for clock drift
  await delBtn.click();
  const delSent = await page
    .waitForSelector('[data-testid="account-delete-sent"]', { timeout: 15000 })
    .then(() => true).catch(() => false);
  checks.push(["delete requested → confirmation-sent state", delSent]);
  // complete the deletion the mailbox-free way: raw token from the
  // verification collection → the callback URL the mail would have carried
  const delToken = await deleteAccountToken({ since: clickedAt });
  checks.push(["delete token stored in the verification collection", !!delToken]);
  if (delToken) {
    await page.goto(
      `${BASE}/api/auth/delete-user/callback?token=${encodeURIComponent(delToken)}&callbackURL=%2F`,
      { waitUntil: "networkidle0" },
    );
    await sleep(800);
    const sessionAfter = await page.evaluate(async () => {
      const r = await fetch("/api/auth/get-session", { cache: "no-store" });
      const j = await r.json().catch(() => null);
      return j?.user?.email ?? null;
    });
    checks.push(["account gone after the emailed confirmation", sessionAfter === null, String(sessionAfter)]);
  }
} else {
  console.log("      note: no [data-testid=account-delete] on /account — delete flow not exercised");
}

await browser.close();
// expected responses: 403 (the plain-user /admin denial IS the test) and 422
// (admin signup on re-runs answers already-exists before the sign-in fallback)
const realErrors = errors.filter((e) => !e.includes("403") && !e.includes("422"));
process.exit(report("09-account-admin", checks, realErrors));
