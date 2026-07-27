# Cloud Studio

Paint clouds of sound particles onto a time–frequency plane and render them to WAV.

A cloud is not a note. It's a region of the plane plus a statistical description of the grains scattered inside it — how many per second, how long each one lasts, what shape its envelope has. You draw the region; the engine fills in the thousands of grains. That division of labour is the whole idea behind Curtis Roads' *Microsound*, and it's why this tool has no way to place an individual grain.

## Running it

It needs a local server — the app is ES modules, which browsers refuse to load over `file://`.

```sh
cd cloud-studio
python3 -m http.server 8741
```

Then open <http://127.0.0.1:8741/>. No build step, no dependencies.

## Using it

**On the canvas**, drag on empty space to paint a new cloud. Click one to select it, drag its body to move it, drag an edge or corner to resize it. The cursor tells you which you'll get. `Delete` or `Backspace` removes the selected cloud, `Cmd/Ctrl+D` duplicates it just after itself, and `Escape` cancels a drag in progress.

Moving a cloud preserves its width in octaves, so a one-octave band dragged upward stays one octave.

**In the inspector**, every parameter of the selected cloud is editable. Typing an inverted pair swaps it rather than complaining: entering a low frequency above the current high turns 70–320 into 320–500.

**Transport:** `Space` toggles play and stop, and playback re-renders each time so it always reflects your latest edit. After a render, every grain appears on the canvas as a small mark drawn the width of its own duration — a cloud of 6 ms grains looks like dust, one of 100 ms grains like dashes. The marks clear when you change anything, and return on the next render.

**Files:** *Export WAV* writes 16-bit stereo at 44.1 kHz — the same rate playback uses, so what you export is what you heard. *Save* and *Open* store the project as JSON, which is plain text and safe to hand-edit.

## The controls, and where they come from

*Chapter references are to Roads, «Microsound» (MIT Press, 2001).*

**Region — time and frequency.** A cloud is bounded in time and in frequency; grains are scattered inside it, irregularly, rather than laid out in a line. This is *asynchronous granular synthesis* (ch. 3), and the two bounds are Roads' cloud parameters 1 and 4. Frequencies are drawn log-uniformly across the band, which is why the axis is logarithmic.

**Density**, in grains per second, is the master perceptual dial (Introduction; ch. 3). Sparse emissions leave rhythmic traces you hear as separate events; as density rises the grains fuse into a stream, then into a continuous texture. Point, pulse, line, surface — one slider crosses all four.

**Grain duration**, 1 to 100 ms (ch. 3, "Anatomy of a grain"). Below about 2 ms a grain is a click with a colour but no pitch; pitch becomes vague around 5 ms and clear by 25 ms. Setting a min and max gives the cloud a range to draw from.

**Envelope** shapes each grain, and matters more than you'd expect:
- *gaussian* — Gabor's original bell curve, the shape with the least spectral spread. A gaussian cloud stays neatly inside its painted band.
- *expodec* — a fast attack and exponential decay: percussive, and audibly "particled". Its spectrum spreads well beyond the band, which is intrinsic to the shape rather than a defect.
- *rexpodec* — expodec reversed. Each grain swells and cuts off, which reads as breathy or sucked-in.

**Waveform** is the signal inside the grain (ch. 3). Sine is the pure case; saw and square are band-limited so high grains don't alias; noise is white noise band-passed at the grain's own frequency, so the cloud's frequency band still means something for it.

**Glide** turns grains into *glissons* (ch. 4) — each grain sweeps instead of holding its frequency, and its mark on the canvas tilts to show it. *up*, *down* and *random* sweep by **Glide depth** octaves from wherever the grain was scattered; *diverge* starts every grain on the band's centre line and sweeps out to its scattered position, *converge* is the reverse. Roads' field guide to what you'll hear: short deep glissons snap like woodblocks or claves, 30–90 ms ones tweet like birdsong, long ones pour into massed cascades — and converge clouds feather onto their centre line like iron filings onto a magnet, which is why he calls these settings *magnetization patterns*.

**Gain, scatter, fades.** Scatter is stereo dispersion — Roads' cloud parameter 7 — spreading grains across the field rather than stacking them in the centre. The fades are the cloud's amplitude envelope (parameter 5), applied per grain at its onset.

**Seed** fixes the randomness. The same seed always scatters the same grains, so a cloud you like is reproducible and an export is deterministic. Change it to reroll the same cloud into a different arrangement of the same statistics.

## Project files

Saved projects are JSON, tagged `cloud-studio/v1`. Loading coerces and clamps every value against the shape of a default cloud, so a hand-edited file can't push the renderer into a bad state — out-of-range numbers are clamped, unknown envelopes and waveforms fall back to defaults, and entries that aren't clouds are dropped.

## Where this is going

`../PLAN.md` tracks the build item by item, including the decisions behind each one and what's deferred. The next phase replaces the render-then-play model with a real-time engine, so parameter changes can be heard while the sound is playing.
