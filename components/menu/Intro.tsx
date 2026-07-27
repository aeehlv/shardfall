"use client";

/** ~10s cinematic intro: shard glow → title → faction triptych → enter. Skippable. */

import { useEffect, useState } from "react";
import "./intro.css";

export default function Intro({ onDone }: { onDone: () => void }) {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setStage(1), 300),    // shard glow
      setTimeout(() => setStage(2), 3000),   // title
      setTimeout(() => setStage(3), 5600),   // triptych
      setTimeout(() => setStage(4), 9200),   // enter prompt
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  /* eslint-disable @next/next/no-img-element */
  return (
    <div className={`introWrap stage-${stage}`} data-testid="intro" onClick={() => stage >= 4 && onDone()}>
      <div className="introShard">
        <img src="/ui/emblem.png" alt="" />
        <div className="introGlow" />
      </div>

      <div className="introTitle">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="introWordmark" src="/ui/wordmark.png" alt="Shardfall" />
        <p>The world broke into song. Everyone wants the pieces.</p>
      </div>

      <div className="introTriptych">
        <img src="/cards/art/pyre.jpg" alt="" className="tript pyre" />
        <img src="/cards/art/abyss.jpg" alt="" className="tript abyss" />
        <img src="/cards/art/verdant.jpg" alt="" className="tript verdant" />
      </div>

      {stage >= 4 && (
        <button className="introEnter" onClick={onDone} data-testid="intro-enter">
          Enter Kelvarrow
        </button>
      )}

      <button className="introSkip" onClick={onDone} data-testid="intro-skip">Skip ›</button>
    </div>
  );
  /* eslint-enable @next/next/no-img-element */
}
