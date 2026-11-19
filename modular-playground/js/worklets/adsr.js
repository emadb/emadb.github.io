// ADSR envelope driven by a gate *signal*, not by JS events, so anything
// patched into the gate input (keyboard, LFO square, a future clock) can
// trigger it. A rising edge above 0.5 starts the attack from the current
// level; a falling edge starts the release. Attack is linear; decay and
// release are exponential, reaching ~99% of their target in the set time.

const IDLE = 0;
const ATTACK = 1;
const DECAY = 2; // also sustain: decay converges on the sustain level
const RELEASE = 3;

const coefficient = (seconds) => Math.exp(-4.6 / (seconds * sampleRate));

class AdsrProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    const param = (name, defaultValue, minValue, maxValue) => ({
      name, defaultValue, minValue, maxValue, automationRate: "k-rate",
    });

    return [
      param("attack", 0.01, 0.001, 5),
      param("decay", 0.2, 0.001, 5),
      param("sustain", 0.6, 0, 1),
      param("release", 0.4, 0.001, 10),
    ];
  }

  constructor() {
    super();
    this.stage = IDLE;
    this.level = 0;
    this.gateHigh = false;
  }

  process(inputs, outputs, parameters) {
    const gate = inputs[0]?.[0];
    const out = outputs[0][0];

    const attackStep = 1 / (parameters.attack[0] * sampleRate);
    const decayCoef = coefficient(parameters.decay[0]);
    const sustain = parameters.sustain[0];
    const releaseCoef = coefficient(parameters.release[0]);

    for (let i = 0; i < out.length; i++) {
      const high = gate ? gate[i] > 0.5 : false;
      if (high && !this.gateHigh) this.stage = ATTACK;
      if (!high && this.gateHigh) this.stage = RELEASE;
      this.gateHigh = high;

      if (this.stage === ATTACK) {
        this.level += attackStep;
        if (this.level >= 1) {
          this.level = 1;
          this.stage = DECAY;
        }
      } else if (this.stage === DECAY) {
        this.level = sustain + (this.level - sustain) * decayCoef;
      } else if (this.stage === RELEASE) {
        this.level *= releaseCoef;
        if (this.level < 1e-4) {
          this.level = 0;
          this.stage = IDLE;
        }
      }

      out[i] = this.level;
    }

    return true;
  }
}

registerProcessor("adsr", AdsrProcessor);
