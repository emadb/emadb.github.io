// Grid model: the document. Columns are 10 ms time steps, rows are
// log-spaced frequency bands (24 per octave). The Float32Array of cell
// amplitudes is the single source of truth for display, synthesis and
// saving — what you see is literally what you hear.

export const F_MIN = 20;
export const BANDS_PER_OCTAVE = 24;
export const OCTAVES = 10; // exactly 10 octaves keeps rows ↔ plot alignment exact
export const ROWS = BANDS_PER_OCTAVE * OCTAVES; // 240
export const F_TOP = F_MIN * 2 ** OCTAVES; // upper edge of the plane: 20480 Hz
export const COLUMNS_PER_SECOND = 100; // 10 ms time step

// A row is a band one 24th of an octave tall; its oscillator sits at the
// band's center, half a band above the lower edge, so
// Math.round(freqToRow(rowToFreq(r))) === r for every row.
export function rowToFreq(row) {
  return F_MIN * 2 ** ((row + 0.5) / BANDS_PER_OCTAVE);
}

export function freqToRow(freq) {
  return BANDS_PER_OCTAVE * Math.log2(freq / F_MIN) - 0.5;
}

// Row-major by row (row * cols + col): synthesis walks a row's columns
// sequentially, painting stamps small patches — rows win on locality.
export const cellIndex = (grid, row, col) => row * grid.cols + col;

export function createGrid(durationSec) {
  const cols = Math.max(1, Math.round(durationSec * COLUMNS_PER_SECOND));
  return { cols, rows: ROWS, data: new Float32Array(cols * ROWS) };
}

// Stamps one soft disc of the brush into the grid at a fractional
// (row, col) center. Stamps combine with max, so repainting the same spot
// never overloads and strokes read like light on black; the eraser is the
// same disc clamping cells toward zero instead.
export function stampBrush(grid, rowF, colF, brush) {
  const radius = Math.max(0.5, brush.size);
  const soft = Math.min(1, Math.max(0, brush.softness));
  const hardCore = 1 - soft; // fraction of the radius at full strength
  const intensity = Math.min(1, Math.max(0, brush.intensity));

  const r0 = Math.max(0, Math.ceil(rowF - radius));
  const r1 = Math.min(grid.rows - 1, Math.floor(rowF + radius));
  const c0 = Math.max(0, Math.ceil(colF - radius));
  const c1 = Math.min(grid.cols - 1, Math.floor(colF + radius));

  for (let row = r0; row <= r1; row++) {
    for (let col = c0; col <= c1; col++) {
      const d = Math.hypot(row - rowF, col - colF) / radius;
      if (d > 1) continue;
      let a = d <= hardCore ? 1 : (1 - d) / soft;
      a = a * a * (3 - 2 * a); // smoothstep the falloff — no hard rings
      a *= intensity;
      const i = row * grid.cols + col;
      grid.data[i] = brush.erase
        ? Math.min(grid.data[i], 1 - a)
        : Math.max(grid.data[i], a);
    }
  }
}

// Stamps along a straight segment in cell space, stepping at ~40% of the
// radius: dense enough to read as one continuous mark, sparse enough that
// a long stroke stays cheap. Takes the point stamp function to use, so
// freehand and line/shift-drag share one path for both plain and
// harmonic strokes.
export function stampLine(grid, from, to, brush, stamp = stampBrush) {
  const step = Math.max(0.5, brush.size * 0.4);
  const dist = Math.hypot(to.row - from.row, to.col - from.col);
  const steps = Math.max(1, Math.ceil(dist / step));
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    stamp(grid, from.row + (to.row - from.row) * u, from.col + (to.col - from.col) * u, brush);
  }
}

// A harmonic stroke paints, it doesn't synthesize: the fundamental row at
// full brush strength, plus overtone rows at 2f, 3f, 4f… each dimmer by
// 1/n^falloff. Rows are uniform in log frequency, so multiplying a
// frequency by n is just a fixed additive row offset — no rowToFreq/
// freqToRow round trip needed. Still the tonal grid, still played back
// unchanged by the sine bank; "what you see is what you hear" stays true,
// it just draws a comb of parallel lines instead of one.
export function stampHarmonic(grid, rowF, colF, brush, partials, falloff) {
  const n = Math.max(1, Math.round(partials));
  for (let harmonic = 1; harmonic <= n; harmonic++) {
    const partialRow = rowF + BANDS_PER_OCTAVE * Math.log2(harmonic);
    if (partialRow > grid.rows - 1) break; // above the plane's ceiling: not stamped
    const amp = harmonic === 1 ? 1 : 1 / harmonic ** falloff;
    stampBrush(grid, partialRow, colF, { ...brush, intensity: brush.intensity * amp });
  }
}

// Destructive whole-grid adjust: gamma reshapes the amplitude curve,
// gain scales it, results clamp to 0..1. Same formula the display
// preview applies, so commit looks exactly like the preview did.
export function adjustGrid(grid, gain, gamma) {
  const d = grid.data;
  for (let i = 0; i < d.length; i++) {
    if (d[i] > 0) d[i] = Math.min(1, gain * Math.pow(d[i], gamma));
  }
}

// Re-times the grid to a new duration: each new column samples the old
// grid at its proportional position (linear interpolation between the two
// straddling columns), so content keeps its relative place — a note at
// 20–40% of the timeline stays at 20–40%.
export function resizeGrid(grid, durationSec) {
  const next = createGrid(durationSec);
  if (next.cols === grid.cols) {
    next.data.set(grid.data);
    return next;
  }
  const scale = grid.cols / next.cols;
  for (let row = 0; row < next.rows; row++) {
    const oldBase = row * grid.cols;
    const newBase = row * next.cols;
    for (let c = 0; c < next.cols; c++) {
      const pos = c * scale;
      const c0 = Math.min(Math.floor(pos), grid.cols - 1);
      const c1 = Math.min(c0 + 1, grid.cols - 1);
      const t = pos - c0;
      next.data[newBase + c] = grid.data[oldBase + c0] * (1 - t) + grid.data[oldBase + c1] * t;
    }
  }
  return next;
}

// A small default document so the first Play already sounds like
// something: a soft three-note chord, then a rising sweep. Painted with
// the same brush and line stamp the user paints with, so it also reads
// as a worked example of what painting produces.
export function stampDefaultDocument(grid) {
  const brush = { size: 3, softness: 0.6, intensity: 0.85 };

  const chordFreqs = [220, 261.63, 329.63]; // A3, C4, E4 — an A minor triad
  const chordFrom = grid.cols * 0.05;
  const chordTo = grid.cols * 0.35;
  for (const f of chordFreqs) {
    const row = freqToRow(f);
    stampLine(grid, { row, col: chordFrom }, { row, col: chordTo }, brush);
  }

  const sweepFrom = grid.cols * 0.45;
  const sweepTo = grid.cols * 0.92;
  stampLine(
    grid,
    { row: freqToRow(180), col: sweepFrom },
    { row: freqToRow(2200), col: sweepTo },
    brush,
  );
}
