// Additive sine-bank resynthesis — pure functions, no DOM or Web Audio.
// One free-running sine oscillator per grid row; its gain follows the
// row's cells, linearly interpolated between columns so a column
// boundary never clicks. Same grid in, same samples out.

import { COLUMNS_PER_SECOND, rowToFreq } from "./grid.js";

export const SAMPLE_RATE = 44100;

// Cell value → oscillator gain. Painted brightness is perceptual: mid-grey
// should sound mid-loud, and linear amplitude would leave it near-silent
// next to a full-white partial. Squaring sits loudness in the middle.
export const AMP_CURVE = 2;

const TWO_PI = Math.PI * 2;

/**
 * Renders the whole grid to a mono buffer.
 * Peak-normalizes only when the bank would clip, so quiet paintings stay quiet.
 */
export function renderGrid(grid, settings = {}, sampleRate = SAMPLE_RATE) {
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

  let peak = 0;
  for (let i = 0; i < len; i++) {
    const a = Math.abs(out[i]);
    if (a > peak) peak = a;
  }
  const normalized = peak > 1;
  if (normalized) {
    const k = 0.99 / peak;
    for (let i = 0; i < len; i++) out[i] *= k;
  }

  return { samples: out, sampleRate, peak, normalized };
}
