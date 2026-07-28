// Spectrogram canvas: the grid rendered as light on a pure black
// time–frequency plane, axes in the gutters, HiDPI-correct. Grid rows are
// uniform in log frequency and the y axis is log, so the offscreen image
// stretches linearly onto the plot with exact row ↔ pixel alignment.

import { F_MIN, F_TOP } from "./grid.js";

const MARGIN = { left: 54, right: 16, top: 16, bottom: 30 };
export const FREQ_RANGE = { min: F_MIN, max: F_TOP };
const F_TICKS = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
const F_MAJOR = new Set([100, 1000, 10000]);
const TIME_STEPS = [0.1, 0.25, 0.5, 1, 2, 5, 10];

const COLOR = {
  gridMinor: "rgba(200, 208, 220, 0.07)",
  gridMajor: "rgba(200, 208, 220, 0.16)",
  axisText: "#8290a3",
  empty: "#3d4656",
};

const LOG_SPAN = Math.log(F_TOP / F_MIN);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function formatFreq(f) {
  return f >= 1000 ? `${f / 1000}k` : String(f);
}

function timeStep(duration) {
  const target = duration / 10;
  return TIME_STEPS.find((s) => s >= target) ?? Math.ceil(target);
}

// Amplitude → light, one ramp per palette material: black → hue → white,
// so a cell at full amplitude glows hot regardless of which grid it's on.
// Tonal (Sine + Harmonic) stays the original warm gold; Noise gets a cool
// teal — the palette becomes visible in the picture itself. Overlapping
// content from both grids adds channel-by-channel (clamped), the same
// "brightens where it overlaps" idea Cloud Studio uses for its clouds.
export const TONAL_COLOR = [242, 196, 100];
export const NOISE_COLOR = [80, 210, 220];
const KNEE = 0.75;

function addAmpColor(rgb, v, hue) {
  const t = Math.pow(clamp(v, 0, 1), 0.7);
  if (t <= KNEE) {
    const u = t / KNEE;
    rgb[0] += hue[0] * u;
    rgb[1] += hue[1] * u;
    rgb[2] += hue[2] * u;
  } else {
    const u = (t - KNEE) / (1 - KNEE);
    rgb[0] += hue[0] + (255 - hue[0]) * u;
    rgb[1] += hue[1] + (255 - hue[1]) * u;
    rgb[2] += hue[2] + (255 - hue[2]) * u;
  }
}

export function initCanvas(canvasEl, getState) {
  const ctx = canvasEl.getContext("2d");
  let plot = { x: 0, y: 0, w: 0, h: 0 };
  let playhead = null; // seconds, or null when stopped
  let cursor = null; // { rowF, colF, radius, erase } in cell space, or null
  let linePreview = null; // { from, to } in cell space while shift/line-dragging
  let previewAdjust = null; // { gain, gamma } while an adjust slider is held

  // Offscreen grid image, one pixel per cell, rebuilt only when the grid
  // is marked dirty — draw() itself stays cheap for resize and playhead.
  const off = document.createElement("canvas");
  const offCtx = off.getContext("2d");
  let gridDirty = true;
  let gridEmpty = true;

  const duration = () => Math.max(0.001, getState().durationSec || 1);
  const timeToX = (t) => plot.x + (t / duration()) * plot.w;
  const xToTime = (x) => ((x - plot.x) / plot.w) * duration();
  const freqToY = (f) =>
    plot.y + plot.h * (1 - Math.log(clamp(f, F_MIN, F_TOP) / F_MIN) / LOG_SPAN);
  const yToFreq = (y) =>
    F_MIN * Math.exp((1 - clamp((y - plot.y) / plot.h, 0, 1)) * LOG_SPAN);

  // previewAdjust reshapes the combined picture: both grids, same formula
  // the destructive commit applies, so the preview looks exactly like the
  // commit will.
  function rebuildGridImage(tonalGrid, noiseGrid) {
    const { cols, rows } = tonalGrid;
    off.width = cols;
    off.height = rows;
    const img = offCtx.createImageData(cols, rows);
    const px = img.data;
    gridEmpty = true;
    for (let row = 0; row < rows; row++) {
      const y = rows - 1 - row; // row 0 (lowest band) at the bottom
      const rowBase = row * cols;
      const pxBase = y * cols * 4;
      for (let col = 0; col < cols; col++) {
        let vTonal = tonalGrid.data[rowBase + col];
        if (vTonal > 0 && previewAdjust) {
          vTonal = Math.min(1, previewAdjust.gain * Math.pow(vTonal, previewAdjust.gamma));
        }
        let vNoise = noiseGrid.data[rowBase + col];
        if (vNoise > 0 && previewAdjust) {
          vNoise = Math.min(1, previewAdjust.gain * Math.pow(vNoise, previewAdjust.gamma));
        }

        const at = pxBase + col * 4;
        if (vTonal > 0 || vNoise > 0) {
          gridEmpty = false;
          const rgb = [0, 0, 0];
          if (vTonal > 0) addAmpColor(rgb, vTonal, TONAL_COLOR);
          if (vNoise > 0) addAmpColor(rgb, vNoise, NOISE_COLOR);
          px[at] = Math.min(255, rgb[0]);
          px[at + 1] = Math.min(255, rgb[1]);
          px[at + 2] = Math.min(255, rgb[2]);
        }
        px[at + 3] = 255;
      }
    }
    offCtx.putImageData(img, 0, 0);
    gridDirty = false;
  }

  function drawGrid() {
    ctx.lineWidth = 1;
    ctx.font = "10px 'IBM Plex Mono', monospace";
    ctx.fillStyle = COLOR.axisText;

    // frequency: log axis, labelled on a 1–2–5 sequence
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (const f of F_TICKS) {
      const y = Math.round(freqToY(f)) + 0.5;
      ctx.strokeStyle = F_MAJOR.has(f) ? COLOR.gridMajor : COLOR.gridMinor;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
      ctx.fillText(formatFreq(f), plot.x - 8, y);
    }

    // time: linear axis
    const step = timeStep(duration());
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (let t = 0; t <= duration() + 1e-9; t += step) {
      const x = Math.round(timeToX(t)) + 0.5;
      ctx.strokeStyle = t === 0 ? COLOR.gridMajor : COLOR.gridMinor;
      ctx.beginPath();
      ctx.moveTo(x, plot.y);
      ctx.lineTo(x, plot.y + plot.h);
      ctx.stroke();
      ctx.fillText(step < 1 ? t.toFixed(1) : String(Math.round(t)), x, plot.y + plot.h + 8);
    }

    // Units live in the left gutter: past the last time tick they collide with it.
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.fillText("Hz", plot.x - 8, plot.y - 4);
    ctx.textBaseline = "top";
    ctx.fillText("s", plot.x - 8, plot.y + plot.h + 8);

    ctx.strokeStyle = COLOR.gridMajor;
    ctx.strokeRect(plot.x + 0.5, plot.y + 0.5, plot.w - 1, plot.h - 1);
  }

  function draw() {
    const w = canvasEl.clientWidth;
    const h = canvasEl.clientHeight;
    ctx.clearRect(0, 0, w, h);

    plot = {
      x: MARGIN.left,
      y: MARGIN.top,
      w: Math.max(1, w - MARGIN.left - MARGIN.right),
      h: Math.max(1, h - MARGIN.top - MARGIN.bottom),
    };

    const { tonalGrid, noiseGrid } = getState();
    if (tonalGrid && noiseGrid) {
      if (gridDirty) rebuildGridImage(tonalGrid, noiseGrid);
      // Nearest-neighbour scaling: crisp cells are part of the instrument.
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(off, plot.x, plot.y, plot.w, plot.h);
    }

    drawGrid();

    // Straight-line preview: the committed stroke will run center to center.
    if (linePreview && tonalGrid) {
      const toXY = (c) => [
        plot.x + (c.col / tonalGrid.cols) * plot.w,
        plot.y + (1 - c.row / tonalGrid.rows) * plot.h,
      ];
      ctx.save();
      ctx.beginPath();
      ctx.rect(plot.x, plot.y, plot.w, plot.h);
      ctx.clip();
      ctx.beginPath();
      ctx.moveTo(...toXY(linePreview.from));
      ctx.lineTo(...toXY(linePreview.to));
      ctx.setLineDash([5, 4]);
      const lineHue = linePreview.material === "noise" ? NOISE_COLOR : TONAL_COLOR;
      ctx.strokeStyle = `rgba(${lineHue.join(", ")}, 0.8)`;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // Brush outline: an ellipse, because grid cells aren't square on screen.
    if (cursor && tonalGrid) {
      const cw = plot.w / tonalGrid.cols;
      const ch = plot.h / tonalGrid.rows;
      ctx.save();
      ctx.beginPath();
      ctx.rect(plot.x, plot.y, plot.w, plot.h);
      ctx.clip();
      ctx.beginPath();
      ctx.ellipse(
        plot.x + cursor.colF * cw,
        plot.y + (tonalGrid.rows - cursor.rowF) * ch,
        cursor.radius * cw,
        cursor.radius * ch,
        0,
        0,
        Math.PI * 2,
      );
      const cursorHue = cursor.material === "noise" ? NOISE_COLOR : TONAL_COLOR;
      ctx.strokeStyle = cursor.erase ? "rgba(224, 113, 106, 0.9)" : `rgba(${cursorHue.join(", ")}, 0.9)`;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }

    if (playhead !== null) {
      const x = Math.round(timeToX(playhead)) + 0.5;
      ctx.strokeStyle = "#f2c464";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, plot.y);
      ctx.lineTo(x, plot.y + plot.h);
      ctx.stroke();
    }

    if (!tonalGrid || gridEmpty) {
      ctx.fillStyle = COLOR.empty;
      ctx.font = "13px 'IBM Plex Mono', monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("paint sound as light", plot.x + plot.w / 2, plot.y + plot.h / 2);
    }
  }

  // Call after any grid mutation (or grid replacement): rebuilds the
  // offscreen image on the next draw.
  function invalidateGrid() {
    gridDirty = true;
    draw();
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvasEl.width = Math.round(canvasEl.clientWidth * dpr);
    canvasEl.height = Math.round(canvasEl.clientHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  new ResizeObserver(resize).observe(canvasEl);
  resize();

  function setPlayhead(t) {
    playhead = t;
    draw();
  }

  function setCursor(next) {
    cursor = next;
    draw();
  }

  function setLinePreview(next) {
    linePreview = next;
    draw();
  }

  // Non-destructive gain/gamma display preview; pass null when the
  // adjustment is committed (or abandoned).
  function setPreviewAdjust(next) {
    previewAdjust = next;
    gridDirty = true;
    draw();
  }

  return {
    draw,
    invalidateGrid,
    setPlayhead,
    setCursor,
    setLinePreview,
    setPreviewAdjust,
    timeToX,
    xToTime,
    freqToY,
    yToFreq,
    getPlot: () => plot,
  };
}
