// App state and event wiring. State lives here; other modules read it through
// an accessor and change it through `actions`.

import { initCanvas } from "./canvas.js";
import { initInspector } from "./inspector.js";
import { initInteraction } from "./interaction.js";
import { isTypingTarget } from "./keys.js";
import { initPlayback } from "./playback.js";
import { fileSlug, fromProjectJson, timeStamp, toProjectJson } from "./project.js";
import { defaultCloud, normalizeCloud, renderProject } from "./synth.js";
import { encodeWav, downloadBlob } from "./wav.js";

// A sparse low cloud and a dense high one, so the first press of Play already
// sounds like something rather than silence.
function defaultProject() {
  return {
    name: "untitled",
    durationSec: 10,
    clouds: [
      defaultCloud({
        timeStart: 0,
        timeEnd: 8,
        freqLow: 60,
        freqHigh: 240,
        density: 11,
        durMinMs: 45,
        durMaxMs: 100,
        envelope: "gaussian",
        waveform: "sine",
        gainDb: -8,
        scatter: 0.45,
        fadeIn: 0.12,
        fadeOut: 0.35,
        seed: 101,
      }),
      defaultCloud({
        timeStart: 1.5,
        timeEnd: 10,
        freqLow: 1200,
        freqHigh: 6500,
        density: 95,
        durMinMs: 7,
        durMaxMs: 26,
        envelope: "expodec",
        waveform: "sine",
        gainDb: -15,
        scatter: 0.85,
        fadeIn: 0.25,
        fadeOut: 0.3,
        seed: 202,
      }),
    ],
  };
}

export const state = { ...defaultProject(), selectedId: null };

const canvasEl = document.getElementById("tf-canvas");
export const canvas = initCanvas(canvasEl, () => state);

// Anything that changes what the project sounds like invalidates the drawn
// grain scatter; selection alone does not.
function refresh({ grainsStale = false } = {}) {
  if (grainsStale) canvas.setGrains(null);
  else canvas.draw();
  inspector.update();
}

const actions = {
  select(id) {
    state.selectedId = id;
    refresh();
  },
  add(cloud) {
    Object.assign(cloud, normalizeCloud(cloud, state.durationSec));
    state.clouds.push(cloud);
    state.selectedId = cloud.id;
    refresh({ grainsStale: true });
  },
  remove(id) {
    state.clouds = state.clouds.filter((c) => c.id !== id);
    if (state.selectedId === id) state.selectedId = null;
    refresh({ grainsStale: true });
  },
  patch(id, changes) {
    const cloud = state.clouds.find((c) => c.id === id);
    if (!cloud) return;
    Object.assign(cloud, changes);
    // One guard for every edit path, whether a dragged edge or a typed value.
    Object.assign(cloud, normalizeCloud(cloud, state.durationSec));
    refresh({ grainsStale: true });
  },
};

const inspector = initInspector(document.querySelector(".inspector"), () => state, actions);
initInteraction(canvasEl, canvas, () => state, actions);

// --- transport ---

const btnPlay = document.getElementById("btn-play");
const btnStop = document.getElementById("btn-stop");
const timeReadout = document.getElementById("time-readout");
const statusEl = document.getElementById("status");

const project = () => ({ durationSec: state.durationSec, clouds: state.clouds });

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
  getProject: project,
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
    const rendered = await playback.play();
    canvas.setGrains(rendered.grains);
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

// --- project settings ---

const nameInput = document.getElementById("project-name");
nameInput.value = state.name;
nameInput.addEventListener("change", () => {
  state.name = nameInput.value.trim() || "untitled";
  nameInput.value = state.name;
});

const durationInput = document.getElementById("project-duration");
durationInput.value = state.durationSec;
durationInput.addEventListener("change", () => {
  const v = Number(durationInput.value);
  if (Number.isFinite(v) && v >= 1 && v <= 60) {
    state.durationSec = v;
  } else {
    durationInput.value = state.durationSec;
  }
  refresh({ grainsStale: true });
});

// --- file actions ---

const btnExport = document.getElementById("btn-export");
const btnSave = document.getElementById("btn-save");
const btnOpen = document.getElementById("btn-open");
const fileInput = document.getElementById("file-open");

btnExport.addEventListener("click", async () => {
  btnExport.disabled = true;
  btnExport.textContent = "Rendering…";
  await nextPaint();
  try {
    const rendered = renderProject(project());
    canvas.setGrains(rendered.grains);
    const name = `${fileSlug(state.name)}-${timeStamp()}.wav`;
    downloadBlob(encodeWav(rendered.left, rendered.right, rendered.sampleRate), name);
    status(`Exported ${name}`);
  } finally {
    btnExport.textContent = "Export WAV";
    btnExport.disabled = false;
  }
});

btnSave.addEventListener("click", () => {
  const name = `${fileSlug(state.name)}.json`;
  downloadBlob(new Blob([toProjectJson(state)], { type: "application/json" }), name);
  status(`Saved ${name}`);
});

btnOpen.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  fileInput.value = ""; // so re-opening the same file still fires a change
  if (!file) return;
  try {
    const loaded = fromProjectJson(await file.text());
    Object.assign(state, loaded, { selectedId: null });
    nameInput.value = state.name;
    durationInput.value = state.durationSec;
    playback.stop();
    refresh({ grainsStale: true });
    status(`Opened ${file.name}`);
  } catch (err) {
    status(err.message, true);
  }
});

refresh();
