// App state and event wiring. State lives here; other modules read it
// through plain function calls and hooks, following the pattern used by the
// sibling tools (cloud-studio, sonogram-painter).

import { createTransport } from "./audio.js";
import { decodeWavFile, encodeWav, downloadBlob } from "./wav.js";
import {
  buildPeakPyramid,
  drawSourceWaveform,
  drawEnergyLane,
  clampView,
  fitFramesPerPixel,
  RULER_HEIGHT,
} from "./source-canvas.js";
import { initSourceInteraction, initScoreInteraction } from "./interaction.js";
import { analyzeEvents } from "./analysis.js";
import {
  mergeDetectedEvents,
  findEventAtFrame,
  getNeighborBounds,
  dragBoundary,
  createManualEventAt,
  normalizeEvent,
} from "./model.js";
import {
  normalizeClip,
  clampClipToOutput,
  moveClip,
  setClipLane,
  trimClipLeft,
  trimClipRight,
  toggleReverse,
  adjustGain,
  duplicateClip,
  reflowScoreForOutputFrames,
  generatePremonition,
  generateExplodedEvent,
  generateImpossibleMaterials,
} from "./score.js";
import { drawScore, drawLinkCurves } from "./score-canvas.js";
import { renderScore } from "./render.js";
import { mulberry32 } from "./rng.js";
import { toProjectJson, parseProjectJson, sourceMatchesProject } from "./project.js";

const state = {
  source: null, // { name, sampleRate, frames, samples, peakPyramid }
  sourceView: null, // { viewStartFrame, framesPerPixel }, device-pixel units
  selection: null, // { startFrame, endFrame } in source frames
  energy: null, // { values, frameStep }, set by onset analysis
  events: [], // event anatomy, from analysis and manual editing
  selectedEventIds: new Set(),
  sensitivity: 0.5,
  minGapSeconds: 0.08,
  score: [], // clip anatomy, from source drags and (later) generated transformations
  scoreView: null, // { viewStartFrame, framesPerPixel }, output-frame device-pixel units
  selectedClipIds: new Set(),
  outputDurationSeconds: 10,
  fadeMs: 5,
  activePane: "source", // "source" | "score" - which canvas last had focus, for Delete
  playingWhat: null, // "source" | "score" | null - which buffer the shared transport is on
  pendingProject: null, // a parsed project.json awaiting its matching source WAV
};

function outputTotalFrames() {
  const sampleRate = state.source ? state.source.sampleRate : 44100;
  return Math.round(state.outputDurationSeconds * sampleRate);
}

// Undo/redo covers document content (events, score clips) - not ephemeral
// UI state like selection, zoom, or playback.
const history = { past: [], future: [] };

function snapshotDocument() {
  return {
    events: state.events.map((e) => ({ ...e })),
    score: state.score.map((c) => ({ ...c })),
  };
}

// Every entry carries an intelligible label, so undo/redo can say what it's
// actually undoing/redoing rather than just moving through anonymous
// snapshots.
function pushHistory(label) {
  history.past.push({ label: label || "Edit", snapshot: snapshotDocument() });
  history.future = [];
  if (history.past.length > 200) history.past.shift();
}

function restoreSnapshot(snapshot) {
  state.events = snapshot.events;
  state.score = snapshot.score;
  state.selectedEventIds = new Set();
  state.selectedClipIds = new Set();
  updateUI();
  drawAll();
}

function undo() {
  if (!history.past.length) return;
  const entry = history.past.pop();
  history.future.push({ label: entry.label, snapshot: snapshotDocument() });
  restoreSnapshot(entry.snapshot);
  setStatus(`Undid: ${entry.label}`);
}

function redo() {
  if (!history.future.length) return;
  const entry = history.future.pop();
  history.past.push({ label: entry.label, snapshot: snapshotDocument() });
  restoreSnapshot(entry.snapshot);
  setStatus(`Redid: ${entry.label}`);
}

function isTypingTarget(target) {
  return !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
}

const el = {
  duration: document.getElementById("project-duration"),
  projectName: document.getElementById("project-name"),
  modeSelect: document.getElementById("mode-select"),
  modeEmpty: document.getElementById("mode-empty"),
  fieldsPremonition: document.getElementById("fields-premonition"),
  premonitionLead: document.getElementById("premonition-lead"),
  premonitionLeadValue: document.getElementById("premonition-lead-value"),
  premonitionProbability: document.getElementById("premonition-probability"),
  premonitionProbabilityValue: document.getElementById("premonition-probability-value"),
  premonitionTail: document.getElementById("premonition-tail"),
  premonitionFalseOmen: document.getElementById("premonition-false-omen"),
  premonitionFalseOmenValue: document.getElementById("premonition-false-omen-value"),
  premonitionSeed: document.getElementById("premonition-seed"),
  btnGeneratePremonition: document.getElementById("btn-generate-premonition"),
  fieldsExploded: document.getElementById("fields-exploded"),
  explodedRoleOrder: document.getElementById("exploded-role-order"),
  explodedRadius: document.getElementById("exploded-radius"),
  explodedRadiusValue: document.getElementById("exploded-radius-value"),
  explodedQuantizeEnabled: document.getElementById("exploded-quantize-enabled"),
  explodedGrid: document.getElementById("exploded-grid"),
  explodedGridValue: document.getElementById("exploded-grid-value"),
  explodedCollision: document.getElementById("exploded-collision"),
  explodedSeed: document.getElementById("exploded-seed"),
  btnGenerateExploded: document.getElementById("btn-generate-exploded"),
  fieldsImpossible: document.getElementById("fields-impossible"),
  impossibleRole: document.getElementById("impossible-role"),
  impossibleStrategy: document.getElementById("impossible-strategy"),
  impossibleSeed: document.getElementById("impossible-seed"),
  btnGenerateImpossible: document.getElementById("btn-generate-impossible"),
  causalityFieldPad: document.getElementById("causality-field-pad"),
  causalityFieldDot: document.getElementById("causality-field-dot"),
  sourceEmpty: document.getElementById("source-empty"),
  scoreEmpty: document.getElementById("score-empty"),
  sourceMeta: document.getElementById("source-meta"),
  btnFitSource: document.getElementById("btn-fit-source"),
  btnFitScore: document.getElementById("btn-fit-score"),
  linkCanvas: document.getElementById("link-canvas"),
  sensitivitySlider: document.getElementById("sensitivity-slider"),
  sensitivityValue: document.getElementById("sensitivity-value"),
  minGapSlider: document.getElementById("min-gap-slider"),
  minGapValue: document.getElementById("min-gap-value"),
  eventCount: document.getElementById("event-count"),
  sourceCanvas: document.getElementById("source-canvas"),
  energyCanvas: document.getElementById("energy-canvas"),
  scoreCanvas: document.getElementById("score-canvas"),
  status: document.getElementById("status"),
  timeReadout: document.getElementById("time-readout"),
  btnOpen: document.getElementById("btn-open"),
  btnPlaySource: document.getElementById("btn-play-source"),
  btnPlayScore: document.getElementById("btn-play-score"),
  btnStop: document.getElementById("btn-stop"),
  btnLoad: document.getElementById("btn-load"),
  btnSave: document.getElementById("btn-save"),
  btnExport: document.getElementById("btn-export"),
  fileWav: document.getElementById("file-wav"),
  fileProject: document.getElementById("file-project"),
};

const transport = createTransport();

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, "0")}`;
}

function setStatus(message, isError = false) {
  el.status.textContent = message;
  el.status.classList.toggle("status-error", isError);
}

function updateUI() {
  const loaded = state.source !== null;

  el.sourceEmpty.hidden = loaded;
  el.sourceMeta.hidden = !loaded;
  el.btnFitSource.hidden = !loaded;
  el.btnFitScore.hidden = !loaded;
  el.scoreEmpty.hidden = !loaded || state.score.length > 0;
  el.duration.disabled = !loaded;
  el.projectName.disabled = false;

  el.btnPlaySource.disabled = !loaded;
  el.btnStop.disabled = !loaded;
  el.sensitivitySlider.disabled = !loaded;
  el.minGapSlider.disabled = !loaded;

  // Gated on later implementation items, not just source presence:
  el.btnPlayScore.disabled = !loaded;
  el.modeSelect.disabled = !loaded;
  el.modeEmpty.hidden = loaded;
  el.fieldsPremonition.hidden = !loaded || el.modeSelect.value !== "premonition";
  el.fieldsExploded.hidden = !loaded || el.modeSelect.value !== "exploded";
  el.fieldsImpossible.hidden = !loaded || el.modeSelect.value !== "impossible";
  el.btnSave.disabled = !loaded;
  el.btnExport.disabled = !loaded;

  if (loaded) {
    const { name, sampleRate, frames } = state.source;
    el.sourceMeta.textContent = `${name} · ${sampleRate} Hz · ${formatTime(frames / sampleRate)}`;
    el.eventCount.textContent = `${state.events.length} event${state.events.length === 1 ? "" : "s"} detected`;
  } else {
    el.eventCount.textContent = "No source loaded.";
  }
  el.sensitivityValue.textContent = state.sensitivity.toFixed(2);
  el.minGapValue.textContent = `${Math.round(state.minGapSeconds * 1000)} ms`;
}

function fitCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function fitAllCanvases() {
  fitCanvas(el.sourceCanvas);
  fitCanvas(el.energyCanvas);
  fitCanvas(el.scoreCanvas);
  fitCanvas(el.linkCanvas);
}

function drawAll() {
  const dpr = window.devicePixelRatio || 1;
  if (state.source) {
    drawSourceWaveform(el.sourceCanvas, {
      source: state.source,
      view: state.sourceView,
      events: state.events,
      selectedEventIds: state.selectedEventIds,
      selection: state.selection,
      playheadFrame:
        transport.isPlaying() && state.playingWhat === "source" ? transport.currentTime() * state.source.sampleRate : null,
      dpr,
    });
    drawEnergyLane(el.energyCanvas, { energy: state.energy, view: state.sourceView, dpr });
    drawScore(el.scoreCanvas, {
      source: state.source,
      score: state.score,
      selectedClipIds: state.selectedClipIds,
      view: state.scoreView,
      outputFrames: outputTotalFrames(),
      playheadFrame:
        transport.isPlaying() && state.playingWhat === "score" ? transport.currentTime() * state.source.sampleRate : null,
      dpr,
    });
    drawLinkCurves(el.linkCanvas, {
      events: state.events,
      score: state.score,
      selectedClipIds: state.selectedClipIds,
      sourceView: state.sourceView,
      scoreView: state.scoreView,
      sourceRect: el.sourceCanvas.getBoundingClientRect(),
      scoreRect: el.scoreCanvas.getBoundingClientRect(),
      overlayRect: el.linkCanvas.getBoundingClientRect(),
      dpr,
    });
  } else {
    const ctx = el.sourceCanvas.getContext("2d");
    ctx.fillStyle = "#0a0d13";
    ctx.fillRect(0, 0, el.sourceCanvas.width, el.sourceCanvas.height);
    const ectx = el.energyCanvas.getContext("2d");
    ectx.fillStyle = "#10141c";
    ectx.fillRect(0, 0, el.energyCanvas.width, el.energyCanvas.height);
    const sctx = el.scoreCanvas.getContext("2d");
    sctx.fillStyle = "#0a0d13";
    sctx.fillRect(0, 0, el.scoreCanvas.width, el.scoreCanvas.height);
    el.linkCanvas.getContext("2d").clearRect(0, 0, el.linkCanvas.width, el.linkCanvas.height);
  }
}

function runAnalysis() {
  if (!state.source) return;
  const result = analyzeEvents(state.source, {
    sensitivity: state.sensitivity,
    minGapSeconds: state.minGapSeconds,
  });
  state.events = mergeDetectedEvents(state.events, result.events);
  state.energy = result.energy;
}

function fitSourceView() {
  if (!state.source) return;
  state.sourceView = {
    viewStartFrame: 0,
    framesPerPixel: fitFramesPerPixel(state.source.frames, el.sourceCanvas.width),
  };
}

function setView(rawView) {
  if (!state.source) return;
  state.sourceView = clampView(rawView, state.source.frames, el.sourceCanvas.width);
}

function setSelection(rawSelection) {
  if (!state.source || !rawSelection) {
    state.selection = null;
    return;
  }
  const total = state.source.frames;
  state.selection = {
    startFrame: Math.max(0, Math.min(total, rawSelection.startFrame)),
    endFrame: Math.max(0, Math.min(total, rawSelection.endFrame)),
  };
}

function selectEvents(ids, additive) {
  if (!additive) {
    state.selectedEventIds = new Set(ids);
    return;
  }
  const next = new Set(state.selectedEventIds);
  for (const id of ids) {
    if (next.has(id)) next.delete(id);
    else next.add(id);
  }
  state.selectedEventIds = next;
}

function getWaveHeight() {
  return el.sourceCanvas.height - RULER_HEIGHT;
}

function fitScoreView() {
  state.scoreView = {
    viewStartFrame: 0,
    framesPerPixel: fitFramesPerPixel(outputTotalFrames(), el.scoreCanvas.width),
  };
}

function setScoreView(rawView) {
  state.scoreView = clampView(rawView, outputTotalFrames(), el.scoreCanvas.width);
}

function selectClips(ids, additive) {
  if (!additive) {
    state.selectedClipIds = new Set(ids);
    return;
  }
  const next = new Set(state.selectedClipIds);
  for (const id of ids) {
    if (next.has(id)) next.delete(id);
    else next.add(id);
  }
  state.selectedClipIds = next;
}

function setActivePane(pane) {
  state.activePane = pane;
}

function isPointOverScore(clientX, clientY) {
  const rect = el.scoreCanvas.getBoundingClientRect();
  return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
}

function dropOnScore(payload, clientX, clientY) {
  if (!state.source || !payload) return;
  const rect = el.scoreCanvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const x = (clientX - rect.left) * dpr;
  const y = (clientY - rect.top) * dpr;
  const outputStartFrame = state.scoreView.viewStartFrame + x * state.scoreView.framesPerPixel;
  const lane = Math.max(0, Math.min(3, Math.floor(y / (el.scoreCanvas.height / 4))));

  const clip = normalizeClip(
    {
      eventId: payload.eventId,
      role: payload.role,
      sourceStartFrame: payload.sourceStartFrame,
      sourceEndFrame: payload.sourceEndFrame,
      outputStartFrame,
      lane,
      rate: 1,
      reverse: false,
      gain: 1,
    },
    state.source.frames
  );
  if (!clip) return; // degenerate interval, rejected at the model boundary

  pushHistory("Create clip from source");
  state.score = [...state.score, clampClipToOutput(clip, outputTotalFrames())];
  state.selectedClipIds = new Set([clip.id]);
  updateUI();
  drawAll();
}

function getScoreCanvasHeight() {
  return el.scoreCanvas.height;
}

function moveClipLive(clipId, newOutputStartFrame, lane) {
  const idx = state.score.findIndex((c) => c.id === clipId);
  if (idx === -1) return;
  let updated = moveClip(state.score[idx], newOutputStartFrame, outputTotalFrames());
  updated = setClipLane(updated, lane);
  const next = state.score.slice();
  next[idx] = updated;
  state.score = next;
}

function trimClipLive(clipId, part, rawFrame) {
  const idx = state.score.findIndex((c) => c.id === clipId);
  if (idx === -1) return;
  const clip = state.score[idx];
  const updated =
    part === "left" ? trimClipLeft(clip, rawFrame) : trimClipRight(clip, rawFrame, state.source.frames);
  const next = state.score.slice();
  next[idx] = clampClipToOutput(updated, outputTotalFrames());
  state.score = next;
}

function duplicateAndSelect(clipId) {
  const clip = state.score.find((c) => c.id === clipId);
  if (!clip) return clipId;
  const dup = duplicateClip(clip);
  state.score = [...state.score, dup];
  state.selectedClipIds = new Set([dup.id]);
  updateUI();
  return dup.id;
}

function deleteSelectedClips() {
  if (!state.selectedClipIds.size) return;
  pushHistory(`Delete ${state.selectedClipIds.size} clip${state.selectedClipIds.size === 1 ? "" : "s"}`);
  state.score = state.score.filter((c) => !state.selectedClipIds.has(c.id));
  state.selectedClipIds = new Set();
  updateUI();
  drawAll();
}

function reverseSelectedClips() {
  if (!state.selectedClipIds.size) return;
  pushHistory("Reverse clip");
  state.score = state.score.map((c) => (state.selectedClipIds.has(c.id) ? toggleReverse(c) : c));
  drawAll();
}

function adjustSelectedClipsGain(direction) {
  if (!state.selectedClipIds.size) return;
  pushHistory("Adjust clip gain");
  state.score = state.score.map((c) => (state.selectedClipIds.has(c.id) ? adjustGain(c, direction) : c));
  drawAll();
}

// The causality field is a macro: dragging it just writes into the same
// explicit controls the designer could set by hand (and their value labels
// update the same way), so nothing here is a hidden parameter - it's an
// alternate way to set visible ones. Mapping is mode-specific; axes match
// the field's own labels (x: before cause 0 -> after cause 1, y: fragmented
// 0 -> intact 1).
function setControlValue(el, value) {
  el.value = value;
  el.dispatchEvent(new Event("input"));
}

function applyCausalityField(x, y) {
  const mode = el.modeSelect.value;
  if (mode === "premonition") {
    setControlValue(el.premonitionLead, Math.round(400 - x * 380));
    setControlValue(el.premonitionFalseOmen, (Math.max(0, Math.min(1, 1 - y)) * 0.4).toFixed(2));
    el.premonitionTail.value = y < 0.33 ? "split" : y < 0.66 ? "reversed" : "forward";
  } else if (mode === "exploded") {
    setControlValue(el.explodedRadius, Math.round(300 - x * 300));
    if (y < 0.5) {
      el.explodedRoleOrder.value = "random";
      el.explodedCollision.value = "layer";
    } else {
      el.explodedRoleOrder.value = "reb";
      el.explodedCollision.value = "push-apart";
    }
  } else if (mode === "impossible") {
    const strategies = ["chronological", "similar-duration", "opposite-duration", "random"];
    el.impossibleStrategy.value = strategies[Math.min(3, Math.floor(x * 4))];
    const roles = ["resonance", "body", "excitation", "foreshadow"];
    el.impossibleRole.value = roles[Math.min(3, Math.floor(y * 4))];
  }
}

function runGeneratePremonition() {
  if (!state.source) return;
  const options = {
    leadTimeFrames: Math.round((Number(el.premonitionLead.value) / 1000) * state.source.sampleRate),
    probability: Number(el.premonitionProbability.value),
    tail: el.premonitionTail.value,
    falseOmenProbability: Number(el.premonitionFalseOmen.value),
  };
  const rng = mulberry32(Number(el.premonitionSeed.value) || 0);
  const generated = generatePremonition(state.events, state.selectedEventIds, options, rng, state.source.frames);
  const clamped = generated.map((c) => clampClipToOutput(c, outputTotalFrames()));

  pushHistory("Premonition");
  state.score = [...state.score, ...clamped];
  state.selectedClipIds = new Set(clamped.map((c) => c.id));
  setStatus(`Premonition: generated ${clamped.length} clip${clamped.length === 1 ? "" : "s"}.`);
  updateUI();
  drawAll();
}

const ROLE_ORDER_PRESETS = {
  reb: ["resonance", "excitation", "body"],
  febr: ["foreshadow", "excitation", "body", "resonance"],
};

function shuffled(array, rng) {
  const a = array.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function runGenerateExploded() {
  if (!state.source) return;
  const rng = mulberry32(Number(el.explodedSeed.value) || 0);
  const preset = el.explodedRoleOrder.value;
  const roleOrder = preset === "random" ? shuffled(["foreshadow", "excitation", "body", "resonance"], rng) : ROLE_ORDER_PRESETS[preset];

  const options = {
    roleOrder,
    radiusFrames: Math.round((Number(el.explodedRadius.value) / 1000) * state.source.sampleRate),
    quantizeFrames: el.explodedQuantizeEnabled.checked
      ? Math.round((Number(el.explodedGrid.value) / 1000) * state.source.sampleRate)
      : 0,
    collisionPolicy: el.explodedCollision.value,
  };
  const generated = generateExplodedEvent(state.events, state.selectedEventIds, options, rng, state.source.frames);
  const clamped = generated.map((c) => clampClipToOutput(c, outputTotalFrames()));

  pushHistory("Exploded Event");
  state.score = [...state.score, ...clamped];
  state.selectedClipIds = new Set(clamped.map((c) => c.id));
  setStatus(`Exploded Event: generated ${clamped.length} clip${clamped.length === 1 ? "" : "s"}.`);
  updateUI();
  drawAll();
}

function runGenerateImpossible() {
  if (!state.source) return;
  const rng = mulberry32(Number(el.impossibleSeed.value) || 0);
  const options = { role: el.impossibleRole.value, strategy: el.impossibleStrategy.value };
  const generated = generateImpossibleMaterials(state.events, state.selectedEventIds, options, rng, state.source.frames);
  const clamped = generated.map((c) => clampClipToOutput(c, outputTotalFrames()));

  pushHistory("Impossible Materials");
  state.score = [...state.score, ...clamped];
  state.selectedClipIds = new Set(clamped.map((c) => c.id));
  setStatus(`Impossible Materials: generated ${clamped.length} clip${clamped.length === 1 ? "" : "s"}.`);
  updateUI();
  drawAll();
}

function updateEventBoundary(eventId, boundaryKey, rawFrame) {
  const idx = state.events.findIndex((e) => e.id === eventId);
  if (idx === -1) return;
  const totalFrames = state.source.frames;
  const bounds = getNeighborBounds(state.events, eventId, totalFrames);
  const updated = dragBoundary(state.events[idx], boundaryKey, rawFrame, bounds, totalFrames);
  const next = state.events.slice();
  next[idx] = updated;
  state.events = next;
}

function createManualEventAtFrame(frame) {
  if (!state.source) return;
  const created = createManualEventAt(state.events, state.source.sampleRate, state.source.frames, frame);
  if (!created) return; // frame already belongs to an event
  pushHistory("Create manual event");
  state.events = [...state.events, created].sort((a, b) => a.startFrame - b.startFrame);
  state.selectedEventIds = new Set([created.id]);
  updateUI();
}

function deleteSelectedEvents() {
  const toDelete = state.events.filter((e) => state.selectedEventIds.has(e.id) && e.manual);
  if (!toDelete.length) return;
  pushHistory(`Delete ${toDelete.length} event${toDelete.length === 1 ? "" : "s"}`);
  const deleteIds = new Set(toDelete.map((e) => e.id));
  state.events = state.events.filter((e) => !deleteIds.has(e.id));
  state.selectedEventIds = new Set();
  updateUI();
  drawAll();
}

let playheadRaf = null;

function stepPlayhead() {
  if (!transport.isPlaying()) {
    playheadRaf = null;
    drawAll();
    return;
  }
  el.timeReadout.textContent = formatTime(transport.currentTime());
  drawAll();
  playheadRaf = requestAnimationFrame(stepPlayhead);
}

function playSource() {
  if (!state.source) return;
  state.playingWhat = "source";
  transport.play(state.source.samples, state.source.sampleRate, {
    onEnded: () => {
      state.playingWhat = null;
      el.timeReadout.textContent = formatTime(0);
    },
  });
  if (playheadRaf === null) playheadRaf = requestAnimationFrame(stepPlayhead);
}

function playScore() {
  if (!state.source) return;
  const buffer = renderScore({
    samples: state.source.samples,
    sampleRate: state.source.sampleRate,
    score: state.score,
    outputDurationSeconds: state.outputDurationSeconds,
    fadeMs: state.fadeMs,
  });
  state.playingWhat = "score";
  transport.play(buffer, state.source.sampleRate, {
    onEnded: () => {
      state.playingWhat = null;
      el.timeReadout.textContent = formatTime(0);
    },
  });
  if (playheadRaf === null) playheadRaf = requestAnimationFrame(stepPlayhead);
}

function stopPlayback() {
  transport.stop();
  state.playingWhat = null;
}

// Export renders through the exact same renderScore() call as Play Score,
// so what gets written to disk is what was auditioned - no separate export
// path to drift out of sync.
function exportWav() {
  if (!state.source) return;
  const buffer = renderScore({
    samples: state.source.samples,
    sampleRate: state.source.sampleRate,
    score: state.score,
    outputDurationSeconds: state.outputDurationSeconds,
    fadeMs: state.fadeMs,
  });
  const blob = encodeWav(buffer, state.source.sampleRate);
  const name = el.projectName.value || "untitled";
  downloadBlob(blob, `${name}.wav`);
  setStatus(`Exported "${name}.wav" (${state.outputDurationSeconds}s, ${state.source.sampleRate} Hz).`);
}

function applyProject(project) {
  state.events = project.events.map((e) => normalizeEvent(e, state.source.frames));
  state.score = project.score.map((c) => normalizeClip(c, state.source.frames)).filter(Boolean);
  state.selectedEventIds = new Set();
  state.selectedClipIds = new Set();
  history.past = [];
  history.future = [];

  const s = project.settings || {};
  if (typeof s.sensitivity === "number") state.sensitivity = s.sensitivity;
  if (typeof s.minGapSeconds === "number") state.minGapSeconds = s.minGapSeconds;
  if (typeof s.outputDurationSeconds === "number") state.outputDurationSeconds = s.outputDurationSeconds;
  if (typeof s.fadeMs === "number") state.fadeMs = s.fadeMs;

  el.sensitivitySlider.value = state.sensitivity;
  el.minGapSlider.value = Math.round(state.minGapSeconds * 1000);
  el.duration.value = state.outputDurationSeconds;
  if (typeof s.premonitionSeed === "number") el.premonitionSeed.value = s.premonitionSeed;
  if (typeof s.explodedSeed === "number") el.explodedSeed.value = s.explodedSeed;
  if (typeof s.impossibleSeed === "number") el.impossibleSeed.value = s.impossibleSeed;
  if (project.name) el.projectName.value = project.name;

  fitScoreView();
}

let loadingWav = false;

async function handleWavFile(file) {
  if (loadingWav) return; // ignore a re-entrant Open while a decode is already in flight
  loadingWav = true;
  el.btnOpen.disabled = true;
  setStatus(`Decoding "${file.name}"…`);
  try {
    const source = await decodeWavFile(file);
    source.peakPyramid = buildPeakPyramid(source.samples);
    state.source = source;
    state.selection = null;
    fitAllCanvases();
    fitSourceView();

    if (state.pendingProject) {
      const pending = state.pendingProject;
      state.pendingProject = null;
      if (sourceMatchesProject(source, pending)) {
        applyProject(pending);
        setStatus(`Loaded project "${pending.name}" with "${source.name}".`);
        return;
      }
      setStatus(
        `"${source.name}" doesn't match project "${pending.name}" ` +
          `(expected ${pending.source.sampleRate} Hz / ${pending.source.frames} frames, ` +
          `got ${source.sampleRate} Hz / ${source.frames} frames). Loaded as a new document instead.`,
        true
      );
    } else {
      setStatus(`Loaded "${source.name}".`);
    }

    state.events = [];
    state.selectedEventIds = new Set();
    state.score = [];
    state.selectedClipIds = new Set();
    history.past = [];
    history.future = [];
    fitScoreView();
    runAnalysis();
  } catch (err) {
    setStatus(err.message, true);
  } finally {
    loadingWav = false;
    el.btnOpen.disabled = false;
    updateUI();
    drawAll();
  }
}

function saveProject() {
  if (!state.source) return;
  const project = toProjectJson({
    source: state.source,
    events: state.events,
    score: state.score,
    sensitivity: state.sensitivity,
    minGapSeconds: state.minGapSeconds,
    outputDurationSeconds: state.outputDurationSeconds,
    fadeMs: state.fadeMs,
    premonitionSeed: Number(el.premonitionSeed.value) || 0,
    explodedSeed: Number(el.explodedSeed.value) || 0,
    impossibleSeed: Number(el.impossibleSeed.value) || 0,
    projectName: el.projectName.value,
  });
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
  downloadBlob(blob, `${el.projectName.value || "untitled"}.causal-reverser.json`);
  setStatus(`Saved project "${el.projectName.value || "untitled"}".`);
}

async function handleProjectFile(file) {
  try {
    const text = await file.text();
    const project = parseProjectJson(text);
    if (state.source && sourceMatchesProject(state.source, project)) {
      applyProject(project); // resets undo history, matching a fresh WAV load
      setStatus(`Loaded project "${project.name}".`);
    } else {
      state.pendingProject = project;
      setStatus(
        `Project "${project.name}" needs its source WAV "${project.source.name}" ` +
          `(${project.source.sampleRate} Hz, ${project.source.frames} frames). Use Open WAV to select it.`
      );
    }
  } catch (err) {
    setStatus(err.message, true);
  }
  updateUI();
  drawAll();
}

el.btnOpen.addEventListener("click", () => el.fileWav.click());
el.btnLoad.addEventListener("click", () => el.fileProject.click());
el.btnPlaySource.addEventListener("click", playSource);
el.btnPlayScore.addEventListener("click", playScore);
el.btnExport.addEventListener("click", exportWav);
el.btnStop.addEventListener("click", stopPlayback);
el.btnFitSource.addEventListener("click", () => {
  fitSourceView();
  drawAll();
});
el.btnFitScore.addEventListener("click", () => {
  fitScoreView();
  drawAll();
});

el.duration.addEventListener("change", () => {
  const seconds = Math.max(1, Math.min(300, Number(el.duration.value) || 10));
  el.duration.value = seconds;
  state.outputDurationSeconds = seconds;
  const reflowed = reflowScoreForOutputFrames(state.score, outputTotalFrames());
  if (JSON.stringify(reflowed) !== JSON.stringify(state.score)) pushHistory("Change output duration");
  state.score = reflowed;
  fitScoreView();
  updateUI();
  drawAll();
});

el.sensitivitySlider.addEventListener("input", () => {
  state.sensitivity = Number(el.sensitivitySlider.value);
  runAnalysis();
  updateUI();
  drawAll();
});

el.minGapSlider.addEventListener("input", () => {
  state.minGapSeconds = Number(el.minGapSlider.value) / 1000;
  runAnalysis();
  updateUI();
  drawAll();
});

el.fileWav.addEventListener("change", () => {
  const file = el.fileWav.files[0];
  el.fileWav.value = ""; // allow re-selecting the same file later
  if (file) handleWavFile(file);
});

el.fileProject.addEventListener("change", () => {
  const file = el.fileProject.files[0];
  el.fileProject.value = "";
  if (file) handleProjectFile(file);
});

el.btnSave.addEventListener("click", saveProject);

el.modeSelect.addEventListener("change", () => {
  updateUI();
});

el.premonitionLead.addEventListener("input", () => {
  el.premonitionLeadValue.textContent = `${el.premonitionLead.value} ms`;
});
el.premonitionProbability.addEventListener("input", () => {
  el.premonitionProbabilityValue.textContent = Number(el.premonitionProbability.value).toFixed(2);
});
el.premonitionFalseOmen.addEventListener("input", () => {
  el.premonitionFalseOmenValue.textContent = Number(el.premonitionFalseOmen.value).toFixed(2);
});
el.btnGeneratePremonition.addEventListener("click", runGeneratePremonition);

el.explodedRadius.addEventListener("input", () => {
  el.explodedRadiusValue.textContent = `${el.explodedRadius.value} ms`;
});
el.explodedGrid.addEventListener("input", () => {
  el.explodedGridValue.textContent = `${el.explodedGrid.value} ms`;
});
el.btnGenerateExploded.addEventListener("click", runGenerateExploded);
el.btnGenerateImpossible.addEventListener("click", runGenerateImpossible);

function moveCausalityDot(clientX, clientY) {
  const rect = el.causalityFieldPad.getBoundingClientRect();
  const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
  el.causalityFieldDot.hidden = false;
  el.causalityFieldDot.style.left = `${x * 100}%`;
  el.causalityFieldDot.style.top = `${y * 100}%`;
  applyCausalityField(x, y);
}

let draggingCausalityField = false;
el.causalityFieldPad.addEventListener("pointerdown", (e) => {
  if (!state.source || el.modeSelect.value === "manual") return;
  draggingCausalityField = true;
  el.causalityFieldPad.setPointerCapture(e.pointerId);
  moveCausalityDot(e.clientX, e.clientY);
});
el.causalityFieldPad.addEventListener("pointermove", (e) => {
  if (!draggingCausalityField) return;
  moveCausalityDot(e.clientX, e.clientY);
});
el.causalityFieldPad.addEventListener("pointerup", () => {
  draggingCausalityField = false;
});

initSourceInteraction(el.sourceCanvas, {
  getView: () => state.sourceView,
  setView,
  setSelection,
  getSelection: () => state.selection,
  onChange: drawAll,
  setActivePane,
  getEvents: () => state.events,
  getWaveHeight,
  findEventAtFrame: (frame) => findEventAtFrame(state.events, frame),
  getSelectedEventIds: () => state.selectedEventIds,
  selectEvents,
  beginGesture: () => pushHistory("Edit event boundary"),
  updateEventBoundary,
  createManualEventAtFrame,
  isPointOverScore,
  dropOnScore,
});

initScoreInteraction(el.scoreCanvas, {
  getView: () => state.scoreView,
  setView: setScoreView,
  onChange: drawAll,
  setActivePane,
  getClips: () => state.score,
  getCanvasHeight: getScoreCanvasHeight,
  getSelectedClipIds: () => state.selectedClipIds,
  selectClips,
  beginGesture: () => pushHistory("Edit clip"),
  moveClipLive,
  trimClipLive,
  duplicateAndSelect,
});

window.addEventListener("keydown", (e) => {
  if (isTypingTarget(e.target) || !state.source) return;
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === "z") {
    e.preventDefault();
    if (e.shiftKey) redo();
    else undo();
    return;
  }
  if (e.key === "Delete" || e.key === "Backspace") {
    e.preventDefault();
    if (state.activePane === "score") deleteSelectedClips();
    else deleteSelectedEvents();
    return;
  }
  if (state.activePane === "score") {
    if (e.key.toLowerCase() === "r") {
      e.preventDefault();
      reverseSelectedClips();
    } else if (e.key === "[") {
      e.preventDefault();
      adjustSelectedClipsGain(-1);
    } else if (e.key === "]") {
      e.preventDefault();
      adjustSelectedClipsGain(1);
    }
  }
});

const resizeObserver = new ResizeObserver(() => {
  fitAllCanvases();
  if (state.source) {
    state.sourceView = clampView(state.sourceView, state.source.frames, el.sourceCanvas.width);
    state.scoreView = clampView(state.scoreView, outputTotalFrames(), el.scoreCanvas.width);
  }
  drawAll();
});
resizeObserver.observe(document.querySelector(".source-zone"));
resizeObserver.observe(document.querySelector(".score-zone"));

fitAllCanvases();
updateUI();
drawAll();
