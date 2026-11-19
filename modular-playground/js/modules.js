// Module descriptors: pure data describing each module type's ports and
// params. The audio adapters (adapters.js) build the Web Audio nodes; the UI
// reads these descriptors to draw blocks, ports and knobs.
//
// Signal kinds color the ports and cables: "audio", "pitch" (1 unit = 1
// octave, 0 = C4), "gate" (0 or 1) and "cv" (modulation, -1..+1 or 0..1).
// A param with `amountFor` is the attenuverter of a modulation input: it
// scales whatever is patched into that input into the unit of the target.

const WAVES = ["sine", "triangle", "sawtooth", "square"];
const STEPS = [1, 2, 3, 4, 5, 6, 7, 8];

// Scale degrees in semitones from the root. The quantizer worklet receives
// the scale as an index into this list.
export const SCALES = {
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  "pent. major": [0, 2, 4, 7, 9],
  "pent. minor": [0, 3, 5, 7, 10],
};
const SCALE_NAMES = Object.keys(SCALES);

const num = (id, label, min, max, value, unit = "", extra = {}) => ({
  id, label, min, max, default: value, unit, scale: "lin", ...extra,
});

const log = (id, label, min, max, value, unit = "") =>
  num(id, label, min, max, value, unit, { scale: "log" });

const choice = (id, label, options, value) => ({
  id, label, options, default: value, kind: "choice",
});

const toggle = (id, label, value) => ({ id, label, default: value, kind: "toggle" });

const amount = (input, min, max, value, unit) =>
  num(`${input}Amt`, `${input} amt`, min, max, value, unit, { amountFor: input });

const port = (id, label, signal) => ({ id, label, signal });

export const MODULE_TYPES = {
  keyboard: {
    title: "Keyboard",
    inputs: [],
    outputs: [port("pitch", "pitch", "pitch"), port("gate", "gate", "gate")],
    params: [num("octave", "Octave", -3, 3, 0, "oct", { step: 1 })],
  },

  vco: {
    title: "VCO",
    inputs: [port("pitch", "pitch", "pitch"), port("fm", "fm", "cv")],
    outputs: [port("out", "out", "audio")],
    params: [
      choice("wave", "Wave", WAVES, "sawtooth"),
      log("tune", "Tune", 20, 2000, 261.63, "Hz"),
      num("fine", "Fine", -100, 100, 0, "ct"),
      amount("fm", 0, 1000, 100, "Hz"),
    ],
  },

  lfo: {
    title: "LFO",
    inputs: [port("rate", "rate", "cv")],
    outputs: [port("out", "out", "cv")],
    params: [
      choice("wave", "Wave", WAVES, "sine"),
      log("rate", "Rate", 0.01, 40, 2, "Hz"),
      amount("rate", 0, 20, 1, "Hz"),
    ],
  },

  noise: {
    title: "Noise",
    inputs: [],
    outputs: [port("out", "out", "audio")],
    params: [choice("color", "Color", ["white", "pink"], "white")],
  },

  mixer: {
    title: "Mixer",
    inputs: [1, 2, 3, 4].map((n) => port(`in${n}`, `in ${n}`, "audio")),
    outputs: [port("out", "out", "audio")],
    params: [1, 2, 3, 4].map((n) => num(`level${n}`, `Lvl ${n}`, 0, 1, 0.8)),
  },

  vca: {
    title: "VCA",
    inputs: [port("in", "in", "audio"), port("gain", "gain", "cv")],
    outputs: [port("out", "out", "audio")],
    // Gain multiplies: out = in × gain × (CV × amount when patched, else 1).
    params: [num("gain", "Gain", 0, 1, 1), amount("gain", 0, 1, 1, "")],
  },

  vcf: {
    title: "VCF",
    inputs: [
      port("in", "in", "audio"),
      port("cutoff", "cutoff", "cv"),
      port("res", "res", "cv"),
    ],
    outputs: [port("out", "out", "audio")],
    params: [
      choice("type", "Type", ["lowpass", "highpass", "bandpass", "notch"], "lowpass"),
      log("cutoff", "Cutoff", 20, 20000, 1200, "Hz"),
      num("res", "Res", 0, 20, 1),
      amount("cutoff", 0, 6, 2, "oct"),
      amount("res", 0, 20, 5, ""),
    ],
  },

  adsr: {
    title: "ADSR",
    inputs: [port("gate", "gate", "gate")],
    outputs: [port("out", "out", "cv")],
    params: [
      log("attack", "Attack", 0.001, 5, 0.01, "s"),
      log("decay", "Decay", 0.001, 5, 0.2, "s"),
      num("sustain", "Sustain", 0, 1, 0.6),
      log("release", "Release", 0.001, 10, 0.4, "s"),
    ],
  },

  delay: {
    title: "Delay",
    inputs: [
      port("in", "in", "audio"),
      port("time", "time", "cv"),
      port("feedback", "fb", "cv"),
    ],
    outputs: [port("out", "out", "audio")],
    params: [
      log("time", "Time", 0.001, 2, 0.3, "s"),
      num("feedback", "Fdbk", 0, 0.95, 0.4),
      num("mix", "Mix", 0, 1, 0.5),
      amount("time", 0, 1, 0.1, "s"),
      amount("feedback", 0, 1, 0.3, ""),
    ],
  },

  reverb: {
    title: "Reverb",
    inputs: [port("in", "in", "audio")],
    outputs: [port("out", "out", "audio")],
    params: [
      log("size", "Size", 0.2, 8, 2, "s"),
      num("decay", "Decay", 1, 10, 3),
      num("mix", "Mix", 0, 1, 0.3),
    ],
  },

  clock: {
    title: "Clock",
    inputs: [port("rate", "rate", "cv")],
    outputs: [port("out", "out", "gate")],
    params: [log("bpm", "BPM", 20, 300, 120, "bpm"), amount("rate", 0, 120, 30, "bpm")],
  },

  sequencer: {
    title: "Sequencer",
    inputs: [port("clock", "clock", "gate"), port("reset", "reset", "gate")],
    outputs: [port("pitch", "pitch", "pitch"), port("gate", "gate", "gate")],
    columns: 8,
    // Row 1: step pitches, row 2: step on/off, row 3: length.
    params: [
      ...STEPS.map((n) => num(`pitch${n}`, `${n}`, -24, 24, 0, "st", { step: 1 })),
      ...STEPS.map((n) => toggle(`on${n}`, `${n}`, true)),
      num("length", "Length", 1, 8, 8, "", { step: 1 }),
    ],
  },

  sampleHold: {
    title: "S&H",
    inputs: [port("in", "in", "cv"), port("trig", "trig", "gate")],
    outputs: [port("out", "out", "cv")],
    params: [],
  },

  quantizer: {
    title: "Quantizer",
    inputs: [port("in", "in", "pitch")],
    outputs: [port("out", "out", "pitch")],
    params: [
      choice("scale", "Scale", SCALE_NAMES, "major"),
      num("root", "Root", 0, 11, 0, "st", { step: 1 }),
    ],
  },

  utility: {
    title: "Utility",
    inputs: [port("in", "in", "cv")],
    outputs: [port("out", "out", "cv")],
    params: [
      num("scale", "Scale", -2, 2, 1),
      num("offset", "Offset", -2, 2, 0),
      num("slew", "Slew", 0, 2, 0, "s"),
    ],
  },

  drive: {
    title: "Drive",
    inputs: [port("in", "in", "audio")],
    outputs: [port("out", "out", "audio")],
    params: [
      choice("mode", "Mode", ["soft", "fold"], "soft"),
      log("drive", "Drive", 1, 20, 2),
      num("level", "Level", 0, 1, 0.7),
    ],
  },

  scope: {
    title: "Scope",
    inputs: [port("in", "in", "audio")],
    outputs: [],
    params: [num("zoom", "Zoom", 1, 16, 4, "x", { step: 1 })],
  },

  output: {
    title: "Output",
    inputs: [port("l", "L/mono", "audio"), port("r", "R", "audio")],
    outputs: [],
    params: [num("volume", "Volume", 0, 1, 0.5)],
  },
};

export const defaultParams = (type) =>
  Object.fromEntries(MODULE_TYPES[type].params.map((p) => [p.id, p.default]));

export const findPort = (type, direction, portId) =>
  MODULE_TYPES[type]?.[direction].find((p) => p.id === portId);

export const findParam = (type, paramId) =>
  MODULE_TYPES[type]?.params.find((p) => p.id === paramId);
