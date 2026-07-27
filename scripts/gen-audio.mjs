#!/usr/bin/env node
/**
 * Shardfall audio generator — pure Node PCM synthesis, zero deps.
 *
 * Synthesizes every game sound at 44100 Hz / 16-bit / stereo, writes WAVs to a
 * temp dir, then encodes each to OGG Vorbis (ffmpeg -qscale:a 4) into
 * public/audio/. Deterministic: a seeded PRNG per sound, so re-runs are
 * byte-stable at the PCM level.
 *
 * Usage: node scripts/gen-audio.mjs
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SR = 44100;
const TAU = Math.PI * 2;
const FFMPEG = "/opt/homebrew/bin/ffmpeg";
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "public", "audio");

/* ---------------------------------------------------------------- PRNG --- */

let _seed = 1;
function srand(seed) {
  _seed = seed >>> 0;
}
/** mulberry32 — deterministic, seeded per sound. */
function rnd() {
  _seed = (_seed + 0x6d2b79f5) >>> 0;
  let t = _seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function hashName(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/* ------------------------------------------------------------- buffers --- */

/** Stereo float buffer of `dur` seconds. */
function stereo(dur) {
  const n = Math.ceil(dur * SR);
  return { l: new Float32Array(n), r: new Float32Array(n), n };
}

/** Add `src` into `dst` starting at `at` seconds. */
function mix(dst, src, at = 0, gain = 1) {
  const start = Math.floor(at * SR);
  const count = Math.max(0, Math.min(src.n, dst.n - start));
  for (let i = 0; i < count; i++) {
    dst.l[start + i] += src.l[i] * gain;
    dst.r[start + i] += src.r[i] * gain;
  }
}

/** tanh soft clip in place. */
function softClip(buf, drive = 1) {
  for (const ch of [buf.l, buf.r])
    for (let i = 0; i < ch.length; i++) ch[i] = Math.tanh(ch[i] * drive);
}

/** Scale so the absolute peak hits `peak`. */
function normalize(buf, peak = 0.85) {
  let max = 0;
  for (const ch of [buf.l, buf.r])
    for (let i = 0; i < ch.length; i++) max = Math.max(max, Math.abs(ch[i]));
  if (max === 0) return;
  const g = peak / max;
  for (const ch of [buf.l, buf.r])
    for (let i = 0; i < ch.length; i++) ch[i] *= g;
}

/** Tiny linear fades at the edges so one-shots never click. */
function edgeFade(buf, inMs = 3, outMs = 14) {
  const nIn = Math.min(buf.n, Math.floor((inMs / 1000) * SR));
  const nOut = Math.min(buf.n, Math.floor((outMs / 1000) * SR));
  for (let i = 0; i < nIn; i++) {
    const w = i / nIn;
    buf.l[i] *= w;
    buf.r[i] *= w;
  }
  for (let i = 0; i < nOut; i++) {
    const w = i / nOut;
    buf.l[buf.n - 1 - i] *= w;
    buf.r[buf.n - 1 - i] *= w;
  }
}

/** One-pole lowpass an entire stereo buffer in place. `cutoff` is Hz or (t)=>Hz. */
function lowpass(buf, cutoff) {
  const fn = typeof cutoff === "function" ? cutoff : null;
  let ll = 0;
  let rr = 0;
  for (let i = 0; i < buf.n; i++) {
    const fc = fn ? fn(i / SR) : cutoff;
    const k = 1 - Math.exp((-TAU * fc) / SR);
    ll += k * (buf.l[i] - ll);
    buf.l[i] = ll;
    rr += k * (buf.r[i] - rr);
    buf.r[i] = rr;
  }
}

/* ------------------------------------------------------------ synthesis --- */

const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

function oscSample(type, p) {
  p -= Math.floor(p);
  switch (type) {
    case "sine":
      return Math.sin(TAU * p);
    case "saw":
      return 2 * p - 1;
    case "triangle":
      return 4 * Math.abs(p - 0.5) - 1;
    case "square":
      return p < 0.5 ? 1 : -1;
    default:
      throw new Error(`unknown osc type: ${type}`);
  }
}

/** Classic ADSR, release ending exactly at `dur`. */
function adsr(t, dur, a = 0.01, d = 0.05, s = 0.7, r = 0.08) {
  if (t < 0 || t >= dur) return 0;
  if (t < a) return t / a;
  if (t < a + d) return 1 - (1 - s) * ((t - a) / d);
  const relStart = dur - r;
  if (t < relStart) return s;
  return s * Math.max(0, 1 - (t - relStart) / r);
}

/**
 * Render an oscillator into `out` at `at` seconds.
 * opts: type, freq | freqFn(t)=>Hz, dur, gain, pan (-1..1), detune (cents,
 * total spread across `voices`), voices, env(t, dur)=>0..1, phase0.
 */
function tone(out, at, opts) {
  const {
    type = "sine",
    freq = 440,
    freqFn = null,
    dur = 0.3,
    gain = 0.3,
    detune = 0,
    voices = 1,
    env = (t, d) => adsr(t, d),
    phase0 = null,
  } = opts;
  const pan = Math.max(-1, Math.min(1, opts.pan ?? 0));
  const start = Math.floor(at * SR);
  const count = Math.max(0, Math.min(Math.floor(dur * SR), out.n - start));
  const gl = gain * Math.min(1, 1 - pan);
  const gr = gain * Math.min(1, 1 + pan);
  const vGain = 1 / Math.sqrt(voices);
  for (let v = 0; v < voices; v++) {
    const cents = voices > 1 ? detune * (v / (voices - 1) - 0.5) : 0;
    const ratio = Math.pow(2, cents / 1200);
    let phase = phase0 != null ? phase0 : rnd();
    for (let i = 0; i < count; i++) {
      const t = i / SR;
      phase += ((freqFn ? freqFn(t) : freq) * ratio) / SR;
      const s = oscSample(type, phase) * env(t, dur) * vGain;
      out.l[start + i] += s * gl;
      out.r[start + i] += s * gr;
    }
  }
}

/**
 * White noise through a one-pole lowpass (and optional one-pole highpass).
 * opts: dur, gain, pan, env(t, dur), cutoff | cutoffFn(t)=>Hz, hp (Hz),
 * mono (true = same noise both channels).
 */
function noise(out, at, opts) {
  const {
    dur = 0.3,
    gain = 0.3,
    env = (t, d) => adsr(t, d),
    cutoff = 4000,
    cutoffFn = null,
    hp = 0,
    mono = false,
  } = opts;
  const pan = Math.max(-1, Math.min(1, opts.pan ?? 0));
  const start = Math.floor(at * SR);
  const count = Math.max(0, Math.min(Math.floor(dur * SR), out.n - start));
  const gl = gain * Math.min(1, 1 - pan);
  const gr = gain * Math.min(1, 1 + pan);
  const hpK = hp > 0 ? 1 - Math.exp((-TAU * hp) / SR) : 0;
  let lpL = 0, lpR = 0, hpL = 0, hpR = 0;
  for (let i = 0; i < count; i++) {
    const t = i / SR;
    const fc = cutoffFn ? cutoffFn(t) : cutoff;
    const k = 1 - Math.exp((-TAU * fc) / SR);
    const wl = rnd() * 2 - 1;
    const wr = mono ? wl : rnd() * 2 - 1;
    lpL += k * (wl - lpL);
    lpR += k * (wr - lpR);
    let sl = lpL;
    let sr = lpR;
    if (hp > 0) {
      hpL += hpK * (sl - hpL);
      sl -= hpL;
      hpR += hpK * (sr - hpR);
      sr -= hpR;
    }
    const e = env(t, dur);
    out.l[start + i] += sl * e * gl;
    out.r[start + i] += sr * e * gr;
  }
}

/** Bell: slightly inharmonic sine partials with faster decay up high. */
function bell(out, at, { freq, dur = 1.2, gain = 0.25, pan = 0, bright = 1, decay = 4 }) {
  const partials = [
    [1, 1],
    [2.0, 0.55 * bright],
    [2.92, 0.3 * bright],
    [4.2, 0.16 * bright],
    [5.4, 0.08 * bright],
  ];
  for (const [ratio, amp] of partials) {
    const f = freq * ratio;
    if (f > 15000 || amp <= 0.01) continue;
    const k = decay + ratio * 2.5;
    tone(out, at, {
      type: "sine",
      freq: f,
      dur,
      gain: gain * amp,
      pan,
      phase0: rnd(),
      env: (t, d) => Math.exp(-k * t) * (1 - t / d) * Math.min(1, t / 0.004),
    });
  }
}

/** Soft pluck: triangle with exponential decay plus a whisper of octave. */
function pluck(out, at, { freq, dur = 0.9, gain = 0.12, pan = 0 }) {
  tone(out, at, {
    type: "triangle",
    freq,
    dur,
    gain,
    pan,
    env: (t, d) => Math.exp(-6 * t) * (1 - t / d) * Math.min(1, t / 0.003),
  });
  tone(out, at, {
    type: "sine",
    freq: freq * 2,
    dur: dur * 0.5,
    gain: gain * 0.28,
    pan,
    env: (t, d) => Math.exp(-11 * t) * (1 - t / d) * Math.min(1, t / 0.003),
  });
}

/** Drum: pitch-dropping sine body plus a short noise thump. */
function drum(out, at, { f0 = 130, f1 = 45, dur = 0.5, gain = 0.9, pan = 0 }) {
  tone(out, at, {
    type: "sine",
    dur,
    gain,
    pan,
    phase0: 0,
    freqFn: (t) => f1 + (f0 - f1) * Math.exp(-t * 18),
    env: (t, d) => Math.exp(-6 * t) * (1 - t / d) * Math.min(1, t / 0.002),
  });
  noise(out, at, { dur: 0.1, gain: gain * 0.35, cutoff: 900, pan, env: (t) => Math.exp(-45 * t) });
}

/* --------------------------------------------------------------- sounds --- */

/** Soft UI tick, ~80ms. */
function sfxClick() {
  const out = stereo(0.09);
  tone(out, 0, {
    type: "sine",
    freq: 1900,
    dur: 0.05,
    gain: 0.4,
    env: (t) => Math.exp(-90 * t) * Math.min(1, t / 0.001),
  });
  tone(out, 0, { type: "triangle", freq: 610, dur: 0.07, gain: 0.32, env: (t) => Math.exp(-55 * t) });
  noise(out, 0, { dur: 0.045, gain: 0.2, cutoff: 5200, hp: 800, env: (t) => Math.exp(-110 * t) });
  return out;
}

/** Airy card whoosh, ~300ms, moving left → right. */
function sfxCardPlay() {
  const out = stereo(0.34);
  // paper slide: bandpassed noise sweeping down, quick
  noise(out, 0, {
    dur: 0.16, gain: 0.32, hp: 1400,
    cutoffFn: (t) => 8000 - 4800 * (t / 0.16),
    env: (t, d) => Math.sin((Math.PI * t) / d) ** 1.4,
  });
  // felt landing thud
  drum(out, 0.12, { f0: 165, f1: 82, dur: 0.16, gain: 0.34 });
  noise(out, 0.12, { dur: 0.05, gain: 0.14, cutoff: 1500, env: (t) => Math.exp(-70 * t) });
  // faint arcane shimmer tail
  bell(out, 0.14, { freq: 1760, dur: 0.2, gain: 0.05, bright: 0.6, pan: 0.15 });
  bell(out, 0.17, { freq: 2637, dur: 0.16, gain: 0.035, bright: 0.7, pan: -0.15 });
  return out;
}
function sfxAttack() {
  const out = stereo(0.52);
  // steel-on-steel: inharmonic metallic partials
  const parts = [1860, 2410, 3170, 4230, 5310];
  parts.forEach((f, i) => {
    tone(out, 0, {
      type: "sine", freq: f, dur: 0.42 - i * 0.05, gain: 0.11 / (1 + i * 0.5),
      pan: (i % 2 ? 0.2 : -0.2),
      env: (t, d) => Math.exp(-11 * (t / d)) * (1 - t / d),
    });
  });
  // bright strike transient
  noise(out, 0, {
    dur: 0.07, gain: 0.42, hp: 2600,
    cutoffFn: (t) => 12000 - 6000 * (t / 0.07),
    env: (t) => Math.exp(-55 * t),
  });
  // body impact underneath
  drum(out, 0.005, { f0: 190, f1: 62, dur: 0.3, gain: 0.5 });
  // ringing decay
  tone(out, 0.02, {
    type: "triangle", freq: 930, dur: 0.4, gain: 0.06, voices: 2, detune: 12,
    env: (t, d) => Math.exp(-8 * (t / d)),
  });
  return out;
}
function sfxShatter() {
  const out = stereo(0.62);
  noise(out, 0, { dur: 0.12, gain: 0.5, cutoff: 9000, hp: 1500, env: (t) => Math.exp(-28 * t) });
  noise(out, 0.02, {
    dur: 0.56,
    gain: 0.3,
    hp: 1100,
    cutoffFn: (t) => 8000 * Math.exp(-3.2 * t) + 700,
    env: (t, d) => Math.exp(-5 * t) * (1 - t / d),
  });
  for (let i = 0; i < 15; i++) {
    const at = 0.01 + rnd() * 0.32;
    const f = (2600 + rnd() * 4300) * (1 - at * 0.85);
    const k = 16 + rnd() * 22;
    tone(out, at, {
      type: "sine",
      freq: f,
      dur: 0.26,
      gain: 0.09 + rnd() * 0.08,
      pan: (rnd() - 0.5) * 1.6,
      env: (t, d) => Math.exp(-k * t) * (1 - t / d) * Math.min(1, t / 0.002),
    });
  }
  return out;
}

/** Warm A-major-pentatonic chime arpeggio, ~700ms. */
function sfxHeal() {
  const out = stereo(0.72);
  const notes = [69, 73, 76, 78, 81]; // A4 C#5 E5 F#5 A5
  notes.forEach((m, i) => {
    bell(out, i * 0.105, {
      freq: hz(m),
      dur: 0.62,
      gain: 0.17,
      pan: (i / (notes.length - 1) - 0.5) * 0.8,
      bright: 0.8,
    });
  });
  for (const m of [57, 64]) {
    tone(out, 0, {
      type: "triangle",
      freq: hz(m),
      dur: 0.7,
      gain: 0.085,
      voices: 2,
      detune: 9,
      env: (t, d) => Math.pow(Math.sin((Math.PI * t) / d), 1.2),
    });
  }
  return out;
}

/** Rising shimmer, ~500ms. */
function sfxBuff() {
  const out = stereo(0.52);
  tone(out, 0, {
    type: "sine",
    dur: 0.46,
    gain: 0.24,
    voices: 3,
    detune: 14,
    freqFn: (t) => 420 * Math.pow(2, t * 2.4),
    env: (t, d) => Math.sin((Math.PI * t) / d),
  });
  noise(out, 0.04, {
    dur: 0.46,
    gain: 0.2,
    hp: 900,
    cutoffFn: (t) => 1200 + 7200 * (t / 0.46),
    env: (t, d) => Math.pow(Math.sin((Math.PI * t) / d), 1.2),
  });
  bell(out, 0.3, { freq: 1975, dur: 0.22, gain: 0.09, pan: -0.3, bright: 0.7 });
  bell(out, 0.38, { freq: 2637, dur: 0.14, gain: 0.08, pan: 0.35, bright: 0.7 });
  return out;
}

/** Dark whoosh with wobble, ~500ms. */
function sfxSpell() {
  const out = stereo(0.52);
  noise(out, 0, {
    dur: 0.5,
    gain: 0.55,
    cutoffFn: (t) => 500 + 900 * Math.sin((Math.PI * t) / 0.5) + 320 * Math.sin(TAU * 9 * t),
    env: (t, d) => Math.pow(Math.sin((Math.PI * t) / d), 1.3) * (1 + 0.35 * Math.sin(TAU * 11 * t)),
  });
  const growl = stereo(0.52);
  tone(growl, 0, {
    type: "saw",
    dur: 0.5,
    gain: 0.45,
    voices: 3,
    detune: 16,
    freqFn: (t) => 110 * Math.pow(2, -t * 0.8) * (1 + 0.02 * Math.sin(TAU * 6.5 * t)),
    env: (t, d) => Math.sin((Math.PI * t) / d),
  });
  lowpass(growl, (t) => 420 + 260 * Math.sin(TAU * 8 * t));
  mix(out, growl);
  return out;
}

/** Single soft bell for turn change, ~600ms. */
function sfxTurn() {
  const out = stereo(0.62);
  bell(out, 0, { freq: hz(76), dur: 0.6, gain: 0.32, bright: 0.55, decay: 3.2 });
  noise(out, 0, { dur: 0.2, gain: 0.05, cutoff: 3000, hp: 600, env: (t) => Math.exp(-20 * t) });
  return out;
}

/** Riser into a deep drum hit, ~1.2s. */
function sfxMatchStart() {
  const out = stereo(1.2);
  noise(out, 0, {
    dur: 0.7,
    gain: 0.3,
    hp: 300,
    cutoffFn: (t) => 400 + 6200 * Math.pow(t / 0.7, 2),
    env: (t, d) => Math.pow(t / d, 1.4),
  });
  const riser = stereo(0.72);
  tone(riser, 0, {
    type: "saw",
    dur: 0.7,
    gain: 0.4,
    voices: 3,
    detune: 20,
    freqFn: (t) => 90 * Math.pow(2, (1.6 * t) / 0.7),
    env: (t, d) => Math.pow(t / d, 1.2),
  });
  lowpass(riser, (t) => 300 + 2600 * Math.pow(t / 0.7, 2));
  mix(out, riser);
  drum(out, 0.7, { f0: 145, f1: 38, dur: 0.5, gain: 1.0 });
  noise(out, 0.7, { dur: 0.3, gain: 0.3, cutoff: 1400, env: (t) => Math.exp(-12 * t) });
  tone(out, 0.7, {
    type: "sine",
    freq: 55,
    dur: 0.5,
    gain: 0.28,
    env: (t, d) => Math.exp(-5 * t) * (1 - t / d),
  });
  return out;
}

/** Triumphant fanfare — four ascending chords, saw-brass + bell topline, ~3s. */
function sfxVictory() {
  const out = stereo(3.0);
  const chords = [
    { at: 0.0, dur: 0.55, notes: [48, 55, 60, 64] }, // C
    { at: 0.5, dur: 0.55, notes: [53, 60, 65, 69] }, // F
    { at: 1.0, dur: 0.55, notes: [55, 62, 67, 71] }, // G
    { at: 1.5, dur: 1.45, notes: [48, 60, 64, 67, 72] }, // C (spread)
  ];
  const brass = stereo(3.0);
  for (const c of chords) {
    for (const m of c.notes) {
      tone(brass, c.at, {
        type: "saw",
        freq: hz(m),
        dur: c.dur,
        gain: 0.13,
        voices: 3,
        detune: 15,
        pan: (rnd() - 0.5) * 0.5,
        env: (t, d) => adsr(t, d, 0.02, 0.1, 0.8, Math.min(0.3, d * 0.4)),
      });
    }
  }
  lowpass(brass, 2400);
  mix(out, brass);
  const topline = [
    [0.0, 72],
    [0.5, 77],
    [1.0, 79],
    [1.5, 84],
  ];
  for (const [at, m] of topline) {
    bell(out, at, { freq: hz(m), dur: Math.min(1.4, 3.0 - at), gain: 0.15, pan: 0.15, bright: 0.9 });
  }
  drum(out, 1.5, { f0: 110, f1: 55, dur: 0.6, gain: 0.5 });
  noise(out, 1.5, { dur: 1.4, gain: 0.06, hp: 2000, cutoff: 9000, env: (t, d) => Math.exp(-2.5 * t) * (1 - t / d) });
  return out;
}

/** Low minor descending drone, ~3s. */
function sfxDefeat() {
  const out = stereo(3.0);
  // funeral bell, two tolls
  bell(out, 0.0, { freq: hz(38), dur: 2.6, gain: 0.4, bright: 0.3, pan: -0.15 });
  bell(out, 1.1, { freq: hz(38), dur: 1.9, gain: 0.26, bright: 0.3, pan: 0.12 });
  // descending choir: Dm → Bb-ish sink
  const fall = [[57, 53, 50], [55, 50, 46], [53, 48, 45]];
  fall.forEach((chord, i) => {
    chord.forEach((m) => {
      tone(out, i * 0.75, {
        type: "saw", freq: hz(m), dur: 1.6, gain: 0.055, voices: 4, detune: 14,
        pan: (rnd() - 0.5) * 0.6,
        env: (t, d) => adsr(t, d, 0.35, 0.4, 0.7, 0.9),
      });
    });
  });
  lowpass(out, (t) => 1200 - 700 * Math.min(1, t / 3));
  // low drone sinking
  tone(out, 0, {
    type: "sine", dur: 3.0, gain: 0.22,
    freqFn: (t) => hz(26) * Math.pow(2, -0.22 * (t / 3)),
    env: (t, d) => adsr(t, d, 0.5, 0.5, 0.8, 1.4),
  });
  drum(out, 0.02, { f0: 120, f1: 40, dur: 0.9, gain: 0.5 });
  return out;
}
function sfxPurchase() {
  const out = stereo(0.62);
  const ticks = [
    [0.0, 1318.5],
    [0.09, 1661.2],
    [0.2, 1975.5],
    [0.34, 1568.0],
    [0.44, 2637.0],
  ];
  for (const [at, f] of ticks) {
    tone(out, at, {
      type: "sine",
      freq: f,
      dur: 0.22,
      gain: 0.24,
      pan: (rnd() - 0.5) * 0.7,
      env: (t, d) => Math.exp(-22 * t) * (1 - t / d) * Math.min(1, t / 0.002),
    });
    tone(out, at, {
      type: "sine",
      freq: f * 2.01,
      dur: 0.15,
      gain: 0.08,
      env: (t, d) => Math.exp(-32 * t) * (1 - t / d),
    });
  }
  return out;
}

/** Magical sweep into a pop, ~1s. */
function sfxPackOpen() {
  const out = stereo(1.0);
  noise(out, 0, {
    dur: 0.62,
    gain: 0.3,
    hp: 700,
    cutoffFn: (t) => 800 + 7600 * Math.pow(t / 0.62, 1.8),
    env: (t, d) => Math.pow(t / d, 1.3),
  });
  tone(out, 0, {
    type: "sine",
    dur: 0.62,
    gain: 0.16,
    voices: 3,
    detune: 15,
    freqFn: (t) => 300 * Math.pow(2, (2.4 * t) / 0.62),
    env: (t, d) => Math.pow(t / d, 1.2),
  });
  noise(out, 0.62, { dur: 0.08, gain: 0.6, cutoff: 4200, env: (t) => Math.exp(-60 * t) });
  drum(out, 0.62, { f0: 200, f1: 70, dur: 0.25, gain: 0.55 });
  for (let i = 0; i < 8; i++) {
    const at = 0.66 + rnd() * 0.24;
    bell(out, at, {
      freq: 1800 + rnd() * 3000,
      dur: 0.3,
      gain: 0.07,
      pan: rnd() - 0.5,
      bright: 0.7,
    });
  }
  return out;
}

/* ----------------------------------------------------------- music loop --- */

/**
 * ~64s dark medieval war loop: harmonic-minor viol/cello drone, low choir pad,
 * church-organ fifths, slow taiko war drums, tolling bell, sparse solo lament.
 * Rendered with a 2s tail crossfaded into the head so it seams cleanly.
 */
function musicTheme() {
  const TOTAL = 64;
  const XFADE = 2;
  const RENDER = TOTAL + XFADE;
  const BAR = 4; // ~60 BPM, 4s per bar
  const full = stereo(RENDER);

  // D harmonic minor — Dm / Bb / Gm / A(maj, the "evil" V)
  const prog = [
    { root: 26, notes: [50, 53, 57] }, // Dm : D1 | D3 F3 A3
    { root: 22, notes: [50, 53, 58] }, // Bb : Bb0| D3 F3 Bb3
    { root: 31, notes: [50, 55, 58] }, // Gm : G1 | D3 G3 Bb3
    { root: 33, notes: [49, 52, 57] }, // A  : A1 | C#3 E3 A3
  ];
  const nChords = Math.ceil(RENDER / BAR) + 1;

  // --- low viol/cello section: saw stack, heavy lowpass, slow vibrato ---
  const strings = stereo(RENDER);
  for (let i = 0; i < nChords; i++) {
    const c = prog[i % prog.length];
    const at = i * BAR;
    for (const m of c.notes) {
      const base = hz(m);
      tone(strings, at, {
        type: "saw",
        dur: BAR + 1.4,
        gain: 0.11,
        voices: 4,
        detune: 9,
        pan: (rnd() - 0.5) * 0.5,
        freqFn: (t) => base * (1 + 0.004 * Math.sin(TAU * 5.2 * t)),
        env: (t, d) => adsr(t, d, 0.9, 0.6, 0.85, 1.6),
      });
    }
  }
  lowpass(strings, (t) => 430 + 150 * Math.sin((TAU * t) / 19));
  mix(full, strings, 0, 0.95);

  // --- dark choir pad an octave up, very filtered (voice-like "aah") ---
  const choir = stereo(RENDER);
  for (let i = 0; i < nChords; i++) {
    const c = prog[i % prog.length];
    const at = i * BAR;
    for (const m of c.notes) {
      const base = hz(m + 12);
      tone(choir, at, {
        type: "saw",
        dur: BAR + 2.2,
        gain: 0.05,
        voices: 5,
        detune: 16,
        pan: (rnd() - 0.5) * 0.7,
        freqFn: (t) => base * (1 + 0.006 * Math.sin(TAU * 4.4 * t + i)),
        env: (t, d) => adsr(t, d, 2.2, 0.9, 0.8, 2.6),
      });
    }
  }
  lowpass(choir, (t) => 900 + 320 * Math.sin((TAU * t) / 13));
  mix(full, choir, 0, 0.9);

  // --- organ fifths (root + fifth, square-ish) enter in the second half ---
  for (let i = 0; i < nChords; i++) {
    const c = prog[i % prog.length];
    const at = i * BAR;
    if (at < TOTAL / 2 - BAR) continue;
    for (const iv of [0, 7, 12]) {
      tone(full, at, {
        type: "square",
        freq: hz(c.root + 12 + iv),
        dur: BAR + 0.8,
        gain: 0.028,
        voices: 2,
        detune: 6,
        env: (t, d) => adsr(t, d, 0.6, 0.4, 0.85, 1.4),
      });
    }
  }

  // --- deep root drone ---
  for (let i = 0; i < nChords; i++) {
    const c = prog[i % prog.length];
    tone(full, i * BAR, {
      type: "sine", freq: hz(c.root), dur: BAR + 1.6, gain: 0.24,
      env: (t, d) => adsr(t, d, 1.2, 0.6, 0.9, 1.8),
    });
  }

  // --- slow taiko war drums: heavy 1, ghost on 3, double-hit every 4th bar ---
  for (let bar = 0; bar * BAR < RENDER; bar++) {
    const at = bar * BAR;
    drum(full, at, { f0: 150, f1: 46, dur: 0.85, gain: 0.72 });
    noise(full, at, { dur: 0.09, gain: 0.16, cutoff: 2600, env: (t) => Math.exp(-42 * t) });
    drum(full, at + BAR / 2, { f0: 128, f1: 44, dur: 0.55, gain: 0.3 });
    if (bar % 4 === 3) {
      drum(full, at + BAR - 0.55, { f0: 140, f1: 46, dur: 0.4, gain: 0.34 });
      drum(full, at + BAR - 0.28, { f0: 150, f1: 48, dur: 0.4, gain: 0.42 });
    }
  }

  // --- distant tolling bell every 8 bars ---
  for (let i = 0; i * BAR * 8 < RENDER; i++) {
    const at = i * BAR * 8 + 0.05;
    bell(full, at, { freq: hz(50), dur: 5.0, gain: 0.12, bright: 0.35, pan: -0.25 });
    bell(full, at + 0.03, { freq: hz(62), dur: 3.6, gain: 0.05, bright: 0.5, pan: 0.2 });
  }

  // --- sparse lament: solo line on D harmonic minor, second half only ---
  const lament = [62, 65, 69, 68, 65, 62, 61, 62];
  for (let i = 0; i < lament.length; i++) {
    const at = TOTAL / 2 + 1 + i * 3.2;
    if (at > TOTAL - 1) break;
    const base = hz(lament[i]);
    tone(full, at, {
      type: "triangle",
      dur: 2.6,
      gain: 0.055,
      voices: 2,
      detune: 7,
      pan: 0.15,
      freqFn: (t) => base * (1 + 0.007 * Math.sin(TAU * 5.6 * t)),
      env: (t, d) => adsr(t, d, 0.5, 0.5, 0.6, 1.4),
    });
  }

  // --- wind bed ---
  noise(full, 0, {
    dur: RENDER, gain: 0.035, cutoff: 620,
    env: (t) => 0.5 + 0.5 * Math.sin((TAU * t) / 17),
  });

  // seam: equal-power crossfade of the tail into the head
  const out = stereo(TOTAL);
  const N = out.n;
  const X = Math.min(Math.floor(XFADE * SR), full.n - N);
  for (let i = 0; i < N; i++) { out.l[i] = full.l[i]; out.r[i] = full.r[i]; }
  for (let i = 0; i < X; i++) {
    const a = Math.cos((Math.PI / 2) * (i / X));
    const b = Math.sin((Math.PI / 2) * (i / X));
    out.l[i] = out.l[i] * b + full.l[N + i] * a;
    out.r[i] = out.r[i] * b + full.r[N + i] * a;
  }
  return out;
}

/* --------------------------------------------------------------- wav out --- */

/** Write a stereo {l,r,n} buffer as a 16-bit PCM WAV file. */
function writeWav(file, buf) {
  const n = buf.n;
  const bytes = n * 2 * 2;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + bytes, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(2, 22);
  header.writeUInt32LE(SR, 24);
  header.writeUInt32LE(SR * 4, 28);
  header.writeUInt16LE(4, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(bytes, 40);
  const pcm = Buffer.alloc(bytes);
  let o = 0;
  for (let i = 0; i < n; i++) {
    const L = Math.max(-1, Math.min(1, buf.l[i]));
    const R = Math.max(-1, Math.min(1, buf.r[i]));
    pcm.writeInt16LE(Math.round(L * 32767), o); o += 2;
    pcm.writeInt16LE(Math.round(R * 32767), o); o += 2;
  }
  fs.writeFileSync(file, Buffer.concat([header, pcm]));
}

const SOUNDS = {
  "click": sfxClick,
  "card-play": sfxCardPlay,
  "attack": sfxAttack,
  "shatter": sfxShatter,
  "heal": sfxHeal,
  "buff": sfxBuff,
  "spell": sfxSpell,
  "turn": sfxTurn,
  "match-start": sfxMatchStart,
  "victory": sfxVictory,
  "defeat": sfxDefeat,
  "purchase": sfxPurchase,
  "pack-open": sfxPackOpen,
  "music-theme": musicTheme,
};

/** Prefer libvorbis; fall back to ffmpeg's native (experimental) Vorbis encoder. */
function vorbisArgs() {
  const probe = spawnSync(FFMPEG, ["-hide_banner", "-encoders"], { encoding: "utf8" });
  if ((probe.stdout || "").includes("libvorbis")) return ["-c:a", "libvorbis", "-qscale:a", "4"];
  return ["-c:a", "vorbis", "-strict", "experimental", "-qscale:a", "4"];
}

function main() {
  if (!fs.existsSync(FFMPEG)) {
    console.error(`ffmpeg not found at ${FFMPEG}`);
    process.exit(1);
  }
  const encArgs = vorbisArgs();
  console.log(`encoder: ${encArgs[1]}\n`);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "shardfall-audio-"));
  let failed = 0;

  for (const [name, build] of Object.entries(SOUNDS)) {
    const t0 = Date.now();
    srand(hashName(name));
    const buf = build();
    softClip(buf, 1.1);
    normalize(buf, name === "music-theme" ? 0.72 : 0.85);
    if (name !== "music-theme") edgeFade(buf); // never fade the loop seam
    const wav = path.join(tmpDir, `${name}.wav`);
    writeWav(wav, buf);
    const ogg = path.join(OUT_DIR, `${name}.ogg`);
    const res = spawnSync(
      FFMPEG,
      ["-y", "-loglevel", "error", "-i", wav, ...encArgs, ogg],
      { stdio: ["ignore", "inherit", "inherit"] },
    );
    if (res.status !== 0) {
      console.error(`FAILED: ${name}`);
      failed++;
      continue;
    }
    const kb = (fs.statSync(ogg).size / 1024).toFixed(1);
    console.log(
      `${(name + ".ogg").padEnd(18)} ${(buf.n / SR).toFixed(2).padStart(6)}s  ${kb.padStart(7)} KB  (${Date.now() - t0}ms)`,
    );
  }

  fs.rmSync(tmpDir, { recursive: true, force: true });
  if (failed > 0) {
    console.error(`${failed} sound(s) failed to encode`);
    process.exit(1);
  }
  console.log(`\nDone — ${Object.keys(SOUNDS).length} files in ${OUT_DIR}`);
}

main();
