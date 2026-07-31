// Pointer/wheel gestures for both canvases.
//
// Source canvas: wheel to zoom/pan, drag a boundary handle to reshape an
// event, click an event to select it (shift to multi-select), drag empty
// space to select a raw source interval, double-click a void to create a
// manual event, and drag a role band (or an existing void selection) across
// into the score canvas to create a clip there.
//
// Score canvas: wheel to zoom/pan, drag a clip to move it (Alt/Option to
// duplicate first), drag vertically to change lane, drag an edge to trim,
// click to select (shift to multi-select).
//
// Callers own state, model mutation and clamping; this module only
// translates DOM events into frame-space intents.

import { hitTestBoundary, xToFrame as xToSourceFrame } from "./source-canvas.js";
import { roleAtFrame } from "./model.js";
import { hitTestClip, xToFrame as xToScoreFrame, laneAtY } from "./score-canvas.js";

const HIT_RADIUS_PX = 6;
const TRIM_HANDLE_PX = 6;
const DRAG_THRESHOLD_PX = 4;

function toDeviceX(canvas, clientX) {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  return (clientX - rect.left) * dpr;
}

function toDeviceY(canvas, clientY) {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  return (clientY - rect.top) * dpr;
}

export function initSourceInteraction(canvas, hooks) {
  // hooks: {
  //   getView, setView, setSelection, onChange, setActivePane,
  //   getEvents, getWaveHeight, findEventAtFrame,
  //   getSelectedEventIds, selectEvents,
  //   beginGesture, updateEventBoundary, createManualEventAtFrame,
  //   isPointOverScore, dropOnScore({ eventId, role, sourceStartFrame, sourceEndFrame }, clientX, clientY),
  // }
  const dpr = window.devicePixelRatio || 1;

  let mode = null; // null | "select" | "divider" | "role-pending" | "void-pending" | "cross-drag"
  let moved = false;
  let dragStartX = 0;
  let dragStartFrame = 0;
  let dividerTarget = null; // { eventId, boundaryKey }
  let dragPayload = null; // { eventId, role, sourceStartFrame, sourceEndFrame }
  let pendingClick = null; // { eventId, shiftKey }

  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const view = hooks.getView();
      const isPan = e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY);
      if (isPan) {
        const deltaFrames = (e.deltaX || e.deltaY) * view.framesPerPixel * 2;
        hooks.setView({ viewStartFrame: view.viewStartFrame + deltaFrames, framesPerPixel: view.framesPerPixel });
      } else {
        const x = toDeviceX(canvas, e.clientX);
        const frameAtCursor = view.viewStartFrame + x * view.framesPerPixel;
        const zoomFactor = Math.pow(1.0015, e.deltaY);
        const newFpp = view.framesPerPixel * zoomFactor;
        hooks.setView({ viewStartFrame: frameAtCursor - x * newFpp, framesPerPixel: newFpp });
      }
      hooks.onChange();
    },
    { passive: false }
  );

  canvas.addEventListener("dblclick", (e) => {
    const view = hooks.getView();
    const x = toDeviceX(canvas, e.clientX);
    const frame = xToSourceFrame(x, view);
    hooks.createManualEventAtFrame(Math.round(frame));
    hooks.onChange();
  });

  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    hooks.setActivePane("source");
    moved = false;
    dragPayload = null;
    pendingClick = null;
    const view = hooks.getView();
    const x = toDeviceX(canvas, e.clientX);
    const y = toDeviceY(canvas, e.clientY);
    const frame = xToSourceFrame(x, view);

    const boundaryHit = hitTestBoundary(hooks.getEvents(), view, x, y, hooks.getWaveHeight(), HIT_RADIUS_PX * dpr);
    if (boundaryHit) {
      mode = "divider";
      dividerTarget = boundaryHit;
      hooks.beginGesture();
      hooks.selectEvents([boundaryHit.eventId], false);
      hooks.onChange();
      return;
    }

    const eventHit = hooks.findEventAtFrame(frame);
    if (eventHit) {
      mode = "role-pending";
      dragStartX = x;
      pendingClick = { eventId: eventHit.id, shiftKey: e.shiftKey };
      dragPayload = {
        eventId: eventHit.id,
        role: roleAtFrame(eventHit, frame),
      };
      dragPayload.sourceStartFrame = eventHit[roleFromKey(dragPayload.role)];
      dragPayload.sourceEndFrame = eventHit[roleToKey(dragPayload.role)];
      return;
    }

    const currentSelection = hooks.getSelection();
    if (currentSelection && frame >= currentSelection.startFrame && frame < currentSelection.endFrame) {
      mode = "void-pending";
      dragStartX = x;
      dragPayload = { eventId: null, role: null, sourceStartFrame: currentSelection.startFrame, sourceEndFrame: currentSelection.endFrame };
      return;
    }

    mode = "select";
    dragStartFrame = frame;
    dragStartX = x;
  });

  canvas.addEventListener("pointermove", (e) => {
    if (mode === "divider") {
      const view = hooks.getView();
      const x = toDeviceX(canvas, e.clientX);
      const frame = xToSourceFrame(x, view);
      hooks.updateEventBoundary(dividerTarget.eventId, dividerTarget.boundaryKey, Math.round(frame));
      hooks.onChange();
      return;
    }

    if (mode === "role-pending" || mode === "void-pending") {
      const x = toDeviceX(canvas, e.clientX);
      if (Math.abs(x - dragStartX) > DRAG_THRESHOLD_PX) mode = "cross-drag";
      return;
    }

    if (mode === "cross-drag") return; // no live preview in v1; resolved on drop

    if (mode !== "select") return;
    const x = toDeviceX(canvas, e.clientX);
    if (Math.abs(x - dragStartX) > 2) moved = true;
    if (!moved) return;
    const view = hooks.getView();
    const currentFrame = xToSourceFrame(x, view);
    hooks.setSelection({
      startFrame: Math.min(dragStartFrame, currentFrame),
      endFrame: Math.max(dragStartFrame, currentFrame),
    });
    hooks.selectEvents([], false);
    hooks.onChange();
  });

  canvas.addEventListener("pointerup", (e) => {
    if (mode === "cross-drag") {
      if (hooks.isPointOverScore(e.clientX, e.clientY)) {
        hooks.dropOnScore(dragPayload, e.clientX, e.clientY);
      }
    } else if (mode === "role-pending" && pendingClick) {
      hooks.selectEvents([pendingClick.eventId], pendingClick.shiftKey);
      hooks.setSelection(null);
      hooks.onChange();
    } else if (mode === "void-pending") {
      hooks.setSelection(null);
      hooks.selectEvents([], false);
      hooks.onChange();
    } else if (mode === "select" && !moved) {
      hooks.setSelection(null);
      hooks.selectEvents([], false);
      hooks.onChange();
    }
    mode = null;
    dividerTarget = null;
    dragPayload = null;
    pendingClick = null;
  });
}

function roleFromKey(role) {
  return { foreshadow: "startFrame", excitation: "excitationFrame", body: "bodyFrame", resonance: "resonanceFrame" }[role];
}
function roleToKey(role) {
  return { foreshadow: "excitationFrame", excitation: "bodyFrame", body: "resonanceFrame", resonance: "endFrame" }[role];
}

export function initScoreInteraction(canvas, hooks) {
  // hooks: {
  //   getView, setView, onChange, setActivePane,
  //   getClips, getCanvasHeight,
  //   getSelectedClipIds, selectClips,
  //   beginGesture, moveClipLive, trimClipLive, duplicateAndSelect,
  // }
  let mode = null; // null | "move" | "trim-left" | "trim-right" | "select"
  let activeClipId = null;
  let moved = false;
  let dragStartX = 0;
  let dragStartFrame = 0;
  let clipStartOutputFrame = 0;
  let pendingClick = null;

  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const view = hooks.getView();
      const isPan = e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY);
      if (isPan) {
        const deltaFrames = (e.deltaX || e.deltaY) * view.framesPerPixel * 2;
        hooks.setView({ viewStartFrame: view.viewStartFrame + deltaFrames, framesPerPixel: view.framesPerPixel });
      } else {
        const x = toDeviceX(canvas, e.clientX);
        const frameAtCursor = view.viewStartFrame + x * view.framesPerPixel;
        const zoomFactor = Math.pow(1.0015, e.deltaY);
        const newFpp = view.framesPerPixel * zoomFactor;
        hooks.setView({ viewStartFrame: frameAtCursor - x * newFpp, framesPerPixel: newFpp });
      }
      hooks.onChange();
    },
    { passive: false }
  );

  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    hooks.setActivePane("score");
    moved = false;
    pendingClick = null;
    const view = hooks.getView();
    const x = toDeviceX(canvas, e.clientX);
    const y = toDeviceY(canvas, e.clientY);
    const hit = hitTestClip(hooks.getClips(), view, x, y, hooks.getCanvasHeight(), TRIM_HANDLE_PX);

    if (!hit) {
      mode = "select";
      return;
    }

    activeClipId = hit.clip.id;
    dragStartX = x;
    dragStartFrame = xToScoreFrame(x, view);
    clipStartOutputFrame = hit.clip.outputStartFrame;

    if (e.altKey && hit.part === "body") {
      hooks.beginGesture();
      activeClipId = hooks.duplicateAndSelect(hit.clip.id);
      mode = "move";
      return;
    }

    if (hit.part === "left") {
      mode = "trim-left";
      hooks.beginGesture();
      hooks.selectClips([activeClipId], false);
      hooks.onChange();
      return;
    }
    if (hit.part === "right") {
      mode = "trim-right";
      hooks.beginGesture();
      hooks.selectClips([activeClipId], false);
      hooks.onChange();
      return;
    }

    mode = "move";
    pendingClick = { clipId: activeClipId, shiftKey: e.shiftKey };
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!mode || mode === "select") return;
    const view = hooks.getView();
    const x = toDeviceX(canvas, e.clientX);
    const y = toDeviceY(canvas, e.clientY);
    if (Math.abs(x - dragStartX) > DRAG_THRESHOLD_PX) moved = true;

    if (mode === "trim-left" || mode === "trim-right") {
      if (!moved) return;
      const frame = xToScoreFrame(x, view);
      hooks.trimClipLive(activeClipId, mode === "trim-left" ? "left" : "right", frame);
      hooks.onChange();
      return;
    }

    if (mode === "move") {
      if (!moved) return;
      if (pendingClick) {
        hooks.beginGesture();
        hooks.selectClips([pendingClick.clipId], pendingClick.shiftKey);
        pendingClick = null;
      }
      const currentFrame = xToScoreFrame(x, view);
      const deltaFrames = currentFrame - dragStartFrame;
      const lane = laneAtY(y, hooks.getCanvasHeight());
      hooks.moveClipLive(activeClipId, clipStartOutputFrame + deltaFrames, lane);
      hooks.onChange();
    }
  });

  canvas.addEventListener("pointerup", () => {
    if (mode === "move" && !moved && pendingClick) {
      hooks.selectClips([pendingClick.clipId], pendingClick.shiftKey);
      hooks.onChange();
    } else if (mode === "select" && !moved) {
      hooks.selectClips([], false);
      hooks.onChange();
    }
    mode = null;
    activeClipId = null;
    pendingClick = null;
  });
}
