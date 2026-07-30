import { readFileSync } from "node:fs";
import puppeteer from "puppeteer-core";

export const BASE = process.env.E2E_BASE ?? "http://localhost:3800";

export async function launch() {
  const browser = await puppeteer.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: "shell",
    args: ["--window-size=1500,1000", "--hide-scrollbars"],
    defaultViewport: { width: 1500, height: 1000 },
  });
  return browser;
}

export async function newPage(browser) {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    const t = m.text();
    if (m.type() === "error" && !t.includes("favicon") && !t.includes("404")) errors.push(t);
  });
  return { page, errors };
}

export function report(name, checks, errors) {
  let failed = 0;
  for (const [label, ok] of checks) {
    if (!ok) { failed++; console.error(`FAIL  ${name}: ${label}`); }
  }
  if (errors.length) { failed++; console.error(`FAIL  ${name}: console errors:\n  ${errors.slice(0, 5).join("\n  ")}`); }
  if (!failed) console.log(`PASS  ${name} (${checks.length} checks)`);
  return failed;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- auth without the UI -----------------------------------------------------
// The login screen is passwordless (magic link only — covered by 10-auth), but
// the server keeps emailAndPassword enabled, so suites create accounts and
// sessions through better-auth's HTTP API. Passwords must be 8+ chars.

export const E2E_PASSWORD = "e2epass123";

async function authPost(page, path, body) {
  // fetch("/api/…") needs the page to be on the app's origin first
  if (!page.url().startsWith("http")) await page.goto(BASE + "/login", { waitUntil: "networkidle0" });
  return page.evaluate(async (p, b) => {
    const r = await fetch(p, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(b),
    });
    return { status: r.status, text: await r.text() };
  }, path, body);
}

/** Create an account + session via the API — the cookie lands in the browser. Throws on failure. */
export async function apiSignUp(page, { name, email, password = E2E_PASSWORD }) {
  const res = await authPost(page, "/api/auth/sign-up/email", { name, email, password });
  if (res.status >= 400) throw new Error(`apiSignUp(${email}) → ${res.status}: ${res.text}`);
  return res;
}

/** Session for an existing account. Throws on failure. */
export async function apiSignIn(page, { email, password = E2E_PASSWORD }) {
  const res = await authPost(page, "/api/auth/sign-in/email", { email, password });
  if (res.status >= 400) throw new Error(`apiSignIn(${email}) → ${res.status}: ${res.text}`);
  return res;
}

// --- better-auth "verification" collection (emailed-token flows) -------------
// Magic-link and delete-account tokens are stored plainly in Mongo, so tests
// complete emailed flows without a mailbox: read the raw token, open the URL
// the mail would have carried.

function envValue(key) {
  if (process.env[key]) return process.env[key];
  for (const file of [".env.local", ".env"]) {
    try {
      const txt = readFileSync(new URL("../../" + file, import.meta.url), "utf8");
      const m = txt.match(new RegExp("^" + key + "=(.*)$", "m"));
      if (m) return m[1].trim().replace(/^["']|["']$/g, "");
    } catch { /* file missing — try the next one */ }
  }
  return undefined;
}

/** Same resolution as lib/server/db.ts: MONGODB_DB, else the URI path, else "shardfall". */
function mongoDbName(uri) {
  const fromEnv = envValue("MONGODB_DB");
  if (fromEnv) return fromEnv;
  try {
    const path = new URL(uri).pathname.replace(/^\//, "");
    if (path) return decodeURIComponent(path);
  } catch { /* srv URIs without a path fall through */ }
  return "shardfall";
}

/** Newest verification row matching `filter`, read straight from Mongo. */
async function latestVerification(filter) {
  const { MongoClient } = await import("mongodb");
  const uri = envValue("MONGODB_URI");
  if (!uri) throw new Error("MONGODB_URI missing (env, .env.local, .env)");
  const client = new MongoClient(uri);
  try {
    return await client.db(mongoDbName(uri)).collection("verification")
      .find(filter).sort({ createdAt: -1, _id: -1 }).limit(1).next();
  } finally {
    await client.close();
  }
}

const reEscape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Raw magic-link token for `email` — polls until the row lands. */
export async function magicLinkTokenFor(email, { timeoutMs = 10000 } = {}) {
  const t0 = Date.now();
  do {
    const doc = await latestVerification({ value: { $regex: reEscape(email) } });
    if (doc) return doc.identifier;
    await sleep(500);
  } while (Date.now() - t0 < timeoutMs);
  return null;
}

/** Raw delete-account token created after `since` (identifier is `delete-account-<token>`). */
export async function deleteAccountToken({ since, timeoutMs = 10000 } = {}) {
  const t0 = Date.now();
  const createdAt = { $gte: since ?? new Date(t0 - 120000) };
  do {
    const doc = await latestVerification({ identifier: /^delete-account-/, createdAt });
    if (doc) return doc.identifier.slice("delete-account-".length);
    await sleep(500);
  } while (Date.now() - t0 < timeoutMs);
  return null;
}
