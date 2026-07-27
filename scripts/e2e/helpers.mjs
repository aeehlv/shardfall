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
