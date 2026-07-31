// Onset detection and initial event-anatomy segmentation. No FFT: a
// frame-based RMS envelope tracks level, a positive sample-difference flux
// tracks attacks, and an adaptive threshold turns flux peaks into onsets.
// This is deliberately a suggestion, not a claim of perfect segmentation —
// sustained/drone material with no sharp attacks may legitimately produce
// zero events, and that's the correct, honest result (see PLAN.md's v1
// scope decisions).

import { normalizeEvent } from "./model.js";

const FRAME_MS = 10;
const HOP_MS = 5;
const ADAPTIVE_WINDOW_SECONDS = 0.3;
const MAX_FORESHADOW_SECONDS = 0.15;
const MIN_EXCITATION_SECONDS = 0.003;
const MAX_EXCITATION_SECONDS = 0.06;
const RESONANCE_DROP_RATIO = 0.35; // fraction of this event's peak RMS
const SILENCE_FLOOR_RATIO = 0.08;
const QUIET_RATIO = 0.15;
const MIN_FLUX_FLOOR = 0.02; // ignore peaks in near-silent noise floor
const RISE_BEFORE_SECONDS = 0.08; // longer trailing baseline, so slow (vocal-like) attacks still register
const RISE_AFTER_SECONDS = 0.02;
const RISE_RATIO = 1.3; // RMS just after a real onset must clear the preceding baseline by this much

function computeFrames(samples, sampleRate) {
  const frameSize = Math.max(32, Math.round((sampleRate * FRAME_MS) / 1000));
  const hopSize = Math.max(16, Math.round((sampleRate * HOP_MS) / 1000));
  const frameCount = Math.max(0, Math.floor((samples.length - frameSize) / hopSize) + 1);

  const rms = new Float32Array(frameCount);
  const flux = new Float32Array(frameCount);
  for (let i = 0; i < frameCount; i++) {
    const start = i * hopSize;
    let sumSq = 0;
    let posDiff = 0;
    let prev = samples[start];
    for (let n = 0; n < frameSize; n++) {
      const s = samples[start + n];
      sumSq += s * s;
      const d = s - prev;
      if (d > 0) posDiff += d;
      prev = s;
    }
    rms[i] = Math.sqrt(sumSq / frameSize);
    flux[i] = posDiff / frameSize;
  }

  let fluxMax = 0;
  for (let i = 0; i < frameCount; i++) if (flux[i] > fluxMax) fluxMax = flux[i];
  const fluxNorm = new Float32Array(frameCount);
  if (fluxMax > 0) for (let i = 0; i < frameCount; i++) fluxNorm[i] = flux[i] / fluxMax;

  return { rms, fluxNorm, frameSize, hopSize, frameCount };
}

function adaptiveThreshold(fluxNorm, windowFrames, sensitivity) {
  const n = fluxNorm.length;
  const threshold = new Float32Array(n);
  const k = 3.0 - sensitivity * 2.5; // sensitivity 0..1 -> k 3.0..0.5 (higher sensitivity, lower bar)
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - windowFrames);
    const hi = Math.min(n - 1, i + windowFrames);
    let sum = 0;
    let sumSq = 0;
    for (let j = lo; j <= hi; j++) {
      sum += fluxNorm[j];
      sumSq += fluxNorm[j] * fluxNorm[j];
    }
    const count = hi - lo + 1;
    const mean = sum / count;
    const variance = Math.max(0, sumSq / count - mean * mean);
    threshold[i] = mean + k * Math.sqrt(variance);
  }
  return threshold;
}

// A local flux peak alone isn't enough: a steady tone's flux is periodic and
// non-zero (a sine is always rising somewhere), so periodic ripples can pop
// above a tight local threshold with no real attack behind them. Require
// that short-term RMS actually rose across the candidate point — the thing
// that's true of a real onset and false of a sustained, steady sound.
function passesRiseTest(rms, hopSize, sampleRate, candidateFrame) {
  const beforeFrames = Math.max(2, Math.round((RISE_BEFORE_SECONDS * sampleRate) / hopSize));
  const afterFrames = Math.max(2, Math.round((RISE_AFTER_SECONDS * sampleRate) / hopSize));
  const beforeStart = Math.max(0, candidateFrame - beforeFrames);
  const afterEnd = Math.min(rms.length - 1, candidateFrame + afterFrames);

  let beforeSum = 0;
  let beforeCount = 0;
  for (let f = beforeStart; f < candidateFrame; f++) {
    beforeSum += rms[f];
    beforeCount++;
  }
  let afterSum = 0;
  let afterCount = 0;
  for (let f = candidateFrame; f <= afterEnd; f++) {
    afterSum += rms[f];
    afterCount++;
  }

  const before = beforeCount ? beforeSum / beforeCount : 0;
  const after = afterCount ? afterSum / afterCount : 0;
  return after > before * RISE_RATIO + 1e-6;
}

function pickOnsetFrames(fluxNorm, rms, hopSize, sampleRate, threshold, minGapFrames) {
  const onsets = [];
  let lastOnset = -Infinity;
  for (let i = 1; i < fluxNorm.length - 1; i++) {
    if (
      fluxNorm[i] > MIN_FLUX_FLOOR &&
      fluxNorm[i] > threshold[i] &&
      fluxNorm[i] >= fluxNorm[i - 1] &&
      fluxNorm[i] >= fluxNorm[i + 1] &&
      i - lastOnset >= minGapFrames &&
      passesRiseTest(rms, hopSize, sampleRate, i)
    ) {
      onsets.push(i);
      lastOnset = i;
    }
  }
  return onsets;
}

function buildEventAnatomy({ rms, fluxNorm, hopSize, sampleRate, onsetSample, floorSample, ceilingSample }) {
  const frameCount = rms.length;
  const toFrame = (s) => Math.min(frameCount - 1, Math.max(0, Math.round(s / hopSize)));
  const onsetFrame = toFrame(onsetSample);

  const minExcitationSamples = Math.round(MIN_EXCITATION_SECONDS * sampleRate);
  const maxExcitationSamples = Math.round(MAX_EXCITATION_SECONDS * sampleRate);
  const attackBaseline = fluxNorm[onsetFrame] * 0.25;
  let bodyFrame = Math.min(ceilingSample, onsetSample + maxExcitationSamples);
  for (let f = onsetFrame; f < frameCount; f++) {
    const s = f * hopSize;
    if (s - onsetSample < minExcitationSamples) continue;
    if (s - onsetSample > maxExcitationSamples || fluxNorm[f] <= attackBaseline) {
      bodyFrame = Math.min(ceilingSample, s);
      break;
    }
  }

  const peakSearchEndFrame = toFrame(ceilingSample);
  let peakRms = rms[onsetFrame];
  for (let f = onsetFrame; f <= peakSearchEndFrame; f++) if (rms[f] > peakRms) peakRms = rms[f];
  if (peakRms <= 0) peakRms = 1e-6;

  const bodyFrameIdx = toFrame(bodyFrame);
  let resonanceFrame = ceilingSample;
  for (let f = bodyFrameIdx; f <= peakSearchEndFrame; f++) {
    if (rms[f] <= peakRms * RESONANCE_DROP_RATIO) {
      resonanceFrame = f * hopSize;
      break;
    }
  }
  resonanceFrame = Math.min(Math.max(resonanceFrame, bodyFrame), ceilingSample);

  const resonanceFrameIdx = toFrame(resonanceFrame);
  let endFrame = ceilingSample;
  for (let f = resonanceFrameIdx; f <= peakSearchEndFrame; f++) {
    if (rms[f] <= peakRms * SILENCE_FLOOR_RATIO) {
      endFrame = f * hopSize;
      break;
    }
  }
  endFrame = Math.min(Math.max(endFrame, resonanceFrame), ceilingSample);

  const maxForeshadowSamples = Math.round(MAX_FORESHADOW_SECONDS * sampleRate);
  const lookbackFloorFrame = toFrame(Math.max(floorSample, onsetSample - maxForeshadowSamples));
  let startFrame = onsetSample;
  for (let f = onsetFrame - 1; f >= lookbackFloorFrame; f--) {
    if (rms[f] <= peakRms * QUIET_RATIO) {
      startFrame = f * hopSize;
    } else {
      break;
    }
  }
  startFrame = Math.max(floorSample, Math.min(startFrame, onsetSample));

  return {
    startFrame,
    excitationFrame: onsetSample,
    bodyFrame,
    resonanceFrame,
    endFrame,
  };
}

export function analyzeEvents(source, { sensitivity = 0.5, minGapSeconds = 0.08 } = {}) {
  const { samples, sampleRate, frames: totalFrames } = source;
  const { rms, fluxNorm, hopSize, frameCount } = computeFrames(samples, sampleRate);

  if (frameCount === 0) {
    return { events: [], energy: { values: new Float32Array(0), frameStep: hopSize } };
  }

  const windowFrames = Math.max(4, Math.round((ADAPTIVE_WINDOW_SECONDS * sampleRate) / hopSize));
  const threshold = adaptiveThreshold(fluxNorm, windowFrames, sensitivity);
  const minGapFrames = Math.max(1, Math.round((minGapSeconds * sampleRate) / hopSize));
  const onsetFrames = pickOnsetFrames(fluxNorm, rms, hopSize, sampleRate, threshold, minGapFrames);

  const events = [];
  let floorSample = 0;
  for (let i = 0; i < onsetFrames.length; i++) {
    const onsetSample = onsetFrames[i] * hopSize;
    const ceilingSample = i + 1 < onsetFrames.length ? onsetFrames[i + 1] * hopSize : totalFrames;
    const anatomy = buildEventAnatomy({
      rms,
      fluxNorm,
      hopSize,
      sampleRate,
      onsetSample,
      floorSample,
      ceilingSample,
    });
    const event = normalizeEvent(anatomy, totalFrames);
    events.push(event);
    floorSample = event.endFrame;
  }

  return { events, energy: { values: fluxNorm, frameStep: hopSize } };
}
