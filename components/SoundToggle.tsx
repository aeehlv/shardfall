"use client";

import { useEffect, useState } from "react";
import { AUDIO_ENABLED, isMuted, setMuted, startMusic } from "@/lib/sound";
import "./sound-toggle.css";

/** Fixed bottom-left mute toggle. Unmuting also (re)starts the theme music. */
export default function SoundToggle() {
  const [muted, setMutedUi] = useState(false);

  // Read persisted state after mount so SSR markup stays deterministic.
  useEffect(() => {
    setMutedUi(isMuted());
  }, []);

  const toggle = () => {
    const next = !muted;
    setMuted(next);
    setMutedUi(next);
    if (!next) startMusic(); // inside the click gesture, so autoplay is allowed
  };

  if (!AUDIO_ENABLED) return null;

  return (
    <button
      type="button"
      className={muted ? "soundToggle isMuted" : "soundToggle"}
      onClick={toggle}
      aria-label={muted ? "Unmute sound" : "Mute sound"}
      aria-pressed={muted}
      title={muted ? "Sound: off" : "Sound: on"}
      data-testid="sound-toggle"
    >
      <span className="soundGlyph" aria-hidden="true">
        {muted ? "\u{1F507}" : "\u{1F50A}"}
      </span>
    </button>
  );
}
