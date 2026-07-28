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

// Amplitude → light. A display-only gamma lifts faint cells into
// visibility; the ramp runs black → warm gold → white so a partial at
// full amplitude glows hot.
const GOLD = [242, 196, 100];
const KNEE = 0.75;

function writeAmpPixel(px, at, v) {
  const t = Math.pow(clamp(v, 0, 1), 0.7);
  let r, g, b;
  if (t <= KNEE) {
    const u = t / KNEE;
    r = GOLD[0] * u;
    g = GOLD[1] * u;
    b = GOLD[2] * u;
  } else {
    const u = (t - KNEE) / (1 - KNEE);
    r = GOLD[0] + (255 - GOLD[0]) * u;
    g = GOLD[1] + (255 - GOLD[1]) * u;
    b = GOLD[2] + (255 - GOLD[2]) * u;
  }
  px[at] = r;
  px[at + 1] = g;
  px[at + 2] = b;
  px[at + 3] = 255;
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

  function rebuildGridImage(grid) {
    off.width = grid.cols;
    off.height = grid.rows;
    const img = offCtx.createImageData(grid.cols, grid.rows);
    const px = img.data;
    gridEmpty = true;
    for (let row = 0; row < grid.rows; row++) {
      const y = grid.rows - 1 - row; // row 0 (lowest band) at the bottom
      const rowBase = row * grid.cols;
      const pxBase = y * grid.cols * 4;
      for (let col = 0; col < grid.cols; col++) {
        let v = grid.data[rowBase + col];
        if (v > 0 && previewAdjust) {
          v = Math.min(1, previewAdjust.gain * Math.pow(v, previewAdjust.gamma));
        }
        if (v > 0) {
          gridEmpty = false;
          writeAmpPixel(px, pxBase + col * 4, v);
        } else {
          px[pxBase + col * 4 + 3] = 255;
        }
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

    const { grid } = getState();
    if (grid) {
      if (gridDirty) rebuildGridImage(grid);
      // Nearest-neighbour scaling: crisp cells are part of the instrument.
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(off, plot.x, plot.y, plot.w, plot.h);
    }

    drawGrid();

    // Straight-line preview: the committed stroke will run center to center.
    if (linePreview && grid) {
      const toXY = (c) => [
        plot.x + (c.col / grid.cols) * plot.w,
        plot.y + (1 - c.row / grid.rows) * plot.h,
      ];
      ctx.save();
      ctx.beginPath();
      ctx.rect(plot.x, plot.y, plot.w, plot.h);
      ctx.clip();
      ctx.beginPath();
      ctx.moveTo(...toXY(linePreview.from));
      ctx.lineTo(...toXY(linePreview.to));
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = "rgba(242, 196, 100, 0.8)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // Brush outline: an ellipse, because grid cells aren't square on screen.
    if (cursor && grid) {
      const cw = plot.w / grid.cols;
      const ch = plot.h / grid.rows;
      ctx.save();
      ctx.beginPath();
      ctx.rect(plot.x, plot.y, plot.w, plot.h);
      ctx.clip();
      ctx.beginPath();
      ctx.ellipse(
        plot.x + cursor.colF * cw,
        plot.y + (grid.rows - cursor.rowF) * ch,
        cursor.radius * cw,
        cursor.radius * ch,
        0,
        0,
        Math.PI * 2,
      );
      ctx.strokeStyle = cursor.erase ? "rgba(224, 113, 106, 0.9)" : "rgba(242, 196, 100, 0.9)";
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

    if (!grid || gridEmpty) {
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
