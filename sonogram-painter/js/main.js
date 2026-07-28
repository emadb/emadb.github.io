// App entry: state + event wiring.

import { initCanvas } from "./canvas.js";
import { imageToGrid, loadImageFile } from "./image.js";
import {
  COLUMNS_PER_SECOND,
  ROWS,
  adjustGrid,
  createGrid,
  resizeGrid,
  stampDefaultDocument,
} from "./grid.js";
import { isTextEntryTarget, isTypingTarget } from "./keys.js";
import { initPaint } from "./paint.js";
import { fileSlug, fromProjectJson, timeStamp, toProjectJson } from "./project.js";
import { initPlayback } from "./playback.js";
import { renderGrid, SAMPLE_RATE } from "./synth.js";
import { downloadBlob, encodeWav } from "./wav.js";

const state = {
  projectName: "untitled",
  durationSec: 10,
  grid: createGrid(10),
  tool: "brush",
  brush: { size: 8, softness: 0.5, intensity: 1 },
};

stampDefaultDocument(state.grid);

const canvasEl = document.getElementById("sp-canvas");
const canvas = initCanvas(canvasEl, () => state);

// --- undo/redo: whole-grid snapshots, pushed before every mutation ---

const UNDO_CAP = 30;
const undoStack = [];
const redoStack = [];

const snapshot = () => ({ cols: state.grid.cols, data: state.grid.data.slice() });

function pushUndo() {
  undoStack.push(snapshot());
  if (undoStack.length > UNDO_CAP) undoStack.shift();
  redoStack.length = 0;
}

// A snapshot's column count implies its duration, so undoing across a
// duration change restores the input field too.
function restore(snap) {
  state.grid = { cols: snap.cols, rows: ROWS, data: snap.data };
  state.durationSec = Math.round(snap.cols / COLUMNS_PER_SECOND);
  durationInput.value = String(state.durationSec);
  playback.stop();
  canvas.invalidateGrid();
}

function undo() {
  if (!undoStack.length) return;
  redoStack.push(snapshot());
  restore(undoStack.pop());
}

function redo() {
  if (!redoStack.length) return;
  undoStack.push(snapshot());
  restore(redoStack.pop());
}

window.addEventListener("keydown", (e) => {
  if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z" || isTextEntryTarget(e.target)) return;
  e.preventDefault();
  if (e.shiftKey) redo();
  else undo();
});

initPaint(canvasEl, canvas, () => state, { onStrokeStart: pushUndo });

// --- toolbar ---

const toolButtons = {
  brush: document.getElementById("tool-brush"),
  eraser: document.getElementById("tool-eraser"),
  line: document.getElementById("tool-line"),
};

function selectTool(tool) {
  state.tool = tool;
  for (const [name, btn] of Object.entries(toolButtons)) {
    btn.classList.toggle("active", name === tool);
  }
}

for (const [name, btn] of Object.entries(toolButtons)) {
  btn.addEventListener("click", () => selectTool(name));
}
selectTool("brush");

// Each slider drives one brush parameter and its value label.
function bindSlider(id, format, apply) {
  const input = document.getElementById(id);
  const label = document.getElementById(`${id}-value`);
  const update = () => {
    const v = Number(input.value);
    apply(v);
    label.textContent = format(v);
  };
  input.addEventListener("input", update);
  update();
}

bindSlider("brush-size", (v) => String(v), (v) => (state.brush.size = v));
bindSlider("brush-softness", (v) => v.toFixed(2), (v) => (state.brush.softness = v));
bindSlider("brush-intensity", (v) => v.toFixed(2), (v) => (state.brush.intensity = v));

// Keyboard shortcuts: B/E swap tool, [ and ] step the brush size — the
// bracket keys nudge the same slider a stroke would, so the displayed
// value and the cursor preview stay in sync for free.
const brushSizeInput = document.getElementById("brush-size");
function nudgeBrushSize(delta) {
  const min = Number(brushSizeInput.min);
  const max = Number(brushSizeInput.max);
  const next = Math.min(max, Math.max(min, Number(brushSizeInput.value) + delta));
  if (next === Number(brushSizeInput.value)) return;
  brushSizeInput.value = String(next);
  brushSizeInput.dispatchEvent(new Event("input", { bubbles: true }));
}

window.addEventListener("keydown", (e) => {
  if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
  switch (e.key) {
    case "b":
    case "B":
      selectTool("brush");
      break;
    case "e":
    case "E":
      selectTool("eraser");
      break;
    case "[":
      nudgeBrushSize(-1);
      break;
    case "]":
      nudgeBrushSize(1);
      break;
    default:
      return;
  }
  e.preventDefault();
});

// Gain/gamma preview live while a slider moves and commit destructively
// (undoable) on release, then snap back to neutral: they apply an
// adjustment, they don't hold a setting.
const gainInput = document.getElementById("adjust-gain");
const gammaInput = document.getElementById("adjust-gamma");
const gainLabel = document.getElementById("adjust-gain-value");
const gammaLabel = document.getElementById("adjust-gamma-value");

function previewAdjust() {
  gainLabel.textContent = Number(gainInput.value).toFixed(2);
  gammaLabel.textContent = Number(gammaInput.value).toFixed(2);
  canvas.setPreviewAdjust({ gain: Number(gainInput.value), gamma: Number(gammaInput.value) });
}

function commitAdjust() {
  const gain = Number(gainInput.value);
  const gamma = Number(gammaInput.value);
  if (gain !== 1 || gamma !== 1) {
    pushUndo();
    adjustGrid(state.grid, gain, gamma);
  }
  gainInput.value = "1";
  gammaInput.value = "1";
  gainLabel.textContent = "1.00";
  gammaLabel.textContent = "1.00";
  canvas.setPreviewAdjust(null);
  canvas.invalidateGrid();
}

for (const input of [gainInput, gammaInput]) {
  input.addEventListener("input", previewAdjust);
  input.addEventListener("change", commitAdjust);
}

// --- image import ---

// The last imported image is kept so gamma/invert can be re-applied to it;
// each application replaces the grid (undoable), then painting continues
// on top as normal content.
let lastImage = null;

const imgGammaInput = document.getElementById("img-gamma");
const imgGammaLabel = document.getElementById("img-gamma-value");
const imgInvertInput = document.getElementById("img-invert");

function applyImage() {
  if (!lastImage) return;
  pushUndo();
  imageToGrid(lastImage, state.grid, {
    gamma: Number(imgGammaInput.value),
    invert: imgInvertInput.checked,
  });
  canvas.invalidateGrid();
}

async function importImageFile(file) {
  try {
    lastImage = await loadImageFile(file);
    applyImage();
    status(`Imported ${file.name}`);
  } catch {
    status(`Cannot read ${file?.name ?? "file"} as an image`, true);
  }
}

imgGammaInput.addEventListener("input", () => {
  imgGammaLabel.textContent = Number(imgGammaInput.value).toFixed(2);
});
imgGammaInput.addEventListener("change", applyImage);
imgInvertInput.addEventListener("change", applyImage);

const imageInput = document.getElementById("file-image");
document.getElementById("btn-import").addEventListener("click", () => imageInput.click());
imageInput.addEventListener("change", () => {
  const file = imageInput.files?.[0];
  if (file) importImageFile(file);
  imageInput.value = "";
});

// Drop anywhere on the canvas zone; window-level guards stop the browser
// from navigating to the file when the drop misses.
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", (e) => e.preventDefault());
document.querySelector(".canvas-zone").addEventListener("drop", (e) => {
  e.preventDefault();
  const file = [...(e.dataTransfer?.files ?? [])].find((f) => f.type.startsWith("image/"));
  if (file) importImageFile(file);
});

const btnClear = document.getElementById("btn-clear");
btnClear.addEventListener("click", () => {
  pushUndo();
  state.grid.data.fill(0);
  canvas.invalidateGrid();
});

// --- project settings ---

const nameInput = document.getElementById("project-name");
nameInput.addEventListener("change", () => {
  state.projectName = nameInput.value.trim() || "untitled";
  nameInput.value = state.projectName;
});

const durationInput = document.getElementById("project-duration");
durationInput.addEventListener("change", () => {
  const v = Math.round(Number(durationInput.value));
  const next = Number.isFinite(v) ? Math.min(60, Math.max(1, v)) : 10;
  durationInput.value = String(next);
  if (next === state.durationSec) return;
  pushUndo();
  state.durationSec = next;
  state.grid = resizeGrid(state.grid, next);
  playback.stop();
  canvas.invalidateGrid();
});

// --- transport ---

const btnPlay = document.getElementById("btn-play");
const btnStop = document.getElementById("btn-stop");
const timeReadout = document.getElementById("time-readout");
const statusEl = document.getElementById("status");

let statusTimer = 0;
function status(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("status-error", isError);
  clearTimeout(statusTimer);
  if (message) statusTimer = setTimeout(() => status(""), 4000);
}

function formatTime(t) {
  const minutes = Math.floor(t / 60);
  const seconds = Math.floor(t % 60);
  const millis = Math.floor((t % 1) * 1000);
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

const playback = initPlayback({
  getGrid: () => state.grid,
  onTime(t) {
    timeReadout.textContent = formatTime(t);
    canvas.setPlayhead(t);
  },
  onStopped() {
    btnStop.disabled = true;
    timeReadout.textContent = formatTime(0);
    canvas.setPlayhead(null);
  },
});

// Lets the browser paint the "Rendering…" label before rendering blocks the thread.
const nextPaint = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

async function startPlayback() {
  if (btnPlay.disabled) return; // a render is already in flight
  btnPlay.disabled = true;
  btnPlay.textContent = "Rendering…";
  await nextPaint();
  try {
    await playback.play();
    btnStop.disabled = false;
  } finally {
    btnPlay.textContent = "Play";
    btnPlay.disabled = false;
  }
}

btnPlay.addEventListener("click", startPlayback);
btnStop.addEventListener("click", () => playback.stop());

window.addEventListener("keydown", (e) => {
  if (e.code !== "Space" || e.repeat || isTypingTarget(e.target)) return;
  // Also suppresses page scroll and the click a focused Play button would fire.
  e.preventDefault();
  if (playback.isPlaying()) playback.stop();
  else startPlayback();
});

// --- file actions ---

const btnSave = document.getElementById("btn-save");
btnSave.addEventListener("click", () => {
  const name = `${fileSlug(state.projectName)}.json`;
  downloadBlob(new Blob([toProjectJson(state)], { type: "application/json" }), name);
  status(`Saved ${name}`);
});

const btnOpen = document.getElementById("btn-open");
const fileOpenInput = document.getElementById("file-open");
btnOpen.addEventListener("click", () => fileOpenInput.click());
fileOpenInput.addEventListener("change", async () => {
  const file = fileOpenInput.files?.[0];
  fileOpenInput.value = "";
  if (!file) return;
  try {
    const loaded = await fromProjectJson(await file.text());
    pushUndo();
    playback.stop();
    state.projectName = loaded.name;
    state.durationSec = loaded.durationSec;
    state.grid = loaded.grid;
    nameInput.value = loaded.name;
    durationInput.value = String(loaded.durationSec);
    canvas.invalidateGrid();
    status(`Opened ${file.name}`);
  } catch (err) {
    status(err.message, true);
  }
});

const btnExport = document.getElementById("btn-export");
btnExport.addEventListener("click", async () => {
  btnExport.disabled = true;
  btnExport.textContent = "Rendering…";
  await nextPaint();
  try {
    const rendered = renderGrid(state.grid, {}, SAMPLE_RATE);
    const name = `sonogram-${fileSlug(state.projectName)}-${timeStamp()}.wav`;
    // Mono engine, stereo WAV: the same signal on both channels.
    downloadBlob(encodeWav(rendered.samples, rendered.samples, rendered.sampleRate), name);
    status(`Exported ${name}`);
  } finally {
    btnExport.textContent = "Export WAV";
    btnExport.disabled = false;
  }
});
