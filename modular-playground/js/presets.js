// Starter patches, written as plain patch JSON and loaded through
// parsePatch like any imported file. Params left out keep their defaults.

const m = (id, type, x, y, params = {}) => ({ id, type, x, y, params });
const c = (from, fromPort, to, toPort) => ({
  from: { id: from, port: fromPort },
  to: { id: to, port: toPort },
});

export const PRESETS = {
  "Subtractive voice": {
    modules: [
      m("kb", "keyboard", 40, 40),
      m("osc", "vco", 40, 200, { wave: "sawtooth" }),
      m("env", "adsr", 330, 40, { attack: 0.005, decay: 0.3, sustain: 0.4, release: 0.5 }),
      m("flt", "vcf", 330, 230, { cutoff: 300, res: 8, cutoffAmt: 3.5 }),
      m("amp", "vca", 680, 230, { gain: 1, gainAmt: 1 }),
      m("out", "output", 960, 230, { volume: 0.5 }),
      m("scp", "scope", 680, 420),
    ],
    cables: [
      c("kb", "pitch", "osc", "pitch"),
      c("kb", "gate", "env", "gate"),
      c("osc", "out", "flt", "in"),
      c("env", "out", "flt", "cutoff"),
      c("flt", "out", "amp", "in"),
      c("env", "out", "amp", "gain"),
      c("amp", "out", "out", "l"),
      c("amp", "out", "scp", "in"),
    ],
  },

  "Drone with LFOs": {
    modules: [
      m("o1", "vco", 40, 40, { wave: "sawtooth", tune: 110 }),
      m("o2", "vco", 40, 250, { wave: "sawtooth", tune: 110, fine: 9, fmAmt: 3 }),
      m("l1", "lfo", 40, 460, { wave: "sine", rate: 0.12 }),
      m("l2", "lfo", 370, 460, { wave: "triangle", rate: 0.31 }),
      m("mix", "mixer", 370, 40, { level1: 0.6, level2: 0.6, level3: 0, level4: 0 }),
      m("flt", "vcf", 700, 40, { cutoff: 500, res: 9, cutoffAmt: 2 }),
      m("dly", "delay", 700, 300, { time: 0.45, feedback: 0.55, mix: 0.4 }),
      m("out", "output", 1030, 300, { volume: 0.4 }),
    ],
    cables: [
      c("o1", "out", "mix", "in1"),
      c("o2", "out", "mix", "in2"),
      c("mix", "out", "flt", "in"),
      c("l1", "out", "flt", "cutoff"),
      c("l2", "out", "o2", "fm"),
      c("flt", "out", "dly", "in"),
      c("dly", "out", "out", "l"),
    ],
  },

  "Feedback delay": {
    modules: [
      m("kb", "keyboard", 40, 40),
      m("osc", "vco", 40, 200, { wave: "square" }),
      m("env", "adsr", 370, 40, { attack: 0.002, decay: 0.15, sustain: 0, release: 0.1 }),
      m("amp", "vca", 370, 260, { gain: 1, gainAmt: 1 }),
      m("mix", "mixer", 700, 40, { level1: 0.8, level2: 0.7, level3: 0, level4: 0 }),
      m("dly", "delay", 1030, 40, { time: 0.375, feedback: 0.2, mix: 1 }),
      m("flt", "vcf", 700, 260, { type: "bandpass", cutoff: 1500, res: 3 }),
      m("lfo", "lfo", 370, 480, { rate: 0.2 }),
      m("out", "output", 1030, 260, { volume: 0.4 }),
    ],
    cables: [
      c("kb", "pitch", "osc", "pitch"),
      c("kb", "gate", "env", "gate"),
      c("osc", "out", "amp", "in"),
      c("env", "out", "amp", "gain"),
      c("amp", "out", "mix", "in1"),
      c("mix", "out", "dly", "in"),
      c("dly", "out", "flt", "in"),
      c("flt", "out", "mix", "in2"),
      c("lfo", "out", "flt", "cutoff"),
      c("dly", "out", "out", "l"),
    ],
  },
};
