/** Engine unit tests — run with: npx tsx scripts/test-engine.ts */

import { applyAction, newGame, registerCards, getCard } from "../lib/game/engine";
import { aiTakeTurn } from "../lib/game/ai";
import { CARD_POOL } from "../lib/game/cards-data";
import type { GameCard, GameState } from "../lib/game/types";

const TEST_CARDS: GameCard[] = [
  { id: "t-vanilla", name: "Vanilla", faction: "neutral", type: "unit", rarity: "common", cost: 1, attack: 2, health: 2, text: "" },
  { id: "t-rush", name: "Rusher", faction: "neutral", type: "unit", rarity: "common", cost: 1, attack: 2, health: 1, keywords: ["rush"], text: "" },
  { id: "t-guard", name: "Guardian", faction: "neutral", type: "unit", rarity: "common", cost: 1, attack: 1, health: 4, keywords: ["guard"], text: "" },
  { id: "t-pierce", name: "Piercer", faction: "neutral", type: "unit", rarity: "common", cost: 1, attack: 5, health: 5, keywords: ["rush", "piercing"], text: "" },
  { id: "t-life", name: "Leech", faction: "neutral", type: "unit", rarity: "common", cost: 1, attack: 3, health: 3, keywords: ["rush", "lifesteal"], text: "" },
  { id: "t-ignite", name: "Burner", faction: "neutral", type: "unit", rarity: "common", cost: 1, attack: 1, health: 3, igniteX: 2, text: "" },
  { id: "t-grow", name: "Grower", faction: "neutral", type: "unit", rarity: "common", cost: 1, attack: 1, health: 1, keywords: ["overgrow"], text: "" },
  { id: "t-rites", name: "Doomed", faction: "neutral", type: "unit", rarity: "common", cost: 1, attack: 1, health: 1, lastRites: { ops: [{ op: "DRAW", amount: 1 }] }, text: "" },
  { id: "t-bolt", name: "Bolt", faction: "neutral", type: "spell", rarity: "common", cost: 1, spell: { target: "ENEMY_UNIT", ops: [{ op: "DAMAGE", amount: 3 }] }, text: "" },
];

registerCards([...CARD_POOL, ...TEST_CARDS]);

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL  ${name} ${detail}`); }
}

function freshGame(handP0: string[], handP1: string[] = []): GameState {
  const g = newGame(Array(30).fill("t-vanilla"), Array(30).fill("t-vanilla"), 42, "pyre", "abyss");
  g.players[0].hand = [...handP0];
  g.players[1].hand = [...handP1];
  g.players[0].mana = 10; g.players[0].manaMax = 10;
  g.players[1].mana = 10; g.players[1].manaMax = 10;
  return g;
}

// setup sanity
{
  const g = newGame(Array(50).fill("t-vanilla"), Array(50).fill("t-vanilla"), 7, "pyre", "abyss");
  check("P0 opening hand 5 (4 + first draw)", g.players[0].hand.length === 5);
  check("P1 opening hand 5", g.players[1].hand.length === 5);
  check("P0 starts with 1/1 mana", g.players[0].mana === 1 && g.players[0].manaMax === 1);
  check("P0 active", g.active === 0);
}

// play unit + summoning sickness
{
  let g = freshGame(["t-vanilla"]);
  const r = applyAction(g, { type: "PLAY_CARD", handIndex: 0 });
  check("unit played", r.state.players[0].board.length === 1 && !r.error);
  check("mana deducted", r.state.players[0].mana === 9);
  const atk = applyAction(r.state, { type: "ATTACK", attackerUid: r.state.players[0].board[0].uid });
  check("summoning sickness blocks attack", !!atk.error);
}

// rush
{
  let g = freshGame(["t-rush"]);
  let r = applyAction(g, { type: "PLAY_CARD", handIndex: 0 });
  r = applyAction(r.state, { type: "ATTACK", attackerUid: r.state.players[0].board[0].uid });
  check("rush attacks hero immediately", !r.error && r.state.players[1].hp === 28);
}

// guard enforcement
{
  let g = freshGame(["t-rush"]);
  g.players[1].board.push({ uid: 900, cardId: "t-guard", attack: 1, health: 4, maxHealth: 4, keywords: ["guard"], enteredTurn: 0, attacksLeft: 0 });
  g.players[1].board.push({ uid: 901, cardId: "t-vanilla", attack: 2, health: 2, maxHealth: 2, keywords: [], enteredTurn: 0, attacksLeft: 0 });
  let r = applyAction(g, { type: "PLAY_CARD", handIndex: 0 });
  const uid = r.state.players[0].board[0].uid;
  check("cannot hit hero past guard", !!applyAction(r.state, { type: "ATTACK", attackerUid: uid }).error);
  check("cannot hit non-guard past guard", !!applyAction(r.state, { type: "ATTACK", attackerUid: uid, targetUid: 901 }).error);
  check("can hit guard", !applyAction(r.state, { type: "ATTACK", attackerUid: uid, targetUid: 900 }).error);
}

// piercing overflow
{
  let g = freshGame(["t-pierce"]);
  g.players[1].board.push({ uid: 910, cardId: "t-vanilla", attack: 2, health: 2, maxHealth: 2, keywords: [], enteredTurn: 0, attacksLeft: 0 });
  let r = applyAction(g, { type: "PLAY_CARD", handIndex: 0 });
  r = applyAction(r.state, { type: "ATTACK", attackerUid: r.state.players[0].board[0].uid, targetUid: 910 });
  check("piercing overflow hits hero", r.state.players[1].hp === 30 - 3, `hp=${r.state.players[1].hp}`);
  check("pierced unit died", r.state.players[1].board.length === 0);
}

// lifesteal
{
  let g = freshGame(["t-life"]);
  g.players[0].hp = 20;
  let r = applyAction(g, { type: "PLAY_CARD", handIndex: 0 });
  r = applyAction(r.state, { type: "ATTACK", attackerUid: r.state.players[0].board[0].uid });
  check("lifesteal heals own hero", r.state.players[0].hp === 23, `hp=${r.state.players[0].hp}`);
}

// ignite at end of turn
{
  let g = freshGame(["t-ignite"]);
  let r = applyAction(g, { type: "PLAY_CARD", handIndex: 0 });
  r = applyAction(r.state, { type: "END_TURN" });
  const totalEnemy = r.state.players[1].hp + r.state.players[1].board.reduce((s, u) => s + u.health, 0);
  check("ignite dealt 2 somewhere", r.events.some((e) => e.type === "IGNITE"), JSON.stringify(r.events.map(e=>e.type)));
  check("ignite damage applied", r.state.players[1].hp === 28 || totalEnemy < 30 + 0, `enemy hp=${r.state.players[1].hp}`);
}

// overgrow at own turn start
{
  let g = freshGame(["t-grow"]);
  let r = applyAction(g, { type: "PLAY_CARD", handIndex: 0 });
  r = applyAction(r.state, { type: "END_TURN" }); // to P1
  r = applyAction(r.state, { type: "END_TURN" }); // back to P0 → overgrow
  const u = r.state.players[0].board[0];
  check("overgrow grew +1/+1", u.attack === 2 && u.health === 2, `${u.attack}/${u.health}`);
}

// last rites
{
  let g = freshGame(["t-rites"], ["t-bolt"]);
  let r = applyAction(g, { type: "PLAY_CARD", handIndex: 0 });
  const handBefore = r.state.players[0].hand.length;
  r = applyAction(r.state, { type: "END_TURN" });
  const uid = r.state.players[0].board[0].uid;
  const boltIdx = r.state.players[1].hand.indexOf("t-bolt");
  r = applyAction(r.state, { type: "PLAY_CARD", handIndex: boltIdx, targetUid: uid });
  check("last rites drew a card on death", r.state.players[0].hand.length === handBefore + 1,
    `hand=${r.state.players[0].hand.length} vs ${handBefore}`);
  check("unit died", r.state.players[0].board.length === 0);
}

// Varkha arrival AoE
{
  let g = freshGame(["pyre-003"]);
  g.players[1].board.push({ uid: 920, cardId: "t-vanilla", attack: 2, health: 2, maxHealth: 2, keywords: [], enteredTurn: 0, attacksLeft: 0 });
  const r = applyAction(g, { type: "PLAY_CARD", handIndex: 0 });
  check("Varkha AoE killed the 2/2", r.state.players[1].board.length === 0);
}

// Maelvyra return-all
{
  let g = freshGame(["abyss-003"]);
  g.players[0].board.push({ uid: 930, cardId: "t-vanilla", attack: 2, health: 2, maxHealth: 2, keywords: [], enteredTurn: 0, attacksLeft: 0 });
  g.players[1].board.push({ uid: 931, cardId: "t-vanilla", attack: 2, health: 2, maxHealth: 2, keywords: [], enteredTurn: 0, attacksLeft: 0 });
  const r = applyAction(g, { type: "PLAY_CARD", handIndex: 0 });
  check("only Maelvyra remains on board",
    r.state.players[0].board.length === 1 && r.state.players[1].board.length === 0);
  check("returned to hands", r.state.players[1].hand.includes("t-vanilla"));
}

// accelerated ramp + double draw from own turn 5
{
  let g = newGame(Array(50).fill("t-vanilla"), Array(50).fill("t-vanilla"), 11, "pyre", "abyss");
  for (let i = 0; i < 8; i++) g = applyAction(g, { type: "END_TURN" }).state; // each side takes 4 more turns
  // P0 is now starting their 5th turn on the next END_TURN cycle
  const handBefore = g.players[0].hand.length;
  const r = applyAction(g, { type: "END_TURN" }); // P1 ends → P0 turn 5 starts... depends on parity; instead check manaMax growth
  check("ramp accelerated by own turn 5+", r.state.players.some((p) => p.manaMax >= 6), `max=${r.state.players.map(p=>p.manaMax)}`);
  const drewTwo = r.events.filter((e) => e.type === "DRAW" || e.type === "FATIGUE").length >= 2;
  check("double draw on turn 5+", drewTwo, JSON.stringify(r.events.map(e=>e.type)));
}

// fatigue
{
  const g = newGame([], [], 3, "pyre", "abyss");
  check("fatigue damaged P0 on empty-deck draws", g.players[0].hp < 30);
}

// AI plays a full game vs itself without errors
{
  let g = newGame(Array(50).fill(0).map((_, i) => ["t-vanilla", "t-rush", "t-guard", "t-bolt", "t-ignite"][i % 5]),
                  Array(50).fill(0).map((_, i) => ["t-vanilla", "t-life", "t-grow", "t-pierce", "t-rites"][i % 5]),
                  99, "pyre", "verdant");
  let safety = 400;
  while (g.winner === null && safety-- > 0) {
    const steps = aiTakeTurn(g);
    if (steps.length === 0) break;
    g = steps[steps.length - 1].result.state;
  }
  check("AI vs AI reached a winner", g.winner !== null, `turns=${g.turn}`);
  check("game ended in sane turn count", g.turn < 120, `turns=${g.turn}`);
}

// real pool sanity: every referenced token exists, ops valid
{
  let ok = true;
  for (const c of CARD_POOL) {
    for (const eff of [c.arrival, c.lastRites, c.spell]) {
      for (const op of eff?.ops ?? []) {
        if (op.op === "SUMMON" && op.token) {
          try { getCard(op.token); } catch { ok = false; console.error(`missing token ${op.token} in ${c.id}`); }
        }
      }
    }
    if (c.type === "unit" && (c.attack === undefined || c.health === undefined)) { ok = false; console.error(`unit missing stats: ${c.id}`); }
    if (c.type === "spell" && c.arrival) { ok = false; console.error(`spell has arrival: ${c.id}`); }
  }
  check("card pool structurally valid", ok);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
