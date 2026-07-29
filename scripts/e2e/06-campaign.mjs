import { BASE, launch, newPage, report, sleep } from "./helpers.mjs";

const browser = await launch();
const { page, errors } = await newPage(browser);
const checks = [];
const email = `camp${Date.now()}@test.dev`;

// fresh account
await page.goto(BASE + "/login", { waitUntil: "networkidle0" });
await page.click('[data-testid="tab-signup"]');
await sleep(200);
await page.type('[data-testid="auth-name"]', "CampTester");
await page.type('[data-testid="auth-email"]', email);
await page.type('[data-testid="auth-password"]', "secret123");
await page.click('[data-testid="auth-submit"]');
await page.waitForNavigation({ waitUntil: "networkidle0", timeout: 20000 }).catch(() => {});
await sleep(1500);
const loreSkip = await page.$('[data-testid="lore-skip"]');
if (loreSkip) { await loreSkip.click(); await sleep(600); }
const introSkip = await page.$('[data-testid="intro-skip"]');
if (introSkip) { await introSkip.click(); await sleep(400); }

// campaign page
await page.goto(BASE + "/campaign", { waitUntil: "networkidle0" });
await sleep(1500);
checks.push(["journey/progress visible", !!(await page.$('[data-testid="node-ch1-n1"]'))]);
const starsOnPage = await page.$$eval("[class*=tar], [class*=Star]", els => els.length).catch(() => 0);
checks.push(["star UI present", starsOnPage > 0]);

const OVERLAY = '[data-testid="end-overlay"], [data-testid="campaign-rewards"]';

async function startNode(firstAttempt) {
  await page.click('[data-testid="node-ch1-n1"]');
  await sleep(500);
  const pick = await page.$('[data-testid="pick-verdant"]');
  if (pick) { await pick.click(); await sleep(300); }
  await page.click('[data-testid="start-node"]');
  await sleep(900);
  if (firstAttempt) checks.push(["story card", !!(await page.$('[data-testid="story-card"]'))]);
  const begin = await page.$('[data-testid="story-begin"]');
  if (begin) await begin.click();
  const inMatch = await page.waitForFunction(() => location.search.includes("match="), { timeout: 25000 })
    .then(() => true).catch(() => false);
  if (firstAttempt) checks.push(["campaign match started", inMatch]);
  await sleep(2500);
  return inMatch;
}

/** Attack policy: face when lethal, kill big killable threats, otherwise face,
 *  otherwise break the guard wall with the best available trade. */
async function attackPhase() {
  for (let i = 0; i < 8; i++) {
    // one-shot queries miss units mid-animation — give the board time to settle
    const ready = await page.waitForSelector(".boardRow.mine .unitTile.ready", { timeout: 2500 }).catch(() => null);
    if (!ready) break;
    const myAtk = await ready.$eval(".utAtk", el => Number(el.textContent)).catch(() => 0);
    await ready.click();
    await sleep(300);
    const heroLegal = await page.$(".heroCorner.foe.legalTarget");
    const foeHp = Number(await page.$eval(".heroCorner.foe .heroHp", el => el.textContent).catch(() => 99));
    const totalReady = await page.$$eval(".boardRow.mine .unitTile.ready .utAtk",
      els => els.reduce((a, e) => a + Number(e.textContent), 0)).catch(() => 0);
    const pickUids = await page.evaluate((atk) => {
      const tiles = [...document.querySelectorAll(".boardRow.enemy .unitTile.legalTarget")];
      if (!tiles.length) return { threat: null, trade: null };
      const info = tiles.map((t) => ({
        uid: t.dataset.uid,
        hp: Number(t.querySelector(".utHp")?.textContent ?? 99),
        atk: Number(t.querySelector(".utAtk")?.textContent ?? 0),
      }));
      const big = info.filter((u) => u.atk >= 5 && u.hp <= atk).sort((a, b) => b.atk - a.atk);
      const killable = info.filter((u) => u.hp <= atk).sort((a, b) => b.atk - a.atk);
      const trade = killable[0] ?? info.sort((a, b) => b.atk - a.atk)[0];
      return { threat: big[0]?.uid ?? null, trade: trade?.uid ?? null };
    }, myAtk);
    const clickUnit = async (uid) => {
      const t = await page.$(`.boardRow.enemy .unitTile.legalTarget[data-uid="${uid}"]`);
      if (t) { await t.click(); return true; }
      return false;
    };
    if (heroLegal && totalReady >= foeHp) {
      await heroLegal.click();
    } else if (pickUids.threat && await clickUnit(pickUids.threat)) {
      // killed a big buffed attacker
    } else if (heroLegal) {
      await heroLegal.click();
    } else if (!(pickUids.trade && await clickUnit(pickUids.trade))) {
      await page.keyboard.press("Escape");
      break;
    }
    await sleep(1100);
  }
}

async function playMatch() {
  for (let round = 0; round < 26; round++) {
    if (await page.$(OVERLAY)) return;
    for (let i = 0; i < 8; i++) {
      // playable disappears while an optimistic play animates — wait, don't bail
      const has = await page.waitForSelector(".handSlot .cardFace.playable", { timeout: 2500 }).catch(() => null);
      if (!has) break;
      // curve out: biggest units first (they survive the AI's trades), then cheap spells;
      // the fan overlaps, so click in-page
      const clicked = await page.evaluate(() => {
        const faces = [...document.querySelectorAll(".handSlot .cardFace.playable")];
        if (!faces.length) return false;
        const key = (f) => {
          const cost = Number(f.querySelector(".cfCost")?.textContent ?? 99);
          return f.querySelector(".cfSpell") ? 100 + cost : -cost;
        };
        faces.sort((a, b) => key(a) - key(b));
        faces[0].closest(".handSlot").click();
        return true;
      });
      if (!clicked) break;
      await sleep(900);
      if (await page.$(".targetArrow")) {
        // damage spells aim at the biggest enemy attacker; buffs/heals fall back to our own board
        const uid = await page.evaluate(() => {
          const tiles = [...document.querySelectorAll(".boardRow.enemy .unitTile.legalTarget")];
          if (!tiles.length) return null;
          return tiles.map((t) => ({ uid: t.dataset.uid, atk: Number(t.querySelector(".utAtk")?.textContent ?? 0) }))
            .sort((a, b) => b.atk - a.atk)[0].uid;
        });
        const ownUid = uid ? null : await page.evaluate(() => {
          const tiles = [...document.querySelectorAll(".unitTile.legalTarget")];
          if (!tiles.length) return null;
          return tiles.map((t) => ({ uid: t.dataset.uid, atk: Number(t.querySelector(".utAtk")?.textContent ?? 0) }))
            .sort((a, b) => b.atk - a.atk)[0].uid;
        });
        const t = uid
          ? await page.$(`.boardRow.enemy .unitTile.legalTarget[data-uid="${uid}"]`)
          : ownUid ? await page.$(`.unitTile.legalTarget[data-uid="${ownUid}"]`) : null;
        if (t) await t.click(); else await page.keyboard.press("Escape");
        await sleep(800);
      }
    }
    await attackPhase();
    if (await page.$(OVERLAY)) return;
    // clearly lost — concede so the retry starts sooner
    const hp = await page.evaluate(() => ({
      mine: Number(document.querySelector(".heroCorner.mine .heroHp")?.textContent ?? 30),
      foe: Number(document.querySelector(".heroCorner.foe .heroHp")?.textContent ?? 30),
    }));
    if (hp.mine <= 7 && hp.foe >= 25) {
      const concede = await page.$('[data-testid="concede"]');
      if (concede) { await concede.click(); await sleep(300); await concede.click(); }
      await page.waitForSelector(OVERLAY, { timeout: 15000 }).catch(() => {});
      return;
    }
    // the button is disabled while animations / in-flight confirmations settle — wait it out
    await page.waitForSelector(`[data-testid="end-turn"]:not([disabled]), ${OVERLAY}`, { timeout: 20000 }).catch(() => {});
    if (await page.$(OVERLAY)) return;
    const bt = await page.$('[data-testid="end-turn"]:not([disabled])');
    if (!bt) return;
    await bt.click();
    await page.waitForSelector(`[data-testid="end-turn"]:not([disabled]), ${OVERLAY}`, { timeout: 70000 }).catch(() => {});
    await sleep(500);
  }
}

async function nodeState() {
  return page.evaluate(async () => {
    const r = await fetch("/api/campaign", { cache: "no-store" });
    const j = await r.json();
    const n1 = (j.nodes ?? []).find(n => n.id === "ch1-n1") ?? {};
    return { cleared: n1.cleared, stars: n1.stars, unlockedNext: (j.nodes ?? []).find(n => n.id === "ch1-n2")?.unlocked };
  });
}

// play the node; the scripted pilot fights a fair AI, so allow a few retries
let rewardsUp = false;
for (let attempt = 0; attempt < 4; attempt++) {
  await startNode(attempt === 0);
  await playMatch();
  rewardsUp = !!(await page.$('[data-testid="campaign-rewards"]'));
  const genericUp = !!(await page.$('[data-testid="end-overlay"]'));
  if (attempt === 0) checks.push(["a result screen appeared", rewardsUp || genericUp]);
  if (rewardsUp) {
    const txt = await page.$eval('[data-testid="campaign-rewards"]', el => el.innerText).catch(() => "");
    console.log("      reward screen text:", txt.replace(/\n+/g, " | ").slice(0, 260));
    if (attempt === 0) checks.push(["campaign reward screen (stars/rewards)", /star|★|gold|pack/i.test(txt)]);
    await page.screenshot({ path: (process.env.SCRATCH ?? "/tmp") + "/e2e_campaign_rewards.png" });
  } else if (genericUp) {
    const txt = await page.$eval('[data-testid="end-overlay"]', el => el.innerText).catch(() => "");
    console.log("      generic end text:", txt.replace(/\n+/g, " | ").slice(0, 200));
  }
  await page.goto(BASE + "/campaign", { waitUntil: "networkidle0" });
  await sleep(1500);
  const s = await nodeState();
  console.log(`      attempt ${attempt + 1} api state:`, JSON.stringify(s));
  if (s.cleared) break;
}

const apiState = await nodeState();
checks.push(["campaign node ch1-n1 cleared", apiState.cleared === true]);
checks.push(["node stars recorded", (apiState.stars ?? 0) >= 1]);
checks.push(["next node unlocked", apiState.unlockedNext === true]);

await page.screenshot({ path: (process.env.SCRATCH ?? "/tmp") + "/e2e_campaign_page.png" });
await browser.close();
process.exit(report("06-campaign", checks, errors));
