/** Simple but competent greedy AI: curve out, trade favorably, push face, use effects. */

import { applyAction, getCard, legalAttackTargets, legalEffectTargets } from "./engine";
import type { GameAction, GameState } from "./types";

/** Compute the AI's next single action, or null if it should end its turn. */
export function aiNextAction(state: GameState): GameAction | null {
  const p = state.active;
  const pl = state.players[p];
  const enemy = state.players[1 - p];

  // 1. play the most expensive affordable card (units first), with a sensible target
  const playable = pl.hand
    .map((id, i) => ({ card: getCard(id), i }))
    .filter(({ card }) => card.cost <= pl.mana)
    .filter(({ card }) => card.type === "spell" || pl.board.length < 7)
    .sort((a, b) => b.card.cost - a.card.cost || (a.card.type === "unit" ? -1 : 1));

  for (const { card, i } of playable) {
    const eff = card.type === "unit" ? card.arrival : card.spell;
    const req = eff?.target ?? "NONE";
    if (req === "NONE") return { type: "PLAY_CARD", handIndex: i };
    const targets = legalEffectTargets(state, p, eff);
    if (targets.length === 0) {
      if (card.type === "unit") return { type: "PLAY_CARD", handIndex: i };
      continue; // don't waste targeted spells with no target
    }
    // damage → biggest enemy unit; buffs/heals → biggest friendly unit
    const wantsEnemy = eff!.ops.some((o) => o.op === "DAMAGE");
    const pool = targets
      .map((uid) => {
        const u = [...state.players[0].board, ...state.players[1].board].find((x) => x.uid === uid)!;
        const isEnemy = enemy.board.some((x) => x.uid === uid);
        return { uid, u, isEnemy };
      })
      .filter((t) => (wantsEnemy ? t.isEnemy : !t.isEnemy));
    const ranked = (pool.length ? pool : targets.map((uid) => ({ uid, u: undefined as never, isEnemy: false })))
      .sort((a, b) => ((b.u?.attack ?? 0) + (b.u?.health ?? 0)) - ((a.u?.attack ?? 0) + (a.u?.health ?? 0)));
    return { type: "PLAY_CARD", handIndex: i, targetUid: ranked[0].uid };
  }

  // 2. attacks: favorable trades first, otherwise face
  for (const u of pl.board) {
    const targets = legalAttackTargets(state, u.uid);
    if (targets.length === 0) continue;
    const unitTargets = targets.filter((t): t is number => t !== undefined);
    // favorable trade: we kill it and (survive or it's bigger than us)
    let best: number | undefined;
    let bestScore = -1;
    for (const uid of unitTargets) {
      const t = enemy.board.find((x) => x.uid === uid)!;
      const kills = u.attack >= t.health;
      const survives = t.attack < u.health;
      const score = (kills ? 2 : 0) + (survives ? 1 : 0) + (t.keywords.includes("guard") ? 1 : 0) + t.attack / 10;
      if (kills && score > bestScore) { best = uid; bestScore = score; }
    }
    if (best !== undefined) return { type: "ATTACK", attackerUid: u.uid, targetUid: best };
    if (targets.includes(undefined)) return { type: "ATTACK", attackerUid: u.uid };
    // guards up and no favorable trade — attack the smallest guard
    const smallest = unitTargets
      .map((uid) => enemy.board.find((x) => x.uid === uid)!)
      .sort((a, b) => a.health - b.health)[0];
    if (smallest) return { type: "ATTACK", attackerUid: u.uid, targetUid: smallest.uid };
  }

  return null; // end turn
}

/** Run the AI's whole turn, returning all resulting states+events per step. */
export function aiTakeTurn(state: GameState, maxSteps = 30) {
  const steps: { action: GameAction; result: ReturnType<typeof applyAction> }[] = [];
  let cur = state;
  for (let i = 0; i < maxSteps; i++) {
    if (cur.winner !== null) break;
    const action = aiNextAction(cur) ?? ({ type: "END_TURN" } as GameAction);
    const result = applyAction(cur, action);
    if (result.error) break; // safety: never loop on an illegal action
    steps.push({ action, result });
    cur = result.state;
    if (action.type === "END_TURN") break;
  }
  return steps;
}
