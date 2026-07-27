// Pointer and keyboard editing on the canvas: paint, select, move, resize,
// delete. This module never mutates state directly — it reports intent through
// the `actions` object that main.js owns.

import { FREQ_RANGE } from "./canvas.js";
import { isTypingTarget } from "./keys.js";
import { defaultCloud } from "./synth.js";

const EDGE_TOL = 6; // px within which an edge is grabbable
const MIN_DRAG_PX = 4; // below this a drag counts as a click, not a new cloud
const MIN_TIME = 0.01; // s
const MIN_RATIO = 1.02; // narrowest frequency band, as a ratio

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function initInteraction(canvasEl, canvas, getState, actions) {
  let drag = null;

  const pointerPos = (e) => {
    const r = canvasEl.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const inPlot = (p) => {
    const q = canvas.getPlot();
    return p.x >= q.x && p.x <= q.x + q.w && p.y >= q.y && p.y <= q.y + q.h;
  };

  function edgesAt(cloud, p) {
    const r = canvas.cloudRect(cloud);
    const inX = p.x >= r.x - EDGE_TOL && p.x <= r.x + r.w + EDGE_TOL;
    const inY = p.y >= r.y - EDGE_TOL && p.y <= r.y + r.h + EDGE_TOL;
    if (!inX || !inY) return null;
    const e = {
      l: Math.abs(p.x - r.x) <= EDGE_TOL,
      r: Math.abs(p.x - (r.x + r.w)) <= EDGE_TOL,
      t: Math.abs(p.y - r.y) <= EDGE_TOL,
      b: Math.abs(p.y - (r.y + r.h)) <= EDGE_TOL,
    };
    return e.l || e.r || e.t || e.b ? e : null;
  }

  function inBody(cloud, p) {
    const r = canvas.cloudRect(cloud);
    return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  }

  // Topmost first, but the selected cloud always wins so it stays grabbable
  // when buried under later clouds. Edges of any cloud beat any body.
  function candidates() {
    const st = getState();
    const top = [...st.clouds].reverse();
    const sel = st.clouds.find((c) => c.id === st.selectedId);
    return sel ? [sel, ...top.filter((c) => c !== sel)] : top;
  }

  function hitTest(p) {
    const list = candidates();
    for (const c of list) {
      const edges = edgesAt(c, p);
      if (edges) return { cloud: c, mode: "resize", edges };
    }
    for (const c of list) if (inBody(c, p)) return { cloud: c, mode: "move" };
    return null;
  }

  function cursorFor(p) {
    if (!inPlot(p)) return "default";
    const hit = hitTest(p);
    if (!hit) return "crosshair";
    if (hit.mode === "move") return "move";
    const { l, r, t, b } = hit.edges;
    if ((l && t) || (r && b)) return "nwse-resize";
    if ((r && t) || (l && b)) return "nesw-resize";
    return l || r ? "ew-resize" : "ns-resize";
  }

  const snapshot = (c) => ({
    timeStart: c.timeStart,
    timeEnd: c.timeEnd,
    freqLow: c.freqLow,
    freqHigh: c.freqHigh,
  });

  function applyMove(p) {
    const { start, origin, cloud } = drag;
    const dur = getState().durationSec;
    const dt = canvas.xToTime(p.x) - canvas.xToTime(origin.x);
    // Frequency moves in log space so the band keeps its width in octaves.
    const dLog = Math.log(canvas.yToFreq(p.y) / canvas.yToFreq(origin.y));

    const width = start.timeEnd - start.timeStart;
    const timeStart = clamp(start.timeStart + dt, 0, Math.max(0, dur - width));

    const ratio = start.freqHigh / start.freqLow;
    const freqLow = clamp(start.freqLow * Math.exp(dLog), FREQ_RANGE.min, FREQ_RANGE.max / ratio);

    actions.patch(cloud.id, {
      timeStart,
      timeEnd: timeStart + width,
      freqLow,
      freqHigh: freqLow * ratio,
    });
  }

  function applyResize(p) {
    const { start, edges, cloud } = drag;
    const dur = getState().durationSec;
    const t = clamp(canvas.xToTime(p.x), 0, dur);
    const f = clamp(canvas.yToFreq(p.y), FREQ_RANGE.min, FREQ_RANGE.max);
    const changes = {};

    if (edges.l) changes.timeStart = Math.min(t, start.timeEnd - MIN_TIME);
    if (edges.r) changes.timeEnd = Math.max(t, start.timeStart + MIN_TIME);
    if (edges.t) changes.freqHigh = Math.max(f, start.freqLow * MIN_RATIO);
    if (edges.b) changes.freqLow = Math.min(f, start.freqHigh / MIN_RATIO);

    actions.patch(cloud.id, changes);
  }

  function applyCreate(p) {
    const { anchor, cloud } = drag;
    const dur = getState().durationSec;
    const t = clamp(canvas.xToTime(p.x), 0, dur);
    const f = clamp(canvas.yToFreq(p.y), FREQ_RANGE.min, FREQ_RANGE.max);

    actions.patch(cloud.id, {
      timeStart: Math.min(anchor.t, t),
      timeEnd: Math.max(anchor.t, t),
      freqLow: Math.min(anchor.f, f),
      freqHigh: Math.max(anchor.f, f),
    });
  }

  function onPointerDown(e) {
    if (e.button !== 0) return;
    const p = pointerPos(e);
    if (!inPlot(p)) return;
    e.preventDefault();
    // preventDefault blocks the focus change a click normally causes, so the
    // field is blurred by hand — otherwise a visit to the duration input keeps
    // keyboard focus and Delete stops working on the canvas.
    document.activeElement?.blur();
    canvasEl.setPointerCapture(e.pointerId);

    const hit = hitTest(p);
    if (hit) {
      actions.select(hit.cloud.id);
      drag = { ...hit, origin: p, start: snapshot(hit.cloud) };
      return;
    }

    const anchor = { t: canvas.xToTime(p.x), f: canvas.yToFreq(p.y) };
    const cloud = defaultCloud({
      timeStart: anchor.t,
      timeEnd: anchor.t,
      freqLow: anchor.f,
      freqHigh: anchor.f,
      seed: Math.floor(Math.random() * 1e6),
    });
    actions.add(cloud);
    drag = { mode: "create", cloud, anchor, origin: p };
  }

  function onPointerMove(e) {
    const p = pointerPos(e);
    if (!drag) {
      canvasEl.style.cursor = cursorFor(p);
      return;
    }
    if (drag.mode === "move") applyMove(p);
    else if (drag.mode === "resize") applyResize(p);
    else applyCreate(p);
  }

  function onPointerUp(e) {
    if (!drag) return;
    const p = pointerPos(e);
    // A click on empty canvas paints nothing and just clears the selection.
    if (drag.mode === "create") {
      const tiny =
        Math.abs(p.x - drag.origin.x) < MIN_DRAG_PX || Math.abs(p.y - drag.origin.y) < MIN_DRAG_PX;
      if (tiny) actions.remove(drag.cloud.id);
    }
    drag = null;
  }

  function cancelDrag() {
    if (!drag) return;
    if (drag.mode === "create") actions.remove(drag.cloud.id);
    else actions.patch(drag.cloud.id, drag.start);
    drag = null;
  }

  function onKeyDown(e) {
    if (isTypingTarget(e.target)) return;

    if (e.key === "Escape") {
      cancelDrag();
      return;
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      const id = getState().selectedId;
      if (!id) return;
      e.preventDefault();
      cancelDrag();
      actions.remove(id);
      return;
    }

    if ((e.metaKey || e.ctrlKey) && (e.key === "d" || e.key === "D")) {
      const state = getState();
      const cloud = state.clouds.find((c) => c.id === state.selectedId);
      if (!cloud) return;
      e.preventDefault();
      // Dropped in just after the original so the copy is visible, and given a
      // fresh seed so it scatters differently instead of doubling the original.
      // Like a dragged cloud, it keeps its width: with no room left it sits
      // flush against the end rather than being squashed by the clamp.
      const { id, ...rest } = cloud;
      const width = cloud.timeEnd - cloud.timeStart;
      const start = Math.min(cloud.timeStart + width, Math.max(0, state.durationSec - width));
      actions.add(
        defaultCloud({
          ...rest,
          timeStart: start,
          timeEnd: start + width,
          seed: Math.floor(Math.random() * 1e6),
        })
      );
    }
  }

  canvasEl.addEventListener("pointerdown", onPointerDown);
  canvasEl.addEventListener("pointermove", onPointerMove);
  canvasEl.addEventListener("pointerup", onPointerUp);
  canvasEl.addEventListener("pointercancel", cancelDrag);
  window.addEventListener("keydown", onKeyDown);
}
