// 8-step sequencer advanced by the rising edge of its clock *signal* (input
// 0), so a Clock, an LFO square or the Keyboard gate can drive it. A rising
// edge on reset (input 1) makes the next clock edge play step 1. The gate
// output is high while the clock is high and the current step is on.

const STEPS = 8;
const indices = Array.from({ length: STEPS }, (_, i) => i + 1);

class SequencerProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    const param = (name, defaultValue, minValue, maxValue) => ({
      name, defaultValue, minValue, maxValue, automationRate: "k-rate",
    });

    return [
      ...indices.map((n) => param(`pitch${n}`, 0, -24, 24)),
      ...indices.map((n) => param(`on${n}`, 1, 0, 1)),
      param("length", STEPS, 1, STEPS),
    ];
  }

  constructor() {
    super();
    this.step = -1; // -1: waiting for the first clock edge
    this.clockHigh = false;
    this.resetHigh = false;
  }

  process(inputs, outputs, parameters) {
    const clock = inputs[0]?.[0];
    const reset = inputs[1]?.[0];
    const [pitchOut] = outputs[0];
    const [gateOut] = outputs[1];
    const length = Math.round(parameters.length[0]);

    for (let i = 0; i < pitchOut.length; i++) {
      const resetHigh = reset ? reset[i] > 0.5 : false;
      if (resetHigh && !this.resetHigh) this.step = -1;
      this.resetHigh = resetHigh;

      const clockHigh = clock ? clock[i] > 0.5 : false;
      if (clockHigh && !this.clockHigh) this.step = (this.step + 1) % length;
      this.clockHigh = clockHigh;

      const n = this.step + 1;
      const on = n > 0 && parameters[`on${n}`][0] > 0.5;
      pitchOut[i] = n > 0 ? parameters[`pitch${n}`][0] / 12 : 0;
      gateOut[i] = clockHigh && on ? 1 : 0;
    }

    return true;
  }
}

registerProcessor("sequencer", SequencerProcessor);
