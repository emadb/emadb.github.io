// Pointer painting. Freehand strokes stamp the brush along the pointer
// path (interpolated in cell space so fast strokes don't dash); line mode
// (Line tool or shift-drag) previews a straight segment and commits it on
// release. The display refreshes once per animation frame, not per stamp,
// and the brush outline follows the pointer.

import { stampBrush, stampLine } from "./grid.js";

export function initPaint(canvasEl, canvas, getState, { onStrokeStart } = {}) {
  let stroking = false;
  let lineFrom = null; // anchor cell while a straight line is being dragged
  let last = null; // fractional { row, col } of the previous stamp
  let dirty = false;
  let frame = 0;

  function refreshSoon() {
    dirty = true;
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (dirty) {
        dirty = false;
        canvas.invalidateGrid();
      }
    });
  }

  // Pointer → fractional cell. Grid rows are uniform in log frequency and
  // the plot is log-frequency, so the mapping is linear in plot space.
  function toCell(e) {
    const rect = canvasEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const plot = canvas.getPlot();
    const { grid } = getState();
    return {
      col: ((x - plot.x) / plot.w) * grid.cols,
      row: (1 - (y - plot.y) / plot.h) * grid.rows,
      inside: x >= plot.x && x <= plot.x + plot.w && y >= plot.y && y <= plot.y + plot.h,
    };
  }

  function brush() {
    const { tool, brush: params } = getState();
    return { ...params, erase: tool === "eraser" };
  }

  function updateCursor(cell) {
    const b = brush();
    canvas.setCursor({ rowF: cell.row, colF: cell.col, radius: b.size, erase: b.erase });
  }

  canvasEl.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const cell = toCell(e);
    if (!cell.inside) return;
    canvasEl.setPointerCapture(e.pointerId);
    stroking = true;
    onStrokeStart?.();
    if (getState().tool === "line" || e.shiftKey) {
      lineFrom = cell;
      canvas.setLinePreview({ from: cell, to: cell });
    } else {
      last = cell;
      stampBrush(getState().grid, cell.row, cell.col, brush());
      refreshSoon();
    }
    updateCursor(cell);
  });

  canvasEl.addEventListener("pointermove", (e) => {
    const cell = toCell(e);
    if (stroking) {
      if (lineFrom) {
        canvas.setLinePreview({ from: lineFrom, to: cell });
      } else {
        stampLine(getState().grid, last, cell, brush());
        last = cell;
        refreshSoon();
      }
    }
    if (cell.inside || stroking) updateCursor(cell);
    else canvas.setCursor(null);
  });

  function endStroke(e) {
    if (!stroking) return;
    stroking = false;
    if (lineFrom) {
      stampLine(getState().grid, lineFrom, toCell(e), brush());
      lineFrom = null;
      canvas.setLinePreview(null);
    }
    last = null;
    canvasEl.releasePointerCapture?.(e.pointerId);
    refreshSoon();
  }

  canvasEl.addEventListener("pointerup", endStroke);
  canvasEl.addEventListener("pointercancel", endStroke);
  canvasEl.addEventListener("pointerleave", () => {
    if (!stroking) canvas.setCursor(null);
  });
}
