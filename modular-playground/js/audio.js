// Audio shell: owns the AudioContext and keeps the Web Audio graph in step
// with the patch. sync(patch) diffs the patch against what is live and only
// creates, destroys, connects or retunes what changed, so turning a knob
// never rebuilds the graph.

import { ADAPTERS } from "./adapters.js";
import { feedbackCables } from "./graph.js";
import { emptyPatch } from "./patch.js";

const WORKLETS = ["adsr.js", "sequencer.js", "sample-hold.js", "quantizer.js"];

const cableKey =(c, delayed) =>
  `${c.id}:${c.from.id}.${c.from.port}>${c.to.id}.${c.to.port}${delayed ? "~" : ""}`;

export const createEngine = () => {
  let ctx = null;
  let latest = emptyPatch(); // the patch to build when power comes on
  const live = new Map(); // module id -> { module, adapter }
  const wires = new Map(); // cable key -> { source, target, delay }

  const wire = (cable, delayed) => {
    const source = live.get(cable.from.id).adapter.outputs[cable.from.port];
    const target = live.get(cable.to.id).adapter.inputs[cable.to.port];
    if (!delayed) {
      source.connect(target);
      return { source, target };
    }

    // Web Audio mutes cycles without a DelayNode; inside a cycle a zero
    // delay is clamped to one render quantum (128 samples).
    const delay = new DelayNode(ctx, { delayTime: 0 });
    source.connect(delay).connect(target);
    return { source, target: delay, delay };
  };

  const unwire = ({ source, target, delay }) => {
    try {
      source.disconnect(target);
    } catch {
      // already disconnected when its module was destroyed
    }
    delay?.disconnect();
  };

  const reconcile = (next) => {
    const feedback = feedbackCables(next);
    const nextWires = new Map(next.cables.map((c) => [cableKey(c, feedback.has(c.id)), c]));
    const nextIds = new Set(next.modules.map((m) => m.id));

    for (const [key, w] of wires) {
      if (!nextWires.has(key)) {
        unwire(w);
        wires.delete(key);
      }
    }

    for (const [id, entry] of live) {
      if (!nextIds.has(id)) {
        entry.adapter.destroy();
        live.delete(id);
      }
    }

    for (const module of next.modules) {
      const entry = live.get(module.id);
      if (!entry) {
        live.set(module.id, { module, adapter: ADAPTERS[module.type](ctx, module.params) });
        continue;
      }

      for (const [id, value] of Object.entries(module.params)) {
        if (entry.module.params[id] !== value) entry.adapter.setParam(id, value);
      }
      entry.module = module;
    }

    for (const [key, cable] of nextWires) {
      if (!wires.has(key)) wires.set(key, wire(cable, feedback.has(cable.id)));
    }

    for (const [id, { adapter }] of live) {
      const connected = new Set(next.cables.filter((c) => c.to.id === id).map((c) => c.to.port));
      adapter.onInputs?.(connected);
    }
  };

  const sync = (patch) => {
    latest = patch;
    if (ctx) reconcile(patch);
  };

  // Rebuilds from scratch: used when a whole new patch is loaded, because
  // its ids may collide with the live ones.
  const reset = (patch) => {
    if (ctx) reconcile(emptyPatch());
    sync(patch);
  };

  const power = async (on) => {
    if (on && !ctx) {
      ctx = new AudioContext();
      await Promise.all(WORKLETS.map((file) =>
        ctx.audioWorklet.addModule(new URL(`./worklets/${file}`, import.meta.url))));
      reconcile(latest);
    }
    if (ctx) await (on ? ctx.resume() : ctx.suspend());
  };

  const adaptersOf = (type) =>
    [...live.values()].filter((e) => e.module.type === type).map((e) => e.adapter);

  const adapterOf = (id) => live.get(id)?.adapter;

  return { sync, reset, power, adaptersOf, adapterOf, context: () => ctx };
};
