import puppeteer from "puppeteer-core";

const S = "/private/tmp/claude-501/-Users-artemetik-Developer-games/a7a6293a-d928-4fb1-b64d-6022978adfea/scratchpad";
const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "shell",
  args: ["--window-size=1500,1100", "--hide-scrollbars"],
  defaultViewport: { width: 1500, height: 1100 },
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

await page.goto("http://localhost:3800", { waitUntil: "networkidle0" });
await new Promise((r) => setTimeout(r, 1200)); // let entrance animations finish

// hover the first card to engage tilt + sheen
const cards = await page.$$(".card3d");
const box0 = await cards[0].boundingBox();
await page.mouse.move(box0.x + box0.width * 0.7, box0.y + box0.height * 0.3);
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: `${S}/verify_hover.png` });

// flip the middle card
await cards[1].click();
await new Promise((r) => setTimeout(r, 500)); // mid-flip
await page.screenshot({ path: `${S}/verify_midflip.png` });
await new Promise((r) => setTimeout(r, 600)); // settled
await page.mouse.move(40, 40);
await new Promise((r) => setTimeout(r, 300));
await page.screenshot({ path: `${S}/verify_flipped.png` });

// flip it back
await cards[1].click();
await new Promise((r) => setTimeout(r, 900));

console.log("JS errors:", errors.length ? errors : "none");
await browser.close();
