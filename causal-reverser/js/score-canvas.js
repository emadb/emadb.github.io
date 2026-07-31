// Drawing and hit-testing for the causal score (the output timeline) and
// for the link-curve overlay that connects a selected clip back to its
// source event. Coordinate conventions match source-canvas.js: everything
// works in device pixels, and the view is a plain
// { viewStartFrame, framesPerPixel } struct in *output*-frame space, owned
// by the caller.

import { clipOutputDuration, clipOutputEnd, LANE_COUNT } from "./score.js";
// Frame<->pixel mapping is generic (just a view struct), so the score
// timeline reuses the same helpers as the source waveform rather than
// redefining them against a second, driftable copy.
import { frameToX, xToFrame, fitFramesPerPixel, minFramesPerPixel, clampView } from "./source-canvas.js";

export { frameToX, xToFrame, fitFramesPerPixel, minFramesPerPixel, clampView };

const ROLE_COLORS = {
  foreshadow: "#6b7686",
  excitation: "#e0716a",
  body: "#f2c464",
  resonance: "#a78bfa",
  void: "#4a5468",
};

const COLORS = {
  bg: "#0a0d13",
  ruler: "#2a3242",
  rulerText: "#6b7686",
  playhead: "#a78bfa",
  clipBorder: "rgba(200, 208, 220, 0.4)",
  clipBorderSelected: "#c8d0dc",
  clipWave: "rgba(10, 13, 19, 0.55)",
};

export const RULER_HEIGHT = 20;
const CLIP_MARGIN = 3;
const MIN_LABEL_WIDTH = 26;

export function laneHeight(canvasHeight) {
  return (canvasHeight - RULER_HEIGHT) / LANE_COUNT;
}

export function laneAtY(y, canvasHeight) {
  const lh = laneHeight(canvasHeight);
  return Math.max(0, Math.min(LANE_COUNT - 1, Math.floor(y / lh)));
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

// Clip waveform previews are drawn from raw samples (clips are short - a
// full-pyramid lookup isn't needed), with a stride guard so a pathological
// clip spanning the whole source can't blow up a single repaint.
function drawClipWaveform(ctx, samples, sourceStartFrame, sourceEndFrame, reverse, x0, x1, yTop, yBottom) {
  const width = Math.max(1, Math.round(x1 - x0));
  const span = sourceEndFrame - sourceStartFrame;
  if (span <= 0 || width <= 0) return;
  const midY = (yTop + yBottom) / 2;
  const amp = ((yBottom - yTop) / 2) * 0.85;
  const avgSamplesPerCol = span / width;
  const stride = Math.max(1, Math.floor(avgSamplesPerCol / 200));

  const top = [];
  const bottom = [];
  for (let col = 0; col < width; col++) {
    const t0 = col / width;
    const t1 = (col + 1) / width;
    const a = sourceStartFrame + t0 * span;
    const b = sourceStartFrame + t1 * span;
    const s0 = reverse ? sourceEndFrame - t1 * span : a;
    const s1 = reverse ? sourceEndFrame - t0 * span : b;
    const i0 = Math.max(0, Math.floor(Math.min(s0, s1)));
    const i1 = Math.min(samples.length - 1, Math.ceil(Math.max(s0, s1)));
    let lo = 1;
    let hi = -1;
    for (let i = i0; i <= i1; i += stride) {
      const v = samples[i];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    if (lo > hi) {
      lo = 0;
      hi = 0;
    }
    top.push([x0 + col, midY - hi * amp]);
    bottom.push([x0 + col, midY - lo * amp]);
  }

  ctx.beginPath();
  ctx.moveTo(top[0][0], top[0][1]);
  for (const p of top) ctx.lineTo(p[0], p[1]);
  for (let i = bottom.length - 1; i >= 0; i--) ctx.lineTo(bottom[i][0], bottom[i][1]);
  ctx.closePath();
  ctx.fillStyle = COLORS.clipWave;
  ctx.fill();
}

export function drawScore(canvas, { source, score, selectedClipIds, view, outputFrames, playheadFrame, dpr }) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, W, H);

  const rulerY = H - RULER_HEIGHT;
  const lh = laneHeight(H);

  for (const clip of score) {
    const x0 = frameToX(clip.outputStartFrame, view);
    const x1 = frameToX(clipOutputEnd(clip), view);
    if (x1 < 0 || x0 > W) continue;
    const yTop = clip.lane * lh + CLIP_MARGIN;
    const yBottom = (clip.lane + 1) * lh - CLIP_MARGIN;

    const roleColor = ROLE_COLORS[clip.role] || ROLE_COLORS.void;
    ctx.fillStyle = roleColor + "44";
    ctx.fillRect(x0, yTop, x1 - x0, yBottom - yTop);

    if (source) {
      drawClipWaveform(ctx, source.samples, clip.sourceStartFrame, clip.sourceEndFrame, clip.reverse, x0, x1, yTop, yBottom);
    }

    const selected = selectedClipIds.has(clip.id);
    ctx.strokeStyle = selected ? COLORS.clipBorderSelected : COLORS.clipBorder;
    ctx.lineWidth = selected ? Math.max(1.5, 1.5 * dpr) : Math.max(1, dpr);
    ctx.strokeRect(x0, yTop, x1 - x0, yBottom - yTop);

    if (x1 - x0 >= MIN_LABEL_WIDTH) {
      ctx.fillStyle = COLORS.rulerText;
      ctx.font = `${Math.round(9 * dpr)}px ui-monospace, monospace`;
      ctx.textBaseline = "top";
      const dir = clip.reverse ? "◀" : "▶";
      const label = clip.role ? `${clip.role[0].toUpperCase()} ${dir}` : `void ${dir}`;
      ctx.fillText(label, x0 + 3 * dpr, yTop + 2 * dpr);
    }
  }

  // Playhead
  if (playheadFrame !== null && playheadFrame !== undefined) {
    const x = frameToX(playheadFrame, view);
    if (x >= 0 && x <= W) {
      ctx.strokeStyle = COLORS.playhead;
      ctx.lineWidth = Math.max(1, dpr);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, rulerY);
      ctx.stroke();
    }
  }

  // Ruler
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, rulerY, W, RULER_HEIGHT);
  ctx.strokeStyle = COLORS.ruler;
  ctx.lineWidth = Math.max(1, dpr);
  ctx.beginPath();
  ctx.moveTo(0, rulerY + 0.5);
  ctx.lineTo(W, rulerY + 0.5);
  ctx.stroke();

  if (source) {
    const secondsPerPixel = view.framesPerPixel / source.sampleRate;
    const minPixelSpacing = 70 * dpr;
    const step = pickTickStepSeconds(secondsPerPixel, minPixelSpacing);
    const viewStartSec = view.viewStartFrame / source.sampleRate;
    const viewEndSec = (view.viewStartFrame + view.framesPerPixel * W) / source.sampleRate;
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

  // Buffer-end marker, so a clip clamped at the edge reads as intentional.
  const endX = frameToX(outputFrames, view);
  if (endX >= 0 && endX <= W) {
    ctx.strokeStyle = COLORS.ruler;
    ctx.lineWidth = Math.max(1, dpr);
    ctx.beginPath();
    ctx.moveTo(endX, 0);
    ctx.lineTo(endX, rulerY);
    ctx.stroke();
  }
}

// Nearest clip under a pointer, and which part of it (body vs an edge
// within trimHandlePx of the clip boundary).
export function hitTestClip(score, view, deviceX, deviceY, canvasHeight, trimHandlePx) {
  if (deviceY > canvasHeight - RULER_HEIGHT) return null;
  const lh = laneHeight(canvasHeight);
  const lane = laneAtY(deviceY, canvasHeight);
  for (let i = score.length - 1; i >= 0; i--) {
    const clip = score[i];
    if (clip.lane !== lane) continue;
    const x0 = frameToX(clip.outputStartFrame, view);
    const x1 = frameToX(clipOutputEnd(clip), view);
    if (deviceX < x0 || deviceX > x1) continue;
    // A clip narrower than both trim handles combined can't offer a real
    // edge grab without also making it impossible to just move the thing -
    // treat it as body-only until it's wide enough to tell the two apart.
    if (x1 - x0 > trimHandlePx * 2) {
      if (deviceX - x0 <= trimHandlePx) return { clip, part: "left" };
      if (x1 - deviceX <= trimHandlePx) return { clip, part: "right" };
    }
    return { clip, part: "body" };
  }
  return null;
}

// --- Link-curve overlay: connects a selected clip back to its source role,
// spanning from the bottom of the source canvas to the top of the score
// canvas. Drawn on a separate overlay canvas covering both zones. ---

const LINK_COLOR = "rgba(167, 139, 250, 0.7)";

export function drawLinkCurves(canvas, { events, score, selectedClipIds, sourceView, scoreView, sourceRect, scoreRect, overlayRect, dpr }) {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const sourceOriginX = (sourceRect.left - overlayRect.left) * dpr;
  const sourceBottomY = (sourceRect.bottom - overlayRect.top) * dpr;
  const scoreOriginX = (scoreRect.left - overlayRect.left) * dpr;
  const scoreTopY = (scoreRect.top - overlayRect.top) * dpr;

  for (const clip of score) {
    if (!selectedClipIds.has(clip.id) || !clip.eventId) continue;
    const event = events.find((e) => e.id === clip.eventId);
    if (!event) continue;

    const roleMidFrame = (event[roleFromKey(clip.role)] + event[roleToKey(clip.role)]) / 2;
    const sx = sourceOriginX + frameToX(roleMidFrame, sourceView);
    const clipMidFrame = (clip.outputStartFrame + clipOutputEnd(clip)) / 2;
    const scx = scoreOriginX + frameToX(clipMidFrame, scoreView);

    ctx.strokeStyle = LINK_COLOR;
    ctx.lineWidth = Math.max(1.5, 1.5 * dpr);
    ctx.beginPath();
    ctx.moveTo(sx, sourceBottomY);
    const midY = (sourceBottomY + scoreTopY) / 2;
    ctx.bezierCurveTo(sx, midY, scx, midY, scx, scoreTopY);
    ctx.stroke();

    ctx.fillStyle = LINK_COLOR;
    ctx.beginPath();
    ctx.arc(sx, sourceBottomY, 2.5 * dpr, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(scx, scoreTopY, 2.5 * dpr, 0, Math.PI * 2);
    ctx.fill();
  }
}

function roleFromKey(role) {
  return { foreshadow: "startFrame", excitation: "excitationFrame", body: "bodyFrame", resonance: "resonanceFrame" }[role] || "startFrame";
}
function roleToKey(role) {
  return { foreshadow: "excitationFrame", excitation: "bodyFrame", body: "resonanceFrame", resonance: "endFrame" }[role] || "endFrame";
}
