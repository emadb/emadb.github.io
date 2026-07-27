// Grain rendering engine — pure functions, no DOM or Web Audio dependencies.
// A cloud is a statistical description; rendering scatters grains inside it.
// Same seeds in, same samples out.

import { mulberry32 } from "./rng.js";

export const SAMPLE_RATE = 44100;
export const MAX_GRAINS = 200000;

export const ENVELOPE_TYPES = ["gaussian", "expodec", "rexpodec"];
export const WAVEFORM_TYPES = ["sine", "saw", "square", "noise"];
// Glisson synthesis (Microsound ch. 4): each grain may carry an internal
// glissando. up/down/random sweep by glideDepth octaves from the scattered
// frequency; diverge starts every grain on the band's center line and sweeps
// out to its scattered position, converge is the reverse.
export const GLIDE_MODES = ["off", "up", "down", "random", "diverge", "converge"];

const MIN_FREQ = 20;
const MAX_FREQ = 20000;
const NOISE_Q = 3;
// Restores the level a narrow bandpass takes out of white noise, so noise
// grains sit at roughly the same loudness as sine grains. Measured, not derived.
const NOISE_MAKEUP = 7.2;

export function defaultCloud(overrides = {}) {
  return {
    id: `cloud-${Math.random().toString(36).slice(2, 9)}`,
    timeStart: 0,
    timeEnd: 2,
    freqLow: 200,
    freqHigh: 2000,
    density: 40,
    durMinMs: 20,
    durMaxMs: 60,
    envelope: "gaussian",
    waveform: "sine",
    glideMode: "off",
    glideDepth: 1,
    gainDb: -6,
    scatter: 0.5,
    fadeIn: 0.1,
    fadeOut: 0.1,
    seed: 1,
    muted: false,
    ...overrides,
  };
}

// Keeps a cloud inside the ranges the renderer can handle, whatever edited it —
// a dragged edge or a typed value. Only orders and clamps; it never resizes.
export function normalizeCloud(cloud, durationSec) {
  const [t0, t1] = [cloud.timeStart, cloud.timeEnd].sort((a, b) => a - b);
  const [f0, f1] = [cloud.freqLow, cloud.freqHigh].sort((a, b) => a - b);
  const [d0, d1] = [cloud.durMinMs, cloud.durMaxMs].sort((a, b) => a - b);

  return {
    timeStart: clamp(t0, 0, durationSec),
    timeEnd: clamp(t1, 0, durationSec),
    freqLow: clamp(f0, MIN_FREQ, MAX_FREQ),
    freqHigh: clamp(f1, MIN_FREQ, MAX_FREQ),
    durMinMs: clamp(d0, 0.5, 500),
    durMaxMs: clamp(d1, 0.5, 500),
    density: clamp(cloud.density, 0, 2000),
    gainDb: clamp(cloud.gainDb, -60, 6),
    scatter: clamp(cloud.scatter, 0, 1),
    fadeIn: clamp(cloud.fadeIn, 0, 0.5),
    fadeOut: clamp(cloud.fadeOut, 0, 0.5),
    seed: clamp(Math.round(cloud.seed) || 0, 0, 999999),
    envelope: ENVELOPE_TYPES.includes(cloud.envelope) ? cloud.envelope : "gaussian",
    waveform: WAVEFORM_TYPES.includes(cloud.waveform) ? cloud.waveform : "sine",
    glideMode: GLIDE_MODES.includes(cloud.glideMode) ? cloud.glideMode : "off",
    glideDepth: clamp(cloud.glideDepth, 0, 4),
  };
}

// --- grain envelopes: normalized position 0..1 -> gain 0..1 ---

// The attack is an absolute time, not a fraction of the grain: on a 6 ms grain
// a fractional attack collapses to about one sample, and that step scatters
// broadband energy far outside the cloud's frequency band. Half a millisecond
// still reads as percussive.
const EXPODEC_ATTACK_SEC = 0.0005;
const EXPODEC_MAX_ATTACK = 0.25; // fraction of grain, for very short grains
const EXPODEC_K = 6.9; // ends near 0.001, so no click at the tail

function envGaussian(x) {
  return Math.exp(-0.5 * ((x - 0.5) / 0.15) ** 2);
}

function envExpodec(x, attack) {
  if (x < attack) return x / attack;
  return Math.exp((-EXPODEC_K * (x - attack)) / (1 - attack));
}

// Envelopes are built per grain because attack shape depends on grain duration.
function makeEnvelope(type, durSec) {
  if (type !== "expodec" && type !== "rexpodec") return envGaussian;
  const attack = Math.min(EXPODEC_ATTACK_SEC / durSec, EXPODEC_MAX_ATTACK);
  return type === "expodec"
    ? (x) => envExpodec(x, attack)
    : (x) => envExpodec(1 - x, attack);
}

// --- oscillators ---

// PolyBLEP correction: rounds off the discontinuity of saw/square so that
// grains high in the frequency band don't alias into a metallic mess.
function polyBlep(t, dt) {
  if (t < dt) {
    const x = t / dt;
    return x + x - x * x - 1;
  }
  if (t > 1 - dt) {
    const x = (t - 1) / dt;
    return x * x + x + x + 1;
  }
  return 0;
}

// RBJ bandpass (constant 0 dB peak). Gives a noise grain a pitch centre,
// so the cloud's frequency band still means something for noise.
function bandpassCoeffs(freq, sampleRate) {
  const w0 = (2 * Math.PI * freq) / sampleRate;
  const alpha = Math.sin(w0) / (2 * NOISE_Q);
  const a0 = 1 + alpha;
  return {
    b0: alpha / a0,
    b2: -alpha / a0,
    a1: (-2 * Math.cos(w0)) / a0,
    a2: (1 - alpha) / a0,
  };
}

// --- cloud rendering ---

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const dbToLin = (db) => 10 ** (db / 20);

// Cloud amplitude envelope, sampled once per grain at its onset.
function cloudAmp(u, fadeIn, fadeOut) {
  if (fadeIn > 0 && u < fadeIn) return u / fadeIn;
  if (fadeOut > 0 && u > 1 - fadeOut) return (1 - u) / fadeOut;
  return 1;
}

/**
 * Scatters one cloud's grains additively into the target stereo buffers.
 * Returns the grain metadata (used later to plot grains on the canvas).
 */
export function renderCloud(cloud, target) {
  const { left, right, sampleRate, budget = MAX_GRAINS } = target;
  const len = left.length;
  const rng = mulberry32(cloud.seed >>> 0);

  const tStart = Math.max(0, cloud.timeStart);
  const tEnd = Math.max(tStart, cloud.timeEnd);
  const span = tEnd - tStart;
  const count = Math.min(budget, Math.round(cloud.density * span));
  if (count <= 0 || span <= 0) return [];

  const fLow = clamp(Math.min(cloud.freqLow, cloud.freqHigh), MIN_FREQ, MAX_FREQ);
  const fHigh = clamp(Math.max(cloud.freqLow, cloud.freqHigh), MIN_FREQ, MAX_FREQ);
  const freqRatio = fHigh / fLow;
  const durMin = Math.max(0.0005, cloud.durMinMs / 1000);
  const durMax = Math.max(durMin, cloud.durMaxMs / 1000);
  const amp = dbToLin(cloud.gainDb);
  const scatter = clamp(cloud.scatter, 0, 1);
  const nyquistGuard = sampleRate * 0.45;
  const glide = GLIDE_MODES.includes(cloud.glideMode) ? cloud.glideMode : "off";
  const depthRatio = 2 ** clamp(cloud.glideDepth ?? 0, 0, 4);
  const centerFreq = clamp(Math.sqrt(fLow * fHigh), MIN_FREQ, nyquistGuard);
  const grains = [];

  for (let g = 0; g < count; g++) {
    const onset = tStart + rng() * span;
    const scattered = clamp(fLow * freqRatio ** rng(), MIN_FREQ, nyquistGuard);
    const dur = durMin + rng() * (durMax - durMin);

    // The grain sweeps freq -> freqEnd. The "random" draw happens only in that
    // mode, so glide-off clouds render bit-identically to pre-glisson versions.
    let freq = scattered;
    let freqEnd = scattered;
    switch (glide) {
      case "up":
        freqEnd = scattered * depthRatio;
        break;
      case "down":
        freqEnd = scattered / depthRatio;
        break;
      case "random":
        freqEnd = rng() < 0.5 ? scattered * depthRatio : scattered / depthRatio;
        break;
      case "diverge":
        freq = centerFreq;
        break;
      case "converge":
        freqEnd = centerFreq;
        break;
    }
    freqEnd = clamp(freqEnd, MIN_FREQ, nyquistGuard);
    const gainG = amp * cloudAmp((onset - tStart) / span, cloud.fadeIn, cloud.fadeOut);

    // Equal-power panning; scatter widens the spread around centre.
    const pan = 0.5 + (rng() - 0.5) * scatter;
    const gainL = Math.cos(pan * Math.PI * 0.5);
    const gainR = Math.sin(pan * Math.PI * 0.5);

    const startIdx = Math.round(onset * sampleRate);
    const n = Math.max(1, Math.round(dur * sampleRate));
    const envFn = makeEnvelope(cloud.envelope, dur);
    // Exponential sweep — linear in log-frequency, like the axis: the
    // increment is multiplied by a constant per-sample ratio.
    let inc = freq / sampleRate;
    const glideK = n > 1 ? (freqEnd / freq) ** (1 / (n - 1)) : 1;
    let phase = rng();

    let bp = null;
    let z1 = 0;
    let z2 = 0;
    let x1 = 0;
    let x2 = 0;
    if (cloud.waveform === "noise") bp = bandpassCoeffs(freq, sampleRate);

    for (let i = 0; i < n; i++) {
      const idx = startIdx + i;
      if (idx >= len) break;
      if (idx < 0) continue;

      // A sweeping noise grain re-tunes its bandpass along the way. Every 16
      // samples is far finer than the ear tracks a moving filter center.
      if (bp && glide !== "off" && i > 0 && (i & 15) === 0) {
        bp = bandpassCoeffs(inc * sampleRate, sampleRate);
      }

      let s;
      switch (cloud.waveform) {
        case "saw":
          s = 2 * phase - 1 - polyBlep(phase, inc);
          break;
        case "square": {
          const half = phase < 0.5 ? 1 : -1;
          s = half + polyBlep(phase, inc) - polyBlep((phase + 0.5) % 1, inc);
          break;
        }
        case "noise": {
          const white = rng() * 2 - 1;
          s = bp.b0 * white + bp.b2 * x2 - bp.a1 * z1 - bp.a2 * z2;
          x2 = x1;
          x1 = white;
          z2 = z1;
          z1 = s;
          s *= NOISE_MAKEUP;
          break;
        }
        default:
          s = Math.sin(2 * Math.PI * phase);
      }

      phase += inc;
      if (phase >= 1) phase -= 1;
      inc *= glideK;

      const v = s * envFn(i / n) * gainG;
      left[idx] += v * gainL;
      right[idx] += v * gainR;
    }

    grains.push({ cloudId: cloud.id, t: onset, f: freq, f2: freqEnd, dur });
  }

  return grains;
}

/**
 * Renders every cloud in the project into one stereo pair.
 * Peak-normalizes only when the mix would clip, so quiet projects stay quiet.
 */
export function renderProject(project, sampleRate = SAMPLE_RATE) {
  const len = Math.max(1, Math.round(project.durationSec * sampleRate));
  const left = new Float32Array(len);
  const right = new Float32Array(len);
  let grains = [];
  let budget = MAX_GRAINS;

  for (const cloud of project.clouds) {
    if (cloud.muted) continue;
    const g = renderCloud(cloud, { left, right, sampleRate, budget });
    grains = grains.concat(g);
    budget -= g.length;
    if (budget <= 0) break;
  }

  let peak = 0;
  for (let i = 0; i < len; i++) {
    const a = Math.abs(left[i]);
    const b = Math.abs(right[i]);
    if (a > peak) peak = a;
    if (b > peak) peak = b;
  }

  const normalized = peak > 1;
  if (normalized) {
    const k = 0.99 / peak;
    for (let i = 0; i < len; i++) {
      left[i] *= k;
      right[i] *= k;
    }
  }

  return { left, right, sampleRate, grains, peak, normalized, truncated: budget <= 0 };
}
