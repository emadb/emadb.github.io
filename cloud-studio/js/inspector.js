// The inspector edits the selected cloud. Controls are generated from a field
// schema so a new cloud parameter costs one line here, not a block of markup
// plus a listener.

import { ENVELOPE_TYPES, GLIDE_MODES, WAVEFORM_TYPES } from "./synth.js";

const FIELDS = [
  { group: "Region" },
  { kind: "pair", name: "Time", unit: "s", keys: ["timeStart", "timeEnd"], min: 0, max: 60, step: 0.01 },
  { kind: "pair", name: "Freq", unit: "Hz", keys: ["freqLow", "freqHigh"], min: 20, max: 20000, step: 1 },

  { group: "Grains" },
  { kind: "slider", name: "Density", key: "density", min: 1, max: 1000, step: 1, format: (v) => `${Math.round(v)} /s` },
  { kind: "pair", name: "Duration", unit: "ms", keys: ["durMinMs", "durMaxMs"], min: 0.5, max: 500, step: 0.5 },
  { kind: "select", name: "Envelope", key: "envelope", options: ENVELOPE_TYPES },
  { kind: "select", name: "Waveform", key: "waveform", options: WAVEFORM_TYPES },
  { kind: "select", name: "Glide", key: "glideMode", options: GLIDE_MODES },
  { kind: "slider", name: "Glide depth", key: "glideDepth", min: 0, max: 4, step: 0.1, format: (v) => `${v.toFixed(1)} oct` },

  { group: "Level & space" },
  { kind: "slider", name: "Gain", key: "gainDb", min: -60, max: 6, step: 0.5, format: (v) => `${v > 0 ? "+" : ""}${v.toFixed(1)} dB` },
  { kind: "slider", name: "Scatter", key: "scatter", min: 0, max: 1, step: 0.01, format: (v) => v.toFixed(2) },
  { kind: "slider", name: "Fade in", key: "fadeIn", min: 0, max: 0.5, step: 0.01, format: (v) => `${Math.round(v * 100)}%` },
  { kind: "slider", name: "Fade out", key: "fadeOut", min: 0, max: 0.5, step: 0.01, format: (v) => `${Math.round(v * 100)}%` },

  { group: "Cloud" },
  { kind: "number", name: "Seed", key: "seed", min: 0, max: 999999, step: 1 },
  { kind: "check", name: "Muted", key: "muted" },
];

const el = (tag, className, props = {}) => Object.assign(document.createElement(tag), { className, ...props });

function numberInput(field, onCommit) {
  const input = el("input", "mono", { type: "number", min: field.min, max: field.max, step: field.step });
  // Committed on change, not on input: clamping every keystroke fights typing.
  input.addEventListener("change", () => {
    const v = Number(input.value);
    if (Number.isFinite(v)) onCommit(v);
  });
  return input;
}

function buildPair(field, patch) {
  const row = el("div", "field-row");
  row.append(el("span", "field-name", { textContent: field.name }));

  const control = el("div", "field-control");
  const inputs = field.keys.map((key) => numberInput(field, (v) => patch(key, v)));
  control.append(inputs[0], el("span", "field-sep", { textContent: "–" }), inputs[1]);
  control.append(el("span", "field-unit mono", { textContent: field.unit }));
  row.append(control);

  return { row, sync: (c) => inputs.forEach((input, i) => (input.value = round(c[field.keys[i]]))) };
}

function buildSlider(field, patch) {
  const row = el("div", "slider-row");
  const head = el("div", "slider-head");
  const value = el("span", "slider-value mono");
  head.append(el("span", "field-name", { textContent: field.name }), value);

  const input = el("input", "", { type: "range", min: field.min, max: field.max, step: field.step });
  input.addEventListener("input", () => patch(field.key, Number(input.value)));
  row.append(head, input);

  return {
    row,
    sync: (c) => {
      input.value = c[field.key];
      value.textContent = field.format(c[field.key]);
    },
  };
}

function buildSelect(field, patch) {
  const row = el("div", "field-row");
  row.append(el("span", "field-name", { textContent: field.name }));

  const select = el("select", "");
  select.append(...field.options.map((o) => el("option", "", { value: o, textContent: o })));
  select.addEventListener("change", () => patch(field.key, select.value));

  const control = el("div", "field-control");
  control.append(select);
  row.append(control);

  return { row, sync: (c) => (select.value = c[field.key]) };
}

function buildNumber(field, patch) {
  const row = el("div", "field-row");
  row.append(el("span", "field-name", { textContent: field.name }));

  const input = numberInput(field, (v) => patch(field.key, v));
  const control = el("div", "field-control");
  control.append(input);
  row.append(control);

  return { row, sync: (c) => (input.value = c[field.key]) };
}

function buildCheck(field, patch) {
  const row = el("div", "field-row");
  row.append(el("span", "field-name", { textContent: field.name }));

  const input = el("input", "", { type: "checkbox" });
  input.addEventListener("change", () => patch(field.key, input.checked));

  const control = el("div", "field-control");
  control.append(input);
  row.append(control);

  return { row, sync: (c) => (input.checked = !!c[field.key]) };
}

const BUILDERS = { pair: buildPair, slider: buildSlider, select: buildSelect, number: buildNumber, check: buildCheck };

// Enough precision to be exact without showing 900.0000000001.
const round = (v) => Math.round(v * 1000) / 1000;

export function initInspector(root, getState, actions) {
  const title = root.querySelector(".inspector-title");
  const empty = root.querySelector(".inspector-empty");
  const fields = root.querySelector(".inspector-fields");

  const patch = (key, value) => {
    const id = getState().selectedId;
    if (id) actions.patch(id, { [key]: value });
  };

  const controls = [];
  for (const field of FIELDS) {
    if (field.group) {
      fields.append(el("h3", "field-group", { textContent: field.group }));
      continue;
    }
    const built = BUILDERS[field.kind](field, patch);
    fields.append(built.row);
    controls.push(built);
  }

  function update() {
    const state = getState();
    const cloud = state.clouds.find((c) => c.id === state.selectedId);

    empty.hidden = !!cloud;
    fields.hidden = !cloud;
    title.textContent = cloud ? `Cloud ${state.clouds.indexOf(cloud) + 1}` : "Cloud";
    if (cloud) controls.forEach((c) => c.sync(cloud));
  }

  return { update };
}
