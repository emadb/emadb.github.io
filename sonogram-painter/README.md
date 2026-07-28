# Sonogram Painter

A canvas that *is* a spectrogram. Paint on the time–frequency plane, or drop
an image, and hear it — what you see is literally what you hear. Export WAV.

## Running it

It needs a local server — the app is ES modules, which browsers refuse to
load over `file://`.

```sh
cd sonogram-painter
python3 -m http.server 8741
```

Then open <http://127.0.0.1:8741/>. No build step, no dependencies.

## Using it

**On the canvas**, drag to paint with the current tool. `B` selects the
brush, `E` the eraser, `[` and `]` shrink and grow the brush. Hold **Shift**
while dragging (or pick the **Line** tool) for a straight stroke — useful
for a steady partial or a clean glissando. **Space** toggles play and stop.

Brush strokes combine with the loudest value already there, not by adding —
repainting the same spot never overloads, and overlapping strokes read like
light layered on black rather than clipping to white.

**Gain and gamma** reshape the whole picture: gain scales it, gamma bends
the curve so quiet detail can be pulled up (or pushed down) without
touching the loud parts. Both preview live as you drag and commit — as an
undoable edit — when you let go.

**Undo/redo** (`Cmd/Ctrl+Z`, `Shift+Cmd/Ctrl+Z`) works on the whole
picture, including image imports, gain/gamma commits, Clear, and duration
changes.

**Drop an image** (PNG/JPG) on the canvas, or use *Import…*, to turn a
picture into sound: brightness becomes amplitude, the image's top edge
becomes the highest frequencies. *Gamma* reshapes the brightness curve —
photos are mostly bright and sound wants mostly silence, so pulling gamma
above 1 is usually what makes a photo intelligible instead of a wall of
noise. *Invert* is for dark-on-light sources (a printed page, a screenshot
of a spectrogram) where the interesting detail is the dark part. Once
imported, the image is ordinary grid content: paint over it, erase parts of
it, adjust it like anything else.

**Duration** re-times the whole document: painted content keeps its
relative position on the timeline, so a note at 20% of a 10-second piece is
still at 20% after you stretch it to 20 seconds.

**Files:** *Export WAV* renders the grid and writes 16-bit stereo at
44.1 kHz (the same signal on both channels — this is a mono engine). *Save*
and *Open* store the project as JSON with the grid packed as a PNG data
URL, since the grid *is* an image and PNG compresses silence to nothing.

## How the sound is made

The document is a grid: columns are 10 ms time steps, rows are frequency
bands spaced 24 to the octave (20 Hz–20.48 kHz, ten octaves exactly). A
cell's brightness is that band's amplitude at that moment — nothing more.

To turn the grid into sound, one sine oscillator runs continuously for
every row, permanently tuned to that row's center frequency. Rendering
walks each row across time and reads its amplitude off the grid, ramping
smoothly from one column's value to the next so a stroke's edge never
clicks. Silent rows and silent stretches cost nothing — the render skips
straight over them — which is why a mostly-black picture renders almost
instantly even though the grid nominally holds 240 oscillators.

This is additive synthesis with a spectrogram as its score: rather than
inferring an oscillator bank from a recording (an FFT/vocoder approach),
the bank *is* the instrument and the picture *is* the performance. It can't
represent phase or arbitrary waveforms — only "how loud is this frequency
right now" — which is exactly what makes a hand-painted line sound like a
deliberate pitch contour instead of noise.

## Project files

Saved projects are JSON, tagged `sonogram-painter/v1`, with the grid
stored as a base64 PNG. Loading decodes the PNG back into cell amplitudes
through the same path a dropped image takes (with no gamma reshaping and no
silence floor, so the round-trip is exact to 8 bits per cell) — a project
file is really just "drop an image" with a filename and a duration
attached. Opening a file in the wrong format is rejected with an error
message and leaves the current document untouched.

## Where this is going

`PLAN.md` tracks the build item by item, including the decisions behind
each one and what's deferred — stereo (color-to-pan), noise-band and
harmonic-brush oscillators, smudge/blur/copy tools, a real-time engine, and
analysis import (WAV → FFT → repaintable grid).
