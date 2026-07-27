"use client";

/** Guided first match: watches game state and advances contextual steps. */

import { useEffect, useState } from "react";
import { loadProfile, saveProfile } from "@/lib/profile";
import type { GameState } from "@/lib/game/types";

interface Step { title: string; body: string; anchor: "center" | "hand" | "board" | "endturn" | "mana" | "enemy"; }

const STEPS: Step[] = [
  { title: "Welcome to Kelvarrow", body: "The Shattering scattered the Aethershards — and every faction wants them. Win by bringing the enemy hero from 30 HP to zero.", anchor: "center" },
  { title: "Aether", body: "Your aether crystals refill every turn and grow by one each round (up to 10). Cards cost aether to play.", anchor: "mana" },
  { title: "Play a card", body: "Click a glowing card in your hand to play it. Units land on the battlefield; spells take effect immediately.", anchor: "hand" },
  { title: "Attack", body: "Units rest the turn they arrive (unless they have Rush). On your next turn, click a ready unit, then click an enemy — or their hero.", anchor: "board" },
  { title: "Watch for Guard", body: "Enemies with a shield have Guard — you must defeat them before anything else can be attacked.", anchor: "enemy" },
  { title: "End your turn", body: "Done? Press End Turn and the Choir answers. Reduce the enemy hero to 0 to win. Good luck, duelist.", anchor: "endturn" },
];

export default function TutorialOverlay({
  game, step, setStep, myTurn,
}: { game: GameState; step: number; setStep: (n: number) => void; myTurn: boolean }) {
  const [dismissed, setDismissed] = useState(false);

  // auto-advance contextual steps
  useEffect(() => {
    if (step === 2 && game.players[0].board.length > 0) setStep(3);
    if (step === 3 && game.turn >= 3 && game.players[0].board.some((u) => u.attacksLeft > 0)) { /* stay until attack */ }
  }, [game, step, setStep]);

  useEffect(() => {
    if (step >= STEPS.length && !dismissed) {
      const p = loadProfile();
      if (!p.tutorialDone) { p.tutorialDone = true; saveProfile(p); }
      setDismissed(true);
    }
  }, [step, dismissed]);

  if (dismissed || step >= STEPS.length) return null;
  const s = STEPS[step];
  const interactive = step === 2 || step === 3; // let the player act during these
  return (
    <div className={`tutWrap anchor-${s.anchor}${interactive ? " passthrough" : ""}`} data-testid="tutorial">
      <div className="tutPanel">
        <div className="tutStepNo">{step + 1} / {STEPS.length}</div>
        <h2>{s.title}</h2>
        <p>{s.body}</p>
        <div className="tutBtns">
          {!(step === 2 && game.players[0].board.length === 0 && myTurn) && (
            <button className="btn primary" onClick={() => setStep(step + 1)}>
              {step === STEPS.length - 1 ? "Fight!" : "Next"}
            </button>
          )}
          <button className="btn subtle" onClick={() => setStep(STEPS.length)}>Skip tutorial</button>
        </div>
      </div>
    </div>
  );
}
