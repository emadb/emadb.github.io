// Time–frequency canvas: axes, cloud rects, grain dots, playhead.
// Clouds share one accent colour: they overlap freely, so hue can't carry
// identity (a validated categorical palette fails on all-pairs past three
// slots). Identity comes from the label inside each rect and from selection;
// overlapping translucent clouds brighten additively, which reads as density.

const MARGIN = { left: 54, right: 16, top: 16, bottom: 30 };
const F_MIN = 20;
const F_MAX = 20000;
export const FREQ_RANGE = { min: F_MIN, max: F_MAX };
const F_TICKS = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
const F_MAJOR = new Set([100, 1000, 10000]);
const TIME_STEPS = [0.1, 0.25, 0.5, 1, 2, 5, 10];

const COLOR = {
  gridMinor: "#1b2130",
  gridMajor: "#2a3242",
  axisText: "#8290a3",
  empty: "#3d4656",
  accent: "232, 180, 90",
};

const LOG_SPAN = Math.log(F_MAX / F_MIN);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function formatFreq(f) {
  return f >= 1000 ? `${f / 1000}k` : String(f);
}

function timeStep(duration) {
  const target = duration / 10;
  return TIME_STEPS.find((s) => s >= target) ?? Math.ceil(target);
}

export function initCanvas(canvasEl, getState) {
  const ctx = canvasEl.getContext("2d");
  let plot = { x: 0, y: 0, w: 0, h: 0 };
  let playhead = null; // seconds, or null when stopped
  let grains = null; // last render's scatter, or null when stale

  const duration = () => Math.max(0.001, getState().durationSec || 1);
  const timeToX = (t) => plot.x + (t / duration()) * plot.w;
  const xToTime = (x) => ((x - plot.x) / plot.w) * duration();
  const freqToY = (f) =>
    plot.y + plot.h * (1 - Math.log(clamp(f, F_MIN, F_MAX) / F_MIN) / LOG_SPAN);
  const yToFreq = (y) =>
    F_MIN * Math.exp((1 - clamp((y - plot.y) / plot.h, 0, 1)) * LOG_SPAN);

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

  function cloudRect(cloud) {
    const x1 = timeToX(Math.min(cloud.timeStart, cloud.timeEnd));
    const x2 = timeToX(Math.max(cloud.timeStart, cloud.timeEnd));
    const y1 = freqToY(Math.max(cloud.freqLow, cloud.freqHigh));
    const y2 = freqToY(Math.min(cloud.freqLow, cloud.freqHigh));
    return { x: x1, y: y1, w: Math.max(1, x2 - x1), h: Math.max(1, y2 - y1) };
  }

  function drawCloud(cloud, index, selected) {
    const r = cloudRect(cloud);
    const dim = cloud.muted ? 0.35 : 1;

    ctx.fillStyle = `rgba(${COLOR.accent}, ${(selected ? 0.16 : 0.09) * dim})`;
    ctx.fillRect(r.x, r.y, r.w, r.h);

    ctx.setLineDash(cloud.muted ? [4, 3] : []);
    ctx.lineWidth = selected ? 2 : 1;
    ctx.strokeStyle = `rgba(${COLOR.accent}, ${(selected ? 0.95 : 0.45) * dim})`;
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    ctx.setLineDash([]);

    if (r.w > 74 && r.h > 20) {
      ctx.font = "10px 'IBM Plex Mono', monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillStyle = `rgba(${COLOR.accent}, ${0.85 * dim})`;
      ctx.fillText(`${index + 1} · ${cloud.waveform}`, r.x + 7, r.y + 6);
    }

    if (selected) {
      ctx.fillStyle = `rgb(${COLOR.accent})`;
      for (const [hx, hy] of [
        [r.x, r.y],
        [r.x + r.w, r.y],
        [r.x, r.y + r.h],
        [r.x + r.w, r.y + r.h],
      ]) {
        ctx.fillRect(hx - 3, hy - 3, 6, 6);
      }
    }
  }

  // Each grain is drawn the width of its own duration, so a cloud of 6 ms
  // grains and one of 100 ms grains look as different as they sound. A glisson
  // sweeps from f to f2, so its mark is a tilted stroke.
  function drawGrains() {
    if (!grains?.length) return;
    const pxPerSec = plot.w / duration();

    ctx.save();
    ctx.beginPath();
    ctx.rect(plot.x, plot.y, plot.w, plot.h);
    ctx.clip();
    ctx.strokeStyle = `rgba(${COLOR.accent}, 0.5)`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (const g of grains) {
      const x0 = timeToX(g.t);
      ctx.moveTo(x0, freqToY(g.f));
      ctx.lineTo(Math.max(x0 + 1.5, x0 + g.dur * pxPerSec), freqToY(g.f2 ?? g.f));
    }
    ctx.stroke();
    ctx.restore();
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

    drawGrid();

    const state = getState();
    state.clouds.forEach((cloud, i) => drawCloud(cloud, i, cloud.id === state.selectedId));
    drawGrains();

    if (playhead !== null) {
      const x = Math.round(timeToX(playhead)) + 0.5;
      ctx.strokeStyle = `rgb(${COLOR.accent})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, plot.y);
      ctx.lineTo(x, plot.y + plot.h);
      ctx.stroke();
    }

    if (state.clouds.length === 0) {
      ctx.fillStyle = COLOR.empty;
      ctx.font = "13px 'IBM Plex Mono', monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("drag to paint a cloud", plot.x + plot.w / 2, plot.y + plot.h / 2);
    }
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

  // Passing null marks the scatter stale — an edited cloud's old grains would
  // otherwise sit in the wrong place until the next render.
  function setGrains(next) {
    grains = next;
    draw();
  }

  return {
    draw,
    setPlayhead,
    setGrains,
    timeToX,
    xToTime,
    freqToY,
    yToFreq,
    cloudRect,
    getPlot: () => plot,
  };
}
