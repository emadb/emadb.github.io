// The pure score-to-Float32Array offline renderer. Playback and export both
// call this same function, so what you audition is exactly what you get.
// It must not mutate source samples, document state, or the seeded RNG -
// it only ever reads samples and clip descriptions and allocates a fresh
// output buffer.

import { clipOutputDuration } from "./score.js";

// Bounded linear interpolation: positions outside the source are treated as
// silence rather than throwing, since a clip's own bounds are enforced
// elsewhere (this is a defensive floor, not the primary guarantee).
function sampleAt(samples, pos) {
  const i0 = Math.floor(pos);
  const i1 = i0 + 1;
  const frac = pos - i0;
  const s0 = i0 >= 0 && i0 < samples.length ? samples[i0] : 0;
  const s1 = i1 >= 0 && i1 < samples.length ? samples[i1] : 0;
  return s0 + (s1 - s0) * frac;
}

// Equal-power fade in/out, each capped at half the clip's own duration so a
// very short clip still gets a full, symmetric fade rather than clashing
// ramps.
function equalPowerGain(i, durationFrames, fadeFrames) {
  const fade = Math.min(fadeFrames, Math.floor(durationFrames / 2));
  if (fade <= 0) return 1;
  if (i < fade) return Math.sin((Math.PI / 2) * (i / fade));
  const distFromEnd = durationFrames - 1 - i;
  if (distFromEnd < fade) return Math.sin((Math.PI / 2) * (distFromEnd / fade));
  return 1;
}

function renderClipInto(output, samples, clip, fadeFrames) {
  const durationFrames = clipOutputDuration(clip);
  const span = clip.sourceEndFrame - clip.sourceStartFrame;
  for (let i = 0; i < durationFrames; i++) {
    // Reverse simply reads the same [sourceStartFrame, sourceEndFrame) span
    // at the mirrored output-time index, rather than a separately-derived
    // formula - that keeps it symmetric with the forward case and avoids
    // reading one sample past the clip's declared (half-open) range.
    const idx = clip.reverse ? durationFrames - 1 - i : i;
    const sourceOffset = (idx / durationFrames) * span;
    const pos = clip.sourceStartFrame + sourceOffset;
    const outIdx = clip.outputStartFrame + i;
    if (outIdx < 0 || outIdx >= output.length) continue;
    const fadeGain = equalPowerGain(i, durationFrames, fadeFrames);
    output[outIdx] += sampleAt(samples, pos) * clip.gain * fadeGain;
  }
}

function peakNormalize(output) {
  let peak = 0;
  for (let i = 0; i < output.length; i++) {
    const a = Math.abs(output[i]);
    if (a > peak) peak = a;
  }
  if (peak > 1) {
    const scale = 1 / peak;
    for (let i = 0; i < output.length; i++) output[i] *= scale;
  }
}

export function renderScore({ samples, sampleRate, score, outputDurationSeconds, fadeMs = 5 }) {
  const outputFrames = Math.max(1, Math.round(outputDurationSeconds * sampleRate));
  const output = new Float32Array(outputFrames);
  const fadeFrames = Math.round((fadeMs / 1000) * sampleRate);

  for (const clip of score) {
    renderClipInto(output, samples, clip, fadeFrames);
  }

  peakNormalize(output);
  return output;
}
