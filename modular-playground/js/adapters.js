// Audio adapters: one factory per module type that builds its Web Audio
// nodes. Each adapter exposes:
//   inputs / outputs  port id -> AudioNode (cables connect to these)
//   setParam(id, value, immediate)
//   destroy()
// A modulation input is a GainNode (the attenuverter) wired into an
// AudioParam, so a cable always lands on an AudioNode and patched signals
// sum with the knob value.

import { SCALES } from "./modules.js";

const GLIDE = 0.015; // seconds; time constant for knob changes, avoids clicks

const smooth = (ctx, param, value, immediate) =>
  immediate
    ? param.setValueAtTime(value, ctx.currentTime)
    : param.setTargetAtTime(value, ctx.currentTime, GLIDE);

const gain = (ctx, value = 1) => new GainNode(ctx, { gain: value });

const modInput = (ctx, target) => {
  const node = gain(ctx, 0);
  node.connect(target);
  return node;
};

// bind: param id -> AudioParam | (value, immediate) => void
const adapter = (ctx, params, { inputs = {}, outputs = {}, bind = {}, nodes = [], sources = [], ...extra }) => {
  const setParam = (id, value, immediate = false) => {
    const target = bind[id];
    if (target instanceof AudioParam) smooth(ctx, target, value, immediate);
    else target?.(value, immediate);
  };

  for (const [id, value] of Object.entries(params)) setParam(id, value, true);
  for (const source of sources) source.start();

  const owned = new Set([...nodes, ...sources, ...Object.values(inputs), ...Object.values(outputs)]);
  const destroy = () => {
    for (const source of sources) source.stop();
    for (const node of owned) node.disconnect();
    extra.onDestroy?.();
  };

  return { inputs, outputs, setParam, destroy, ...extra };
};

const keyboard = (ctx, params) => {
  const pitch = new ConstantSourceNode(ctx, { offset: 0 });
  const gate = new ConstantSourceNode(ctx, { offset: 0 });
  let octave = 0;
  let note = 0; // semitones from C4

  const setPitch = () => pitch.offset.setValueAtTime(octave + note / 12, ctx.currentTime);

  return adapter(ctx, params, {
    outputs: { pitch, gate },
    sources: [pitch, gate],
    bind: { octave: (value) => { octave = value; setPitch(); } },
    noteOn: (semitone) => {
      note = semitone;
      setPitch();
      gate.offset.setValueAtTime(1, ctx.currentTime);
    },
    noteOff: () => gate.offset.setValueAtTime(0, ctx.currentTime),
  });
};

const vco = (ctx, params) => {
  const osc = new OscillatorNode(ctx);
  const pitch = gain(ctx, 1200); // 1 unit = 1 octave = 1200 cents
  pitch.connect(osc.detune);
  const fm = modInput(ctx, osc.frequency);

  return adapter(ctx, params, {
    inputs: { pitch, fm },
    outputs: { out: osc },
    sources: [osc],
    bind: {
      wave: (value) => { osc.type = value; },
      tune: osc.frequency,
      fine: osc.detune,
      fmAmt: fm.gain,
    },
  });
};

const lfo = (ctx, params) => {
  const osc = new OscillatorNode(ctx);
  const rate = modInput(ctx, osc.frequency);

  return adapter(ctx, params, {
    inputs: { rate },
    outputs: { out: osc },
    sources: [osc],
    bind: { wave: (value) => { osc.type = value; }, rate: osc.frequency, rateAmt: rate.gain },
  });
};

const NOISE_SECONDS = 4;
const noiseBuffers = new WeakMap(); // AudioContext -> { white, pink }

const makeNoise = (ctx) => {
  const length = NOISE_SECONDS * ctx.sampleRate;
  const white = new AudioBuffer({ length, sampleRate: ctx.sampleRate });
  const pink = new AudioBuffer({ length, sampleRate: ctx.sampleRate });
  const w = white.getChannelData(0);
  const p = pink.getChannelData(0);

  // Paul Kellet's economy pink filter.
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < length; i++) {
    w[i] = Math.random() * 2 - 1;
    b0 = 0.99765 * b0 + w[i] * 0.099046;
    b1 = 0.963 * b1 + w[i] * 0.2965164;
    b2 = 0.57 * b2 + w[i] * 1.0526913;
    p[i] = (b0 + b1 + b2 + w[i] * 0.1848) * 0.2;
  }

  return { white, pink };
};

const noise = (ctx, params) => {
  if (!noiseBuffers.has(ctx)) noiseBuffers.set(ctx, makeNoise(ctx));
  const out = gain(ctx);
  let source = null;

  const setColor = (color) => {
    source?.stop();
    source = new AudioBufferSourceNode(ctx, { buffer: noiseBuffers.get(ctx)[color], loop: true });
    source.connect(out);
    source.start();
  };

  return adapter(ctx, params, {
    outputs: { out },
    bind: { color: setColor },
    onDestroy: () => source?.stop(),
  });
};

const mixer = (ctx, params) => {
  const out = gain(ctx);
  const levels = [1, 2, 3, 4].map(() => gain(ctx));
  levels.forEach((level) => level.connect(out));

  return adapter(ctx, params, {
    inputs: Object.fromEntries(levels.map((level, i) => [`in${i + 1}`, level])),
    outputs: { out },
    bind: Object.fromEntries(levels.map((level, i) => [`level${i + 1}`, level.gain])),
  });
};

// The Gain knob is a level, not an offset: with nothing in the `gain` input
// the VCA is open (normalled to 1, as on Eurorack VCAs); with a cable it is
// closed until the CV opens it, so an envelope fully shapes the note.
const vca = (ctx, params) => {
  const level = gain(ctx);
  const amp = gain(ctx, 1);
  const cv = modInput(ctx, amp.gain);
  level.connect(amp);

  return adapter(ctx, params, {
    inputs: { in: level, gain: cv },
    outputs: { out: amp },
    bind: { gain: level.gain, gainAmt: cv.gain },
    onInputs: (connected) => smooth(ctx, amp.gain, connected.has("gain") ? 0 : 1, false),
  });
};

const vcf = (ctx, params) => {
  const filter = new BiquadFilterNode(ctx);
  const cutoff = modInput(ctx, filter.detune); // octaves -> cents, so sweeps are musical
  const res = modInput(ctx, filter.Q);

  return adapter(ctx, params, {
    inputs: { in: filter, cutoff, res },
    outputs: { out: filter },
    bind: {
      type: (value) => { filter.type = value; },
      cutoff: filter.frequency,
      res: filter.Q,
      cutoffAmt: (value, immediate) => smooth(ctx, cutoff.gain, value * 1200, immediate),
      resAmt: res.gain,
    },
  });
};

const adsr = (ctx, params) => {
  const node = new AudioWorkletNode(ctx, "adsr", {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [1],
  });

  return adapter(ctx, params, {
    inputs: { gate: node },
    outputs: { out: node },
    bind: Object.fromEntries(["attack", "decay", "sustain", "release"].map((id) => [id, node.parameters.get(id)])),
  });
};

const delay = (ctx, params) => {
  const input = gain(ctx);
  const line = new DelayNode(ctx, { maxDelayTime: 4 });
  const dry = gain(ctx);
  const wet = gain(ctx);
  const feedback = gain(ctx, 0);
  const out = gain(ctx);

  input.connect(dry).connect(out);
  input.connect(line).connect(wet).connect(out);
  line.connect(feedback).connect(line);

  const time = modInput(ctx, line.delayTime);
  const fb = modInput(ctx, feedback.gain);

  return adapter(ctx, params, {
    inputs: { in: input, time, feedback: fb },
    outputs: { out },
    nodes: [line, dry, wet, feedback],
    bind: {
      time: line.delayTime,
      feedback: feedback.gain,
      mix: (value, immediate) => {
        smooth(ctx, dry.gain, 1 - value, immediate);
        smooth(ctx, wet.gain, value, immediate);
      },
      timeAmt: time.gain,
      feedbackAmt: fb.gain,
    },
  });
};

// Cables always use input/output index 0, so a worklet with several inputs
// or outputs gets one GainNode per port, wired to the right index.
const inputPort = (ctx, node, index) => {
  const port = gain(ctx);
  port.connect(node, 0, index);
  return port;
};

const outputPort = (ctx, node, index) => {
  const port = gain(ctx);
  node.connect(port, index);
  return port;
};

const impulseResponse = (ctx, seconds, decay) => {
  const length = Math.round(seconds * ctx.sampleRate);
  const buffer = new AudioBuffer({ numberOfChannels: 2, length, sampleRate: ctx.sampleRate });
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return buffer;
};

const IR_DELAY = 150; // ms; knob drags would otherwise rebuild a long buffer per event

const reverb = (ctx, params) => {
  const input = gain(ctx);
  const convolver = new ConvolverNode(ctx);
  const dry = gain(ctx);
  const wet = gain(ctx);
  const out = gain(ctx);
  input.connect(dry).connect(out);
  input.connect(convolver).connect(wet).connect(out);

  const shape = { size: params.size, decay: params.decay };
  let timer = null;
  const rebuild = () => { convolver.buffer = impulseResponse(ctx, shape.size, shape.decay); };
  const reshape = (key) => (value, immediate) => {
    shape[key] = value;
    clearTimeout(timer);
    if (immediate) rebuild();
    else timer = setTimeout(rebuild, IR_DELAY);
  };

  return adapter(ctx, params, {
    inputs: { in: input },
    outputs: { out },
    nodes: [convolver, dry, wet],
    bind: {
      size: reshape("size"),
      decay: reshape("decay"),
      mix: (value, immediate) => {
        smooth(ctx, dry.gain, 1 - value, immediate);
        smooth(ctx, wet.gain, value, immediate);
      },
    },
    onDestroy: () => clearTimeout(timer),
  });
};

// A sine through a sign-shaped curve: a clean 0/1 square with a 50% duty
// cycle (an OscillatorNode square is band-limited and rings around 0 and 1).
const clock = (ctx, params) => {
  const osc = new OscillatorNode(ctx, { type: "sine" });
  const step = new WaveShaperNode(ctx, {
    curve: Float32Array.from({ length: 1025 }, (_, i) => (i < 512 ? 0 : 1)),
  });
  osc.connect(step);
  const rate = modInput(ctx, osc.frequency);

  return adapter(ctx, params, {
    inputs: { rate },
    outputs: { out: step },
    sources: [osc],
    bind: {
      bpm: (value, immediate) => smooth(ctx, osc.frequency, value / 60, immediate),
      rateAmt: (value, immediate) => smooth(ctx, rate.gain, value / 60, immediate),
    },
  });
};

const sequencer = (ctx, params) => {
  const node = new AudioWorkletNode(ctx, "sequencer", {
    numberOfInputs: 2,
    numberOfOutputs: 2,
    outputChannelCount: [1, 1],
  });
  const param = (id) => node.parameters.get(id);
  const bind = {};
  for (let n = 1; n <= 8; n++) {
    bind[`pitch${n}`] = param(`pitch${n}`);
    bind[`on${n}`] = (value) => param(`on${n}`).setValueAtTime(value ? 1 : 0, ctx.currentTime);
  }
  bind.length = param("length");

  return adapter(ctx, params, {
    inputs: { clock: inputPort(ctx, node, 0), reset: inputPort(ctx, node, 1) },
    outputs: { pitch: outputPort(ctx, node, 0), gate: outputPort(ctx, node, 1) },
    nodes: [node],
    bind,
  });
};

const sampleHold = (ctx, params) => {
  const node = new AudioWorkletNode(ctx, "sample-hold", {
    numberOfInputs: 2,
    numberOfOutputs: 1,
    outputChannelCount: [1],
  });

  return adapter(ctx, params, {
    inputs: { in: inputPort(ctx, node, 0), trig: inputPort(ctx, node, 1) },
    outputs: { out: node },
  });
};

const quantizer = (ctx, params) => {
  const node = new AudioWorkletNode(ctx, "quantizer", {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [1],
  });
  const scales = Object.keys(SCALES);

  return adapter(ctx, params, {
    inputs: { in: node },
    outputs: { out: node },
    bind: {
      scale: (value) => node.parameters.get("scale").setValueAtTime(scales.indexOf(value), ctx.currentTime),
      root: node.parameters.get("root"),
    },
  });
};

// out = slew(in × scale + offset). The slew is a critically damped low-pass
// (Q = -6.02 dB, i.e. 0.5 linear: no overshoot); at 0 s it opens to Nyquist.
// A critically damped step reaches 90% after 3.89 / ω, so the knob reads as
// "time to reach 90%" with f = 3.89 / (2π × slew) ≈ 0.62 / slew.
const SLEW_90 = 3.89 / (2 * Math.PI);
const utility = (ctx, params) => {
  const input = gain(ctx);
  const offset = new ConstantSourceNode(ctx, { offset: 0 });
  const slew = new BiquadFilterNode(ctx, { type: "lowpass", Q: -6.02 });
  input.connect(slew);
  offset.connect(slew);

  return adapter(ctx, params, {
    inputs: { in: input },
    outputs: { out: slew },
    sources: [offset],
    bind: {
      scale: input.gain,
      offset: offset.offset,
      slew: (value, immediate) => {
        const hz = value > 0.001 ? SLEW_90 / value : ctx.sampleRate / 2;
        smooth(ctx, slew.frequency, hz, immediate);
      },
    },
  });
};

const CURVE_SIZE = 4096;

const driveCurve = (mode, drive) => Float32Array.from({ length: CURVE_SIZE }, (_, i) => {
  const x = (i / (CURVE_SIZE - 1)) * 2 - 1;
  return mode === "fold"
    ? Math.sin((drive * x * Math.PI) / 2)
    : Math.tanh(drive * x) / Math.tanh(drive);
});

// The drive is baked into the curve: a WaveShaper clamps inputs beyond ±1,
// so a gain stage in front of it would just clip.
const drive = (ctx, params) => {
  const shaper = new WaveShaperNode(ctx, { oversample: "4x" });
  const level = gain(ctx);
  shaper.connect(level);

  const shape = { mode: params.mode, drive: params.drive };
  const reshape = (key) => (value) => {
    shape[key] = value;
    shaper.curve = driveCurve(shape.mode, shape.drive);
  };

  return adapter(ctx, params, {
    inputs: { in: shaper },
    outputs: { out: level },
    bind: { mode: reshape("mode"), drive: reshape("drive"), level: level.gain },
  });
};

const scope = (ctx, params) => {
  const analyser = new AnalyserNode(ctx, { fftSize: 4096 });
  const sink = gain(ctx, 0); // keeps the analyser pulled by the graph
  analyser.connect(sink).connect(ctx.destination);

  return adapter(ctx, params, {
    inputs: { in: analyser },
    nodes: [sink],
    analyser,
  });
};

const output = (ctx, params) => {
  const left = gain(ctx);
  const right = gain(ctx);
  const leftToRight = gain(ctx); // mono: L feeds both sides when R is free
  const merger = new ChannelMergerNode(ctx, { numberOfInputs: 2 });
  const master = gain(ctx, 0);
  const limiter = new DynamicsCompressorNode(ctx, {
    threshold: -6, knee: 0, ratio: 20, attack: 0.003, release: 0.1,
  }); // protects ears and speakers from feedback patches

  left.connect(merger, 0, 0);
  right.connect(merger, 0, 1);
  left.connect(leftToRight).connect(merger, 0, 1);
  merger.connect(master).connect(limiter).connect(ctx.destination);

  return adapter(ctx, params, {
    inputs: { l: left, r: right },
    nodes: [leftToRight, merger, master, limiter],
    bind: { volume: master.gain },
    onInputs: (connected) => smooth(ctx, leftToRight.gain, connected.has("r") ? 0 : 1, false),
  });
};

export const ADAPTERS = {
  keyboard, vco, lfo, noise, mixer, vca, vcf, adsr, delay,
  reverb, clock, sequencer, sampleHold, quantizer, utility, drive,
  scope, output,
};
