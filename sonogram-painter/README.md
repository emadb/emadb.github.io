# Sonogram Painter

A canvas that *is* a spectrogram. Paint on the time–frequency plane, or drop
an image, and hear it — what you see is literally what you hear. Paint with
three different sounds, or drop an image, and export WAV.

## Running it

It needs a local server — the app is ES modules, which browsers refuse to
load over `file://`.

```sh
cd sonogram-painter
python3 -m http.server 8741
```

Then open <http://127.0.0.1:8741/>. No build step, no dependencies.

## Using it

**The Palette** picks *what* you paint with — independent of the Tool
below it, which picks *how*:

- **Sine** — a pure tone per row. The default; reads as a clean line.
- **Harmonic** — a fundamental plus overtones (2×, 3×, 4×… the painted
  pitch), each dimmer by the **Falloff** curve, up to **Partials** of them.
  One stroke lights up a comb of parallel lines instead of a single one —
  richer, more instrument-like, less "sine wave." It's still the same
  sine bank underneath, just several rows stamped in one gesture.
- **Noise** — a band of filtered noise centered on the painted row, in its
  own color (teal) so it's visible as a distinct material even where it
  overlaps tonal content (the overlap brightens, like light added to
  light). **Noise Q** sets the band's character: high Q is narrow and
  reads almost pitched, low Q is wide and reads as hiss.

**On the canvas**, drag to paint with the current tool. `B` selects the
brush, `E` the eraser, `[` and `]` shrink and grow the brush. Hold **Shift**
while dragging (or pick the **Line** tool) for a straight stroke — useful
for a steady partial or a clean glissando; Harmonic strokes draw their
whole comb along the line too. The **Eraser** is always a plain point,
regardless of palette — it removes what's there, it doesn't un-paint a
comb pattern. **Space** toggles play and stop.

Brush strokes combine with the loudest value already there, not by adding —
repainting the same spot never overloads, and overlapping strokes read like
light layered on black rather than clipping to white.

**Gain and gamma** reshape the whole picture — both palette materials at
once: gain scales it, gamma bends the curve so quiet detail can be pulled
up (or pushed down) without touching the loud parts. Both preview live as
you drag and commit when you let go.

There's no undo — Clear, an image import, or a gain/gamma commit is
final. Save often if you want checkpoints to fall back to.

**Drop an image** (PNG/JPG) on the canvas, or use *Import…*, to turn a
picture into sound: brightness becomes amplitude, the image's top edge
becomes the highest frequencies. Import always lands on the tonal grid (a
photo becomes tone, not noise texture). *Gamma* reshapes the brightness
curve — photos are mostly bright and sound wants mostly silence, so
pulling gamma above 1 is usually what makes a photo intelligible instead
of a wall of noise. *Invert* is for dark-on-light sources (a printed page,
a screenshot of a spectrogram) where the interesting detail is the dark
part. Once imported, the image is ordinary grid content: paint over it,
erase parts of it, adjust it like anything else.

**Duration** re-times the whole document: painted content keeps its
relative position on the timeline, so a note at 20% of a 10-second piece is
still at 20% after you stretch it to 20 seconds.

**Files:** *Export WAV* renders both grids, sums them, and writes 16-bit
stereo at 44.1 kHz (the same signal on both channels — this is a mono
engine). *Save* and *Open* store the project as JSON with each grid packed
as a PNG data URL, since a grid *is* an image and PNG compresses silence to
nothing.

## How the sound is made

The document is really two grids of the same shape: columns are 10 ms
time steps, rows are frequency bands spaced 24 to the octave (20 Hz–20.48
kHz, ten octaves exactly). A cell's brightness is that band's amplitude at
that moment — nothing more. The **tonal grid** holds Sine and Harmonic
content; the **noise grid** holds Noise content. They render separately
and sum into one signal.

For the tonal grid, one sine oscillator runs continuously for every row,
permanently tuned to that row's center frequency. Rendering walks each row
across time and reads its amplitude off the grid, ramping smoothly from
one column's value to the next so a stroke's edge never clicks. A Harmonic
stroke doesn't add a new kind of oscillator — it just stamps several rows
at once (the fundamental plus overtones), so the same sine bank plays it
without knowing anything changed.

For the noise grid, one bandpass-filtered noise oscillator runs per row
instead, centered on that row's frequency, driven by its cells the same
way. This is the one place with real per-sample randomness, so a Noise
passage sounds slightly different every time you play or export it — the
*painted* amplitude is still exactly what you see, only the specific noise
waveform underneath varies, the way real hiss always does.

Both engines skip silent rows and silent stretches for free — which is why
a mostly-black picture renders almost instantly even though the grids
nominally hold hundreds of oscillators between them.

This is additive synthesis with a spectrogram as its score: rather than
inferring an oscillator bank from a recording (an FFT/vocoder approach),
the bank *is* the instrument and the picture *is* the performance. The
tonal engine can't represent phase or arbitrary waveforms — only "how loud
is this frequency right now" — which is exactly what makes a hand-painted
line sound like a deliberate pitch contour instead of noise.

## Project files

Saved projects are JSON, tagged `sonogram-painter/v2`, with each grid
(tonal and noise) stored as its own base64 PNG. Loading decodes each PNG
back into cell amplitudes through the same path a dropped image takes
(with no gamma reshaping and no silence floor, so the round-trip is exact
to 8 bits per cell) — a project file is really just "drop an image," twice,
with a filename and a duration attached. Files saved by earlier versions
(`sonogram-painter/v1`, a single grid) still open — their content becomes
the tonal grid, and the noise grid starts empty. Opening a file in an
unrelated format is rejected with an error message and leaves the current
document untouched.

## Where this is going

`PLAN.md` tracks the build item by item, including the decisions behind
each one and what's deferred — stereo (color-to-pan, now touching three
grids' worth of panning instead of one), a per-layer undo (dropped in v2
to keep the two-grid plumbing simple), additional palette entries once the
two-engine pattern exists, smudge/blur/copy tools, a real-time engine, and
analysis import (WAV → FFT → repaintable grid).
