/** Shardfall engine — pure, deterministic, event-emitting. No React, no IO. */

import type {
  ActionResult, EffectOp, GameAction, GameCard, GameEvent, GameState, PlayerState,
  TriggeredEffect, UnitInstance,
} from "./types";

// ---------- card registry ----------------------------------------------------

let REGISTRY: Record<string, GameCard> = {};
export function registerCards(cards: GameCard[]) {
  REGISTRY = Object.fromEntries(cards.map((c) => [c.id, c]));
}
export function getCard(id: string): GameCard {
  const c = REGISTRY[id];
  if (!c) throw new Error(`Unknown card: ${id}`);
  return c;
}
export function allCards(): GameCard[] {
  return Object.values(REGISTRY);
}

// ---------- deterministic RNG (mulberry32) -----------------------------------

function rng(state: GameState): number {
  state.rngState = (state.rngState + 0x6d2b79f5) | 0;
  let t = state.rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function randInt(state: GameState, n: number): number {
  return Math.floor(rng(state) * n);
}

// ---------- setup ------------------------------------------------------------

export const HERO_HP = 30;
export const BOARD_CAP = 7;
export const HAND_CAP = 10;
export const MANA_CAP = 10;

export function shuffledDeck(cards: string[], seedState: { s: number }): string[] {
  const arr = [...cards];
  const st = { rngState: seedState.s } as GameState;
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(st, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  seedState.s = st.rngState;
  return arr;
}

export function newGame(
  deckA: string[], deckB: string[], seed: number,
  heroA: PlayerState["hero"], heroB: PlayerState["hero"],
): GameState {
  const seedState = { s: seed | 0 };
  const mk = (deck: string[], hero: PlayerState["hero"]): PlayerState => ({
    hero, hp: HERO_HP, mana: 0, manaMax: 0, turnsTaken: 0,
    deck: shuffledDeck(deck, seedState), hand: [], board: [], fatigue: 0,
  });
  const state: GameState = {
    turn: 0, active: 1, players: [mk(deckA, heroA), mk(deckB, heroB)],
    winner: null, rngState: seedState.s, nextUid: 1,
  };
  // opening hands: P0 draws 4, P1 draws 5 (P1 acts second)
  for (let i = 0; i < 4; i++) drawCard(state, 0, []);
  for (let i = 0; i < 5; i++) drawCard(state, 1, []);
  // guarantee a turn-1 play: every opening hand holds at least one 1-cost card
  for (const p of [0, 1] as const) ensureCheapOpener(state, p);
  // start P0's first turn
  const events: GameEvent[] = [];
  startTurn(state, 0, events);
  return state;
}

// ---------- internals --------------------------------------------------------

function drawCard(state: GameState, p: 0 | 1, events: GameEvent[]) {
  const pl = state.players[p];
  if (pl.deck.length === 0) {
    pl.fatigue += 1;
    pl.hp -= pl.fatigue;
    events.push({ type: "FATIGUE", player: p, amount: pl.fatigue });
    return;
  }
  const cardId = pl.deck.pop() as string;
  if (pl.hand.length >= HAND_CAP) {
    events.push({ type: "DRAW", player: p, cardId, burned: true });
  } else {
    pl.hand.push(cardId);
    events.push({ type: "DRAW", player: p, cardId });
  }
}

/** Swap the most expensive opening-hand card for the cheapest ≤1-cost card in the deck. */
function ensureCheapOpener(state: GameState, p: 0 | 1) {
  const pl = state.players[p];
  if (pl.hand.some((id) => getCard(id).cost <= 1)) return;
  const deckIdx = pl.deck
    .map((id, i) => ({ cost: getCard(id).cost, i }))
    .filter((x) => x.cost <= 1)
    .sort((a, b) => a.cost - b.cost)[0]?.i;
  if (deckIdx === undefined) return;
  const handIdx = pl.hand
    .map((id, i) => ({ cost: getCard(id).cost, i }))
    .sort((a, b) => b.cost - a.cost)[0].i;
  const tmp = pl.hand[handIdx];
  pl.hand[handIdx] = pl.deck[deckIdx];
  pl.deck[deckIdx] = tmp;
}

function startTurn(state: GameState, p: 0 | 1, events: GameEvent[]) {
  state.turn += 1;
  state.active = p;
  const pl = state.players[p];
  pl.turnsTaken += 1;
  // ramp: +1 aether per turn early, +2 from each player's 5th turn (cap 10)
  const gain = pl.turnsTaken >= 5 ? 2 : 1;
  pl.manaMax = Math.min(MANA_CAP, pl.manaMax + gain);
  pl.mana = pl.manaMax;
  // late-game refuel: the accelerated ramp is paired with a second draw per turn
  const draws = pl.turnsTaken >= 5 ? 2 : 1;
  events.push({ type: "TURN_START", player: p, turn: state.turn });
  for (const u of pl.board) {
    u.attacksLeft = 1;
    if (u.keywords.includes("overgrow") && u.enteredTurn < state.turn) {
      u.attack += 1; u.health += 1; u.maxHealth += 1;
      events.push({ type: "OVERGROW", uid: u.uid });
      events.push({ type: "BUFF", targetUid: u.uid, attack: 1, health: 1 });
    }
  }
  for (let i = 0; i < draws; i++) drawCard(state, p, events);
}

function findUnit(state: GameState, uid: number): { unit: UnitInstance; owner: 0 | 1 } | null {
  for (const p of [0, 1] as const) {
    const unit = state.players[p].board.find((u) => u.uid === uid);
    if (unit) return { unit, owner: p };
  }
  return null;
}

function dealDamageToUnit(state: GameState, u: UnitInstance, amount: number, events: GameEvent[]) {
  if (amount <= 0) return;
  u.health -= amount;
  events.push({ type: "DAMAGE", targetUid: u.uid, amount });
}

function dealDamageToHero(state: GameState, p: 0 | 1, amount: number, events: GameEvent[]) {
  if (amount <= 0) return;
  state.players[p].hp -= amount;
  events.push({ type: "DAMAGE", player: p, amount });
}

function healHero(state: GameState, p: 0 | 1, amount: number, events: GameEvent[]) {
  const pl = state.players[p];
  const healed = Math.min(amount, HERO_HP - pl.hp);
  if (healed <= 0) return;
  pl.hp += healed;
  events.push({ type: "HEAL", player: p, amount: healed });
}

function summonUnit(state: GameState, p: 0 | 1, cardId: string, events: GameEvent[]): UnitInstance | null {
  const pl = state.players[p];
  if (pl.board.length >= BOARD_CAP) return null;
  const card = getCard(cardId);
  const unit: UnitInstance = {
    uid: state.nextUid++, cardId,
    attack: card.attack ?? 0, health: card.health ?? 1, maxHealth: card.health ?? 1,
    keywords: [...(card.keywords ?? [])], igniteX: card.igniteX,
    enteredTurn: state.turn, attacksLeft: card.keywords?.includes("rush") ? 1 : 0,
  };
  pl.board.push(unit);
  events.push({ type: "UNIT_SUMMONED", player: p, uid: unit.uid, cardId });
  return unit;
}

/** Remove dead units, firing Last Rites (which may cascade). */
function processDeaths(state: GameState, events: GameEvent[]) {
  let again = true;
  while (again) {
    again = false;
    for (const p of [0, 1] as const) {
      const pl = state.players[p];
      const dead = pl.board.filter((u) => u.health <= 0);
      if (dead.length === 0) continue;
      pl.board = pl.board.filter((u) => u.health > 0);
      for (const u of dead) {
        events.push({ type: "DEATH", uid: u.uid, player: p, cardId: u.cardId });
        const lr = getCard(u.cardId).lastRites;
        if (lr) {
          runOps(state, p, lr.ops, undefined, undefined, events);
          again = true;
        }
      }
    }
  }
  checkWinner(state, events);
}

function checkWinner(state: GameState, events: GameEvent[]) {
  if (state.winner !== null) return;
  const dead0 = state.players[0].hp <= 0;
  const dead1 = state.players[1].hp <= 0;
  if (dead0 || dead1) {
    state.winner = dead0 ? 1 : 0; // active player wins simultaneous destruction edge case? favor non-dead0
    events.push({ type: "GAME_OVER", winner: state.winner });
  }
}

/** Execute effect ops for `owner`. `sourceUid` excluded from RETURN_ALL_OTHERS / GRANT allies. */
function runOps(
  state: GameState, owner: 0 | 1, ops: EffectOp[],
  targetUid: number | undefined, sourceUid: number | undefined, events: GameEvent[],
) {
  const enemy = (1 - owner) as 0 | 1;
  for (const op of ops) {
    switch (op.op) {
      case "DAMAGE": {
        if (targetUid === undefined) break;
        const f = findUnit(state, targetUid);
        if (f) dealDamageToUnit(state, f.unit, op.amount ?? 0, events);
        break;
      }
      case "DAMAGE_ALL_ENEMIES":
        for (const u of [...state.players[enemy].board]) dealDamageToUnit(state, u, op.amount ?? 0, events);
        break;
      case "DAMAGE_RANDOM_ENEMY": {
        const pool = state.players[enemy].board;
        if (pool.length === 0) dealDamageToHero(state, enemy, op.amount ?? 0, events);
        else dealDamageToUnit(state, pool[randInt(state, pool.length)], op.amount ?? 0, events);
        break;
      }
      case "DAMAGE_HERO":
        dealDamageToHero(state, enemy, op.amount ?? 0, events);
        break;
      case "HEAL_HERO":
        healHero(state, owner, op.amount ?? 0, events);
        break;
      case "HEAL_TARGET": {
        if (targetUid === undefined) break;
        const f = findUnit(state, targetUid);
        if (f) {
          const healed = Math.min(op.amount ?? 0, f.unit.maxHealth - f.unit.health);
          if (healed > 0) {
            f.unit.health += healed;
            events.push({ type: "HEAL", targetUid: f.unit.uid, amount: healed });
          }
        }
        break;
      }
      case "BUFF": {
        if (targetUid === undefined) break;
        const f = findUnit(state, targetUid);
        if (f) {
          f.unit.attack += op.attack ?? 0;
          f.unit.health += op.health ?? 0;
          f.unit.maxHealth += op.health ?? 0;
          events.push({ type: "BUFF", targetUid: f.unit.uid, attack: op.attack ?? 0, health: op.health ?? 0 });
        }
        break;
      }
      case "BUFF_ALL_ALLIES":
        for (const u of state.players[owner].board) {
          if (u.uid === sourceUid) continue;
          u.attack += op.attack ?? 0;
          u.health += op.health ?? 0;
          u.maxHealth += op.health ?? 0;
          events.push({ type: "BUFF", targetUid: u.uid, attack: op.attack ?? 0, health: op.health ?? 0 });
        }
        break;
      case "GRANT_KEYWORD_ALLIES":
        for (const u of state.players[owner].board) {
          if (u.uid === sourceUid || !op.keyword) continue;
          if (!u.keywords.includes(op.keyword)) u.keywords.push(op.keyword);
        }
        break;
      case "SUMMON":
        for (let i = 0; i < (op.count ?? 1); i++) {
          if (op.token) summonUnit(state, owner, op.token, events);
        }
        break;
      case "DRAW":
        for (let i = 0; i < (op.amount ?? 1); i++) drawCard(state, owner, events);
        break;
      case "RETURN_ALL_OTHERS":
        for (const p of [0, 1] as const) {
          const pl = state.players[p];
          const returning = pl.board.filter((u) => u.uid !== sourceUid);
          pl.board = pl.board.filter((u) => u.uid === sourceUid);
          for (const u of returning) {
            events.push({ type: "RETURNED", uid: u.uid, player: p, cardId: u.cardId });
            const card = getCard(u.cardId);
            if (!card.token && pl.hand.length < HAND_CAP) pl.hand.push(u.cardId);
          }
        }
        break;
    }
  }
  processDeaths(state, events);
}

// ---------- target validation ------------------------------------------------

export function targetIsValid(
  state: GameState, owner: 0 | 1, eff: TriggeredEffect | undefined, targetUid: number | undefined,
): boolean {
  const req = eff?.target ?? "NONE";
  if (req === "NONE") return targetUid === undefined || true; // extra target ignored
  if (targetUid === undefined) return false;
  const f = findUnit(state, targetUid);
  if (!f) return false;
  if (req === "ENEMY_UNIT") return f.owner !== owner;
  if (req === "FRIENDLY_UNIT") return f.owner === owner;
  return true; // ANY_UNIT
}

export function guardsOf(state: GameState, p: 0 | 1): UnitInstance[] {
  return state.players[p].board.filter((u) => u.keywords.includes("guard"));
}

// ---------- actions ----------------------------------------------------------

function clone(state: GameState): GameState {
  return structuredClone(state);
}

export function applyAction(prev: GameState, action: GameAction): ActionResult {
  if (prev.winner !== null) return { state: prev, events: [], error: "Game over" };
  const state = clone(state0(prev));
  const events: GameEvent[] = [];
  const p = state.active;
  const pl = state.players[p];
  const enemy = (1 - p) as 0 | 1;

  switch (action.type) {
    case "PLAY_CARD": {
      const cardId = pl.hand[action.handIndex];
      if (cardId === undefined) return err(prev, "No such card in hand");
      const card = getCard(cardId);
      if (card.cost > pl.mana) return err(prev, "Not enough aether");
      if (card.type === "unit" && pl.board.length >= BOARD_CAP) return err(prev, "Board is full");
      const eff = card.type === "unit" ? card.arrival : card.spell;
      if ((eff?.target ?? "NONE") !== "NONE") {
        // a required target must exist & be valid; allow targetless cast if no legal target exists
        const anyLegal = legalEffectTargets(state, p, eff).length > 0;
        if (anyLegal && !targetIsValid(state, p, eff, action.targetUid)) {
          return err(prev, "Invalid target");
        }
      }
      pl.mana -= card.cost;
      pl.hand.splice(action.handIndex, 1);
      events.push({ type: "CARD_PLAYED", player: p, cardId });
      if (card.type === "unit") {
        const unit = summonUnit(state, p, cardId, events);
        if (unit && card.arrival) {
          runOps(state, p, card.arrival.ops, action.targetUid, unit.uid, events);
        } else {
          processDeaths(state, events);
        }
      } else {
        events.push({ type: "SPELL_CAST", player: p, cardId });
        runOps(state, p, card.spell?.ops ?? [], action.targetUid, undefined, events);
      }
      break;
    }

    case "ATTACK": {
      const att = pl.board.find((u) => u.uid === action.attackerUid);
      if (!att) return err(prev, "No such attacker");
      if (att.attacksLeft <= 0) return err(prev, "Already attacked");
      if (att.enteredTurn === state.turn && !att.keywords.includes("rush"))
        return err(prev, "Unit is exhausted this turn");
      if (att.attack <= 0) return err(prev, "No attack value");
      const guards = guardsOf(state, enemy);
      if (action.targetUid === undefined) {
        if (guards.length > 0) return err(prev, "Must attack a Guard first");
        att.attacksLeft -= 1;
        events.push({ type: "ATTACK", attackerUid: att.uid, player: p });
        dealDamageToHero(state, enemy, att.attack, events);
        if (att.keywords.includes("lifesteal")) healHero(state, p, att.attack, events);
        checkWinner(state, events);
      } else {
        const f = findUnit(state, action.targetUid);
        if (!f || f.owner !== enemy) return err(prev, "Invalid attack target");
        if (guards.length > 0 && !f.unit.keywords.includes("guard"))
          return err(prev, "Must attack a Guard first");
        att.attacksLeft -= 1;
        events.push({ type: "ATTACK", attackerUid: att.uid, targetUid: f.unit.uid, player: p });
        const def = f.unit;
        const overkill = att.attack - def.health;
        dealDamageToUnit(state, def, att.attack, events);
        dealDamageToUnit(state, att, def.attack, events);
        if (att.keywords.includes("lifesteal")) healHero(state, p, att.attack, events);
        if (def.keywords.includes("lifesteal")) healHero(state, enemy, def.attack, events);
        if (att.keywords.includes("piercing") && overkill > 0)
          dealDamageToHero(state, enemy, overkill, events);
        processDeaths(state, events);
      }
      break;
    }

    case "END_TURN": {
      // Ignite triggers at end of the active player's turn
      for (const u of [...pl.board]) {
        if (u.igniteX && u.health > 0) {
          events.push({ type: "IGNITE", uid: u.uid });
          const pool = state.players[enemy].board.filter((x) => x.health > 0);
          const pick = randInt(state, pool.length + 1);
          if (pick === pool.length) dealDamageToHero(state, enemy, u.igniteX, events);
          else dealDamageToUnit(state, pool[pick], u.igniteX, events);
        }
      }
      processDeaths(state, events);
      if (state.winner === null) startTurn(state, enemy, events);
      break;
    }
  }

  checkWinner(state, events);
  return { state, events };

  function err(prevState: GameState, message: string): ActionResult {
    return { state: prevState, events: [], error: message };
  }
}

function state0(s: GameState): GameState {
  return s;
}

/** Legal uids for an effect's target requirement (for UI highlighting & AI). */
export function legalEffectTargets(
  state: GameState, owner: 0 | 1, eff: TriggeredEffect | undefined,
): number[] {
  const req = eff?.target ?? "NONE";
  if (req === "NONE") return [];
  const enemy = (1 - owner) as 0 | 1;
  const pool =
    req === "ENEMY_UNIT" ? state.players[enemy].board :
    req === "FRIENDLY_UNIT" ? state.players[owner].board :
    [...state.players[owner].board, ...state.players[enemy].board];
  return pool.map((u) => u.uid);
}

/** Legal attack targets for a unit (guards enforced). undefined in list = hero allowed. */
export function legalAttackTargets(state: GameState, attackerUid: number): (number | undefined)[] {
  const p = state.active;
  const enemy = (1 - p) as 0 | 1;
  const att = state.players[p].board.find((u) => u.uid === attackerUid);
  if (!att || att.attacksLeft <= 0 || att.attack <= 0) return [];
  if (att.enteredTurn === state.turn && !att.keywords.includes("rush")) return [];
  const guards = guardsOf(state, enemy);
  if (guards.length > 0) return guards.map((g) => g.uid);
  return [...state.players[enemy].board.map((u) => u.uid), undefined];
}
