// Quantizer: snaps a pitch signal (1 unit = 1 octave) to the nearest note of
// a scale. The `scale` param is an index into SCALES, in the same order as
// SCALES in modules.js (worklets cannot import from the page's modules).

const SCALES = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], // chromatic
  [0, 2, 4, 5, 7, 9, 11], // major
  [0, 2, 3, 5, 7, 8, 10], // minor
  [0, 2, 4, 7, 9], // pentatonic major
  [0, 3, 5, 7, 10], // pentatonic minor
];

const nearest = (degrees, semitone) => {
  let best = degrees[0];
  for (const d of degrees) if (Math.abs(d - semitone) < Math.abs(best - semitone)) best = d;
  return best;
};

const quantize = (pitch, degrees, root) => {
  const relative = pitch * 12 - root;
  const octave = Math.floor(relative / 12);
  const within = relative - octave * 12;
  return (octave * 12 + nearest([...degrees, 12], within) + root) / 12;
};

class QuantizerProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "scale", defaultValue: 1, minValue: 0, maxValue: SCALES.length - 1, automationRate: "k-rate" },
      { name: "root", defaultValue: 0, minValue: 0, maxValue: 11, automationRate: "k-rate" },
    ];
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0]?.[0];
    const [out] = outputs[0];
    const degrees = SCALES[Math.round(parameters.scale[0])];
    const root = Math.round(parameters.root[0]);

    for (let i = 0; i < out.length; i++) {
      out[i] = quantize(input ? input[i] : 0, degrees, root);
    }

    return true;
  }
}

registerProcessor("quantizer", QuantizerProcessor);
