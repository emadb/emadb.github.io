// Pure drawing and coordinate math for the source waveform + onset-energy
// lane. Everything here works in device pixels (the same units as
// canvas.width/height) so callers never need to reason about DPR twice.
//
// The view is a plain struct owned by the caller (main.js):
//   { viewStartFrame, framesPerPixel }
// framesPerPixel is frames-per-*device*-pixel.

// Precompute a min/max mip pyramid once per (immutable) source, so a repaint
// never has to touch more than a couple of samples per pixel column
// regardless of file length or zoom level.
export function buildPeakPyramid(samples) {
  const levels = [];
  let count = Math.ceil(samples.length / 2);
  let mins = new Float32Array(count);
  let maxs = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const a = samples[2 * i];
    const b = 2 * i + 1 < samples.length ? samples[2 * i + 1] : a;
    mins[i] = Math.min(a, b);
    maxs[i] = Math.max(a, b);
  }
  levels.push({ decimation: 2, mins, maxs });

  while (levels[levels.length - 1].mins.length > 2) {
    const prev = levels[levels.length - 1];
    const n = Math.ceil(prev.mins.length / 2);
    const mins2 = new Float32Array(n);
    const maxs2 = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = 2 * i;
      const b = 2 * i + 1;
      mins2[i] = b < prev.mins.length ? Math.min(prev.mins[a], prev.mins[b]) : prev.mins[a];
      maxs2[i] = b < prev.maxs.length ? Math.max(prev.maxs[a], prev.maxs[b]) : prev.maxs[a];
    }
    levels.push({ decimation: prev.decimation * 2, mins: mins2, maxs: maxs2 });
  }
  return levels;
}

function pickLevel(levels, framesPerPixel) {
  for (const level of levels) if (level.decimation >= framesPerPixel) return level;
  return levels[levels.length - 1];
}

export function frameToX(frame, view) {
  return (frame - view.viewStartFrame) / view.framesPerPixel;
}

export function xToFrame(x, view) {
  return view.viewStartFrame + x * view.framesPerPixel;
}

// The narrowest useful view: about a screen-pixel per sample.
export function minFramesPerPixel() {
  return 0.05;
}

export function fitFramesPerPixel(totalFrames, widthPx) {
  return totalFrames / Math.max(1, widthPx);
}

export function clampView(view, totalFrames, widthPx) {
  const maxFpp = fitFramesPerPixel(totalFrames, widthPx);
  const framesPerPixel = Math.min(maxFpp, Math.max(minFramesPerPixel(), view.framesPerPixel));
  const visibleFrames = framesPerPixel * widthPx;
  const maxStart = Math.max(0, totalFrames - visibleFrames);
  const viewStartFrame = Math.min(maxStart, Math.max(0, view.viewStartFrame));
  return { viewStartFrame, framesPerPixel };
}

const NICE_STEPS_SECONDS = [
  0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5,
  1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600,
];

function pickTickStepSeconds(secondsPerPixel, minPixelSpacing) {
  const minSeconds = secondsPerPixel * minPixelSpacing;
  for (const step of NICE_STEPS_SECONDS) if (step >= minSeconds) return step;
  return NICE_STEPS_SECONDS[NICE_STEPS_SECONDS.length - 1];
}

function formatTick(seconds, step) {
  if (step < 1) return `${seconds.toFixed(Math.max(0, -Math.floor(Math.log10(step))))}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`;
}

const COLORS = {
  bg: "#0a0d13",
  waveform: "#7f8db3",
  waveformFill: "rgba(127, 141, 179, 0.35)",
  ruler: "#2a3242",
  rulerText: "#6b7686",
  selection: "rgba(167, 139, 250, 0.18)",
  selectionBorder: "rgba(167, 139, 250, 0.6)",
  playhead: "#a78bfa",
  energyBg: "#10141c",
  energyFill: "rgba(224, 113, 106, 0.55)",
};

const ROLE_BANDS = [
  { key: "foreshadow", from: "startFrame", to: "excitationFrame", color: "rgba(107, 118, 134, 0.28)", label: "F" },
  { key: "excitation", from: "excitationFrame", to: "bodyFrame", color: "rgba(224, 113, 106, 0.28)", label: "E" },
  { key: "body", from: "bodyFrame", to: "resonanceFrame", color: "rgba(242, 196, 100, 0.22)", label: "B" },
  { key: "resonance", from: "resonanceFrame", to: "endFrame", color: "rgba(167, 139, 250, 0.22)", label: "R" },
];

const EVENT_OUTLINE = "rgba(200, 208, 220, 0.35)";
const EVENT_OUTLINE_SELECTED = "#c8d0dc";
const DIVIDER_COLOR = "rgba(200, 208, 220, 0.5)";
const MIN_LABEL_BAND_PX = 16;

export const RULER_HEIGHT = 20;

// Boundary keys in anatomy order; exported so interaction.js can hit-test
// the same handles this function draws.
export const BOUNDARY_KEYS = ["startFrame", "excitationFrame", "bodyFrame", "resonanceFrame", "endFrame"];

// Tinted role bands sit behind the waveform (a background wash); dividers,
// outlines and labels are drawn again on top of it so they stay crisp.
function drawEventBands(ctx, { events, view, waveHeight }) {
  const W = ctx.canvas.width;
  for (const event of events) {
    const x0 = frameToX(event.startFrame, view);
    const x1 = frameToX(event.endFrame, view);
    if (x1 < 0 || x0 > W) continue;
    for (const band of ROLE_BANDS) {
      const bx0 = frameToX(event[band.from], view);
      const bx1 = frameToX(event[band.to], view);
      if (bx1 <= bx0) continue;
      ctx.fillStyle = band.color;
      ctx.fillRect(bx0, 0, bx1 - bx0, waveHeight);
    }
  }
}

function drawEventOverlay(ctx, { events, selectedEventIds, view, waveHeight, dpr }) {
  const W = ctx.canvas.width;
  for (const event of events) {
    const x0 = frameToX(event.startFrame, view);
    const x1 = frameToX(event.endFrame, view);
    if (x1 < 0 || x0 > W) continue;

    for (const band of ROLE_BANDS) {
      const bx0 = frameToX(event[band.from], view);
      const bx1 = frameToX(event[band.to], view);
      if (bx1 - bx0 < MIN_LABEL_BAND_PX) continue;
      ctx.fillStyle = COLORS.rulerText;
      ctx.font = `${Math.round(9 * dpr)}px ui-monospace, monospace`;
      ctx.textBaseline = "top";
      ctx.fillText(band.label, bx0 + 3 * dpr, 3 * dpr);
    }

    ctx.strokeStyle = DIVIDER_COLOR;
    ctx.lineWidth = Math.max(1, dpr);
    for (const key of BOUNDARY_KEYS) {
      const dx = frameToX(event[key], view);
      ctx.beginPath();
      ctx.moveTo(dx, 0);
      ctx.lineTo(dx, waveHeight);
      ctx.stroke();
    }

    const selected = selectedEventIds.has(event.id);
    ctx.strokeStyle = selected ? EVENT_OUTLINE_SELECTED : EVENT_OUTLINE;
    ctx.lineWidth = selected ? Math.max(1.5, 1.5 * dpr) : Math.max(1, dpr);
    ctx.strokeRect(x0, 1, x1 - x0, waveHeight - 2);
  }
}

export function drawSourceWaveform(canvas, { source, view, events, selectedEventIds, selection, playheadFrame, dpr }) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, W, H);

  if (!source) return;

  const waveTop = 0;
  const waveHeight = H - RULER_HEIGHT;
  const midY = waveTop + waveHeight / 2;
  const ampScale = (waveHeight / 2) * 0.92;

  const { samples } = source;
  const { framesPerPixel } = view;
  const useRaw = framesPerPixel <= 1.5;
  const level = useRaw ? null : pickLevel(source.peakPyramid, framesPerPixel);

  if (events && events.length) {
    drawEventBands(ctx, { events, view, waveHeight });
  }

  ctx.beginPath();
  const topPoints = [];
  const bottomPoints = [];
  for (let x = 0; x < W; x++) {
    const f0 = xToFrame(x, view);
    const f1 = xToFrame(x + 1, view);
    let lo = 0, hi = 0;
    if (useRaw) {
      const i0 = Math.max(0, Math.floor(f0));
      const i1 = Math.min(samples.length - 1, Math.ceil(f1));
      lo = 1; hi = -1;
      for (let i = i0; i <= i1; i++) {
        const v = samples[i];
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      if (lo > hi) { lo = 0; hi = 0; }
    } else {
      const i0 = Math.max(0, Math.floor(f0 / level.decimation));
      const i1 = Math.min(level.mins.length - 1, Math.ceil(f1 / level.decimation));
      lo = 1; hi = -1;
      for (let i = i0; i <= i1; i++) {
        if (level.mins[i] < lo) lo = level.mins[i];
        if (level.maxs[i] > hi) hi = level.maxs[i];
      }
      if (lo > hi) { lo = 0; hi = 0; }
    }
    topPoints.push([x, midY - hi * ampScale]);
    bottomPoints.push([x, midY - lo * ampScale]);
  }
  ctx.moveTo(topPoints[0][0], topPoints[0][1]);
  for (const [x, y] of topPoints) ctx.lineTo(x, y);
  for (let i = bottomPoints.length - 1; i >= 0; i--) ctx.lineTo(bottomPoints[i][0], bottomPoints[i][1]);
  ctx.closePath();
  ctx.fillStyle = COLORS.waveformFill;
  ctx.fill();
  ctx.strokeStyle = COLORS.waveform;
  ctx.lineWidth = Math.max(1, dpr);
  ctx.stroke();

  if (events && events.length) {
    drawEventOverlay(ctx, { events, selectedEventIds: selectedEventIds || new Set(), view, waveHeight, dpr });
  }

  // Selection
  if (selection) {
    const x0 = frameToX(selection.startFrame, view);
    const x1 = frameToX(selection.endFrame, view);
    ctx.fillStyle = COLORS.selection;
    ctx.fillRect(x0, waveTop, x1 - x0, waveHeight);
    ctx.strokeStyle = COLORS.selectionBorder;
    ctx.lineWidth = Math.max(1, dpr);
    ctx.strokeRect(x0, waveTop, x1 - x0, waveHeight);
  }

  // Playhead
  if (playheadFrame !== null && playheadFrame !== undefined) {
    const x = frameToX(playheadFrame, view);
    if (x >= 0 && x <= W) {
      ctx.strokeStyle = COLORS.playhead;
      ctx.lineWidth = Math.max(1, dpr);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, waveHeight);
      ctx.stroke();
    }
  }

  // Ruler
  const rulerY = waveHeight;
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, rulerY, W, RULER_HEIGHT);
  ctx.strokeStyle = COLORS.ruler;
  ctx.lineWidth = Math.max(1, dpr);
  ctx.beginPath();
  ctx.moveTo(0, rulerY + 0.5);
  ctx.lineTo(W, rulerY + 0.5);
  ctx.stroke();

  const secondsPerPixel = framesPerPixel / source.sampleRate;
  const minPixelSpacing = 70 * dpr;
  const step = pickTickStepSeconds(secondsPerPixel, minPixelSpacing);
  const viewStartSec = view.viewStartFrame / source.sampleRate;
  const viewEndSec = (view.viewStartFrame + framesPerPixel * W) / source.sampleRate;
  const firstTick = Math.ceil(viewStartSec / step) * step;

  ctx.fillStyle = COLORS.rulerText;
  ctx.font = `${Math.round(10 * dpr)}px ui-monospace, monospace`;
  ctx.textBaseline = "middle";
  for (let t = firstTick; t <= viewEndSec; t += step) {
    const x = frameToX(t * source.sampleRate, view);
    ctx.beginPath();
    ctx.moveTo(x, rulerY);
    ctx.lineTo(x, rulerY + 4 * dpr);
    ctx.stroke();
    ctx.fillText(formatTick(t, step), x + 3 * dpr, rulerY + RULER_HEIGHT / 2 + 1);
  }
}

// Nearest boundary handle to a pointer position, within hitRadiusPx device
// pixels, restricted to the waveform band (not the ruler strip below it).
export function hitTestBoundary(events, view, deviceX, deviceY, waveHeight, hitRadiusPx) {
  if (deviceY < 0 || deviceY > waveHeight) return null;
  let best = null;
  let bestDist = hitRadiusPx;
  for (const event of events) {
    for (const key of BOUNDARY_KEYS) {
      const dist = Math.abs(frameToX(event[key], view) - deviceX);
      if (dist <= bestDist) {
        bestDist = dist;
        best = { eventId: event.id, boundaryKey: key };
      }
    }
  }
  return best;
}

export function drawEnergyLane(canvas, { energy, view, dpr }) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;
  ctx.fillStyle = COLORS.energyBg;
  ctx.fillRect(0, 0, W, H);

  if (!energy) return;

  const { values, frameStep } = energy; // values[i] corresponds to frame i*frameStep
  const { framesPerPixel } = view;
  ctx.beginPath();
  ctx.moveTo(0, H);
  for (let x = 0; x < W; x++) {
    const f0 = xToFrame(x, view);
    const i0 = Math.max(0, Math.floor(f0 / frameStep));
    const i1 = Math.min(values.length - 1, Math.ceil((f0 + framesPerPixel) / frameStep));
    let peak = 0;
    for (let i = i0; i <= i1; i++) if (values[i] > peak) peak = values[i];
    ctx.lineTo(x, H - peak * H);
  }
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fillStyle = COLORS.energyFill;
  ctx.fill();
}
