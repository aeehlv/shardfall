"use client";

/** MASTER SWITCH — audio is parked until the new sound pack is ready.
 *  Flip to true to re-enable every SFX, the music loop, and the toggle button.
 *  Assets stay in public/audio/ and scripts/gen-audio.mjs regenerates them. */
export const AUDIO_ENABLED = false;

/**
 * Tiny audio manager for Shardfall. No deps, SSR-safe.
 *
 * Sound names are the ogg basenames in /public/audio (no extension), e.g.
 * play("attack") → /audio/attack.ogg. Music is /audio/music-theme.ogg, looped
 * at low volume with a fade-in. Mute state persists to localStorage.
 */

const BASE = "/audio/";
const MUTE_KEY = "shardfall-muted";
const MUSIC_SRC = `${BASE}music-theme.ogg`;
const MUSIC_VOLUME = 0.25;
const FADE_MS = 2000;
const FADE_STEP_MS = 50;

const sfxCache = new Map<string, HTMLAudioElement>();
let music: HTMLAudioElement | null = null;
let musicWanted = false;
let fadeTimer: ReturnType<typeof setInterval> | null = null;
let gestureListener: (() => void) | null = null;
let muted: boolean | null = null;

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function readMuted(): boolean {
  if (!isBrowser()) return false;
  if (muted === null) {
    try {
      muted = window.localStorage.getItem(MUTE_KEY) === "1";
    } catch {
      muted = false;
    }
  }
  return muted;
}

/** Whether audio is currently muted (persisted across sessions). */
export function isMuted(): boolean {
  return readMuted();
}

/** Mute/unmute everything; persisted to localStorage. */
export function setMuted(value: boolean): void {
  if (!isBrowser()) return;
  muted = value;
  try {
    window.localStorage.setItem(MUTE_KEY, value ? "1" : "0");
  } catch {
    // storage unavailable — keep in-memory state only
  }
  if (value) {
    stopFade();
    music?.pause();
  } else if (musicWanted) {
    attemptMusicPlay();
  }
}

/** Warm the cache so first plays are instant. Names without extension. */
export function preload(names: string[]): void {
  if (!AUDIO_ENABLED) return;
  if (!isBrowser()) return;
  for (const name of names) {
    if (sfxCache.has(name)) continue;
    const el = new Audio(BASE + name + ".ogg");
    el.preload = "auto";
    sfxCache.set(name, el);
  }
}

/** Fire-and-forget one-shot. Overlapping plays don't cut each other off. */
export function play(name: string, volume = 1): void {
  if (!AUDIO_ENABLED) return;
  if (!isBrowser() || readMuted()) return;
  let el = sfxCache.get(name);
  if (!el) {
    preload([name]);
    el = sfxCache.get(name);
  }
  if (!el) return;
  const inst = el.cloneNode(true) as HTMLAudioElement;
  inst.volume = Math.max(0, Math.min(1, volume));
  void inst.play().catch(() => {
    // Autoplay blocked before first user gesture — one-shots just skip.
  });
}

function ensureMusic(): HTMLAudioElement {
  if (!music) {
    music = new Audio(MUSIC_SRC);
    music.loop = true;
    music.preload = "auto";
  }
  return music;
}

function stopFade(): void {
  if (fadeTimer !== null) {
    clearInterval(fadeTimer);
    fadeTimer = null;
  }
}

function fadeTo(el: HTMLAudioElement, target: number): void {
  stopFade();
  const step = (target * FADE_STEP_MS) / FADE_MS;
  fadeTimer = setInterval(() => {
    const next = Math.min(target, el.volume + step);
    el.volume = next;
    if (next >= target) stopFade();
  }, FADE_STEP_MS);
}

function disarmGesture(): void {
  if (gestureListener) {
    window.removeEventListener("pointerdown", gestureListener);
    gestureListener = null;
  }
}

/** Retry music on the next user gesture (browser autoplay policy). */
function armGesture(): void {
  if (gestureListener) return;
  gestureListener = () => {
    gestureListener = null;
    if (musicWanted && !readMuted()) attemptMusicPlay();
  };
  window.addEventListener("pointerdown", gestureListener, { once: true });
}

function attemptMusicPlay(): void {
  const el = ensureMusic();
  el.volume = 0;
  el.play()
    .then(() => fadeTo(el, MUSIC_VOLUME))
    .catch(() => armGesture());
}

/**
 * Start the looping theme with a fade-in. Safe to call before any user
 * gesture: if autoplay is blocked it retries on the first pointerdown.
 */
export function startMusic(): void {
  if (!AUDIO_ENABLED) return;
  if (!isBrowser()) return;
  musicWanted = true;
  if (readMuted()) return;
  attemptMusicPlay();
}

/** Stop the theme and cancel any pending gesture retry. */
export function stopMusic(): void {
  if (!AUDIO_ENABLED) return;
  if (!isBrowser()) return;
  musicWanted = false;
  disarmGesture();
  stopFade();
  if (music) {
    music.pause();
    music.currentTime = 0;
  }
}
