// Two render engines, pure functions, no DOM or Web Audio: the sine bank
// (one free-running oscillator per grid row, Sine + Harmonic material)
// and the noise bank (one bandpass-filtered noise oscillator per row,
// Noise material). Both follow the same discipline — gain linearly
// interpolated between columns so a column boundary never clicks, silent
// runs skipped, same grid in, same samples out.

import { COLUMNS_PER_SECOND, rowToFreq } from "./grid.js";

export const SAMPLE_RATE = 44100;

// Cell value → oscillator gain. Painted brightness is perceptual: mid-grey
// should sound mid-loud, and linear amplitude would leave it near-silent
// next to a full-white partial. Squaring sits loudness in the middle.
export const AMP_CURVE = 2;

const TWO_PI = Math.PI * 2;

// Peak-normalizes only when the render would clip, so quiet paintings
// stay quiet. Shared by both engines.
function normalizePeak(out) {
  let peak = 0;
  for (let i = 0; i < out.length; i++) {
    const a = Math.abs(out[i]);
    if (a > peak) peak = a;
  }
  const normalized = peak > 1;
  if (normalized) {
    const k = 0.99 / peak;
    for (let i = 0; i < out.length; i++) out[i] *= k;
  }
  return { peak, normalized };
}

function renderSineRaw(grid, settings, sampleRate) {
  const ampCurve = settings.ampCurve ?? AMP_CURVE;
  const { cols, rows, data } = grid;
  const colStart = (c) => Math.round((c * sampleRate) / COLUMNS_PER_SECOND);
  const len = colStart(cols);
  const out = new Float32Array(len);

  // Reused per row: column gains, padded with a trailing zero so the last
  // painted column ramps to silence instead of cutting.
  const gains = new Float32Array(cols + 1);

  for (let row = 0; row < rows; row++) {
    const freq = rowToFreq(row);
    if (freq >= sampleRate / 2) continue;

    const base = row * cols;
    let silent = true;
    for (let c = 0; c < cols; c++) {
      const v = data[base + c];
      gains[c] = v > 0 ? Math.pow(v, ampCurve) : 0;
      if (v > 0) silent = false;
    }
    gains[cols] = 0;
    if (silent) continue;

    const inc = freq / sampleRate; // cycles per sample
    const rotC = Math.cos(TWO_PI * inc);
    const rotS = Math.sin(TWO_PI * inc);

    // A cell's gain applies at its column's left edge and ramps to the next
    // column's: a lone cell becomes a 20 ms triangle, an attack starts one
    // column early — inaudible at 10 ms steps, and click-free by design.
    for (let c = 0; c < cols; c++) {
      const g0 = gains[c];
      const g1 = gains[c + 1];
      if (g0 === 0 && g1 === 0) continue; // runs of silence cost nothing

      const s0 = colStart(c);
      const n = colStart(c + 1) - s0;
      const dg = (g1 - g0) / n;

      // Free-running phase: derived from absolute sample position at
      // segment entry, then advanced by complex rotation — exact frequency,
      // no per-sample Math.sin, and skipped silence leaves phase coherent.
      const phase = (inc * s0) % 1;
      let sinP = Math.sin(TWO_PI * phase);
      let cosP = Math.cos(TWO_PI * phase);

      for (let i = 0; i < n; i++) {
        out[s0 + i] += (g0 + dg * i) * sinP;
        const nextCos = cosP * rotC - sinP * rotS;
        sinP = sinP * rotC + cosP * rotS;
        cosP = nextCos;
      }
    }
  }

  return out;
}

/**
 * Renders the tonal grid (Sine + Harmonic material) to a mono buffer.
 * Peak-normalizes only when the bank would clip, so quiet paintings stay quiet.
 */
export function renderGrid(grid, settings = {}, sampleRate = SAMPLE_RATE) {
  const out = renderSineRaw(grid, settings, sampleRate);
  const { peak, normalized } = normalizePeak(out);
  return { samples: out, sampleRate, peak, normalized };
}

// --- noise bank ---

// RBJ bandpass, constant 0 dB peak (same idea Cloud Studio uses for its
// noise grains). Unlike a grain's, a row's center frequency never moves,
// so coefficients are computed once per row rather than per sample.
export const NOISE_Q = 3;

// Restores the level a narrow bandpass takes out of white noise, so a
// noise cell reads at roughly the same loudness as a sine cell of the
// same painted value. Measured, not derived.
const NOISE_MAKEUP = 9;

function bandpassCoeffs(freq, sampleRate, q) {
  const w0 = (2 * Math.PI * freq) / sampleRate;
  const alpha = Math.sin(w0) / (2 * q);
  const a0 = 1 + alpha;
  return {
    b0: alpha / a0,
    b2: -alpha / a0,
    a1: (-2 * Math.cos(w0)) / a0,
    a2: (1 - alpha) / a0,
  };
}

function renderNoiseRaw(grid, settings, sampleRate) {
  const ampCurve = settings.ampCurve ?? AMP_CURVE;
  const q = settings.q ?? NOISE_Q;
  const { cols, rows, data } = grid;
  const colStart = (c) => Math.round((c * sampleRate) / COLUMNS_PER_SECOND);
  const len = colStart(cols);
  const out = new Float32Array(len);

  const gains = new Float32Array(cols + 1);

  for (let row = 0; row < rows; row++) {
    const freq = rowToFreq(row);
    if (freq >= sampleRate / 2) continue;

    const base = row * cols;
    let silent = true;
    for (let c = 0; c < cols; c++) {
      const v = data[base + c];
      gains[c] = v > 0 ? Math.pow(v, ampCurve) : 0;
      if (v > 0) silent = false;
    }
    gains[cols] = 0;
    if (silent) continue;

    const bp = bandpassCoeffs(freq, sampleRate, q);
    // Direct Form I biquad state (b1 = 0 for this filter, so x[n-1] never
    // actually contributes — x1 is kept only to shift into x2 correctly).
    let z1 = 0;
    let z2 = 0;
    let x1 = 0;
    let x2 = 0;

    for (let c = 0; c < cols; c++) {
      const g0 = gains[c];
      const g1 = gains[c + 1];
      if (g0 === 0 && g1 === 0) {
        // A filter carries state, unlike a sine's phase, so a silent run
        // isn't free the way it is for the sine bank — but re-entering
        // after a gap with a cold (zeroed) filter costs one negligible
        // transient, far cheaper than carrying the memory forward.
        z1 = z2 = x1 = x2 = 0;
        continue;
      }

      const s0 = colStart(c);
      const n = colStart(c + 1) - s0;
      const dg = (g1 - g0) / n;

      for (let i = 0; i < n; i++) {
        const white = Math.random() * 2 - 1;
        const y = bp.b0 * white + bp.b2 * x2 - bp.a1 * z1 - bp.a2 * z2;
        x2 = x1;
        x1 = white;
        z2 = z1;
        z1 = y;
        out[s0 + i] += (g0 + dg * i) * y * NOISE_MAKEUP;
      }
    }
  }

  return out;
}

/**
 * Renders the noise grid to a mono buffer: one bandpass-filtered noise
 * oscillator per row, driven by that row's cells exactly like the sine
 * bank is driven by the tonal grid.
 */
export function renderNoiseGrid(grid, settings = {}, sampleRate = SAMPLE_RATE) {
  const out = renderNoiseRaw(grid, settings, sampleRate);
  const { peak, normalized } = normalizePeak(out);
  return { samples: out, sampleRate, peak, normalized };
}

/**
 * Renders the whole document: the tonal grid through the sine bank plus
 * the noise grid through the noise bank, summed and peak-normalized once
 * on the sum — normalizing each engine separately first would distort
 * their relative balance whenever only one of them clips.
 */
export function renderDocument({ tonalGrid, noiseGrid, noiseSettings = {} }, sampleRate = SAMPLE_RATE) {
  const tonal = renderSineRaw(tonalGrid, {}, sampleRate);
  const noise = renderNoiseRaw(noiseGrid, noiseSettings, sampleRate);
  const len = Math.max(tonal.length, noise.length);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) out[i] = (tonal[i] ?? 0) + (noise[i] ?? 0);
  const { peak, normalized } = normalizePeak(out);
  return { samples: out, sampleRate, peak, normalized };
}
