// Sample & Hold: on each rising edge of the trigger signal (input 1) the
// output takes the current value of the input signal (input 0) and holds it
// until the next edge.

class SampleHoldProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.held = 0;
    this.trigHigh = false;
  }

  process(inputs, outputs) {
    const input = inputs[0]?.[0];
    const trig = inputs[1]?.[0];
    const [out] = outputs[0];

    for (let i = 0; i < out.length; i++) {
      const high = trig ? trig[i] > 0.5 : false;
      if (high && !this.trigHigh) this.held = input ? input[i] : 0;
      this.trigHigh = high;
      out[i] = this.held;
    }

    return true;
  }
}

registerProcessor("sample-hold", SampleHoldProcessor);
