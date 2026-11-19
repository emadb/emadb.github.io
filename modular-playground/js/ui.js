// Patching UI: draws modules as absolutely positioned blocks and cables as
// SVG curves. render(patch) is incremental (keyed by module id), so a knob
// being dragged keeps its element. All edits go out through `dispatch` as
// patch commands; this file never touches audio.

import { MODULE_TYPES } from "./modules.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const KNOB_SWEEP = 270; // degrees
const DRAG_PIXELS = 160; // vertical pixels for a full knob turn

const svg = (tag, attrs = {}) => {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
};

const html = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

// ---------- value mapping and formatting (pure) ----------

const clamp01 = (n) => Math.min(1, Math.max(0, n));

export const toNorm = (def, value) =>
  def.scale === "log"
    ? Math.log(value / def.min) / Math.log(def.max / def.min)
    : (value - def.min) / (def.max - def.min);

export const fromNorm = (def, norm) => {
  const value = def.scale === "log"
    ? def.min * Math.pow(def.max / def.min, norm)
    : def.min + norm * (def.max - def.min);
  return def.step ? Math.round(value / def.step) * def.step : value;
};

export const formatValue = (def, value) => {
  const fixed = (n) => (Math.abs(n) >= 100 ? n.toFixed(0) : Math.abs(n) >= 10 ? n.toFixed(1) : n.toFixed(2));

  if (def.unit === "Hz" && value >= 1000) return `${fixed(value / 1000)} kHz`;
  if (def.unit === "s" && value < 1) return `${fixed(value * 1000)} ms`;
  if (def.step) return `${value > 0 && def.min < 0 ? "+" : ""}${value} ${def.unit}`.trim();
  return `${fixed(value)} ${def.unit}`.trim();
};

// ---------- knob ----------

const arcPath = (from, to, r = 14, c = 18) => {
  const point = (deg) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return `${c + r * Math.cos(rad)} ${c + r * Math.sin(rad)}`;
  };
  const large = Math.abs(to - from) > 180 ? 1 : 0;
  const sweep = to > from ? 1 : 0;
  return `M ${point(from)} A ${r} ${r} 0 ${large} ${sweep} ${point(to)}`;
};

const createKnob = (def, onChange) => {
  const root = html("div", `knob${def.amountFor ? " knob-amount" : ""}`);
  root.title = def.amountFor ? `Amount of the "${def.amountFor}" input` : def.label;

  const label = html("span", "knob-label", def.label);
  const dial = svg("svg", { viewBox: "0 0 36 36", class: "knob-dial" });
  const start = -KNOB_SWEEP / 2;
  dial.append(svg("path", { d: arcPath(start, -start), class: "knob-track" }));
  const arc = svg("path", { class: "knob-value" });
  const needle = svg("line", { x1: 18, y1: 18, x2: 18, y2: 7, class: "knob-needle" });
  dial.append(arc, needle);
  const readout = html("span", "knob-readout mono");
  root.append(label, dial, readout);

  let current = def.default;

  const update = (value) => {
    current = value;
    const deg = start + clamp01(toNorm(def, value)) * KNOB_SWEEP;
    const origin = def.min < 0 && def.max > 0 ? start + toNorm(def, 0) * KNOB_SWEEP : start;
    arc.setAttribute("d", Math.abs(deg - origin) < 0.5 ? "" : arcPath(Math.min(origin, deg), Math.max(origin, deg)));
    needle.setAttribute("transform", `rotate(${deg} 18 18)`);
    readout.textContent = formatValue(def, value);
  };

  dial.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    dial.setPointerCapture(event.pointerId);
    const startY = event.clientY;
    const startNorm = clamp01(toNorm(def, current));

    const move = (e) => {
      const scale = e.shiftKey ? 0.1 : 1;
      onChange(fromNorm(def, clamp01(startNorm + ((startY - e.clientY) / DRAG_PIXELS) * scale)));
    };
    const up = () => {
      dial.removeEventListener("pointermove", move);
      dial.removeEventListener("pointerup", up);
    };
    dial.addEventListener("pointermove", move);
    dial.addEventListener("pointerup", up);
  });

  dial.addEventListener("dblclick", () => onChange(def.default));

  update(def.default);
  return { root, update };
};

const createChoice = (def, onChange) => {
  const root = html("label", "choice");
  root.append(html("span", "knob-label", def.label));
  const select = html("select", "choice-select");
  for (const option of def.options) {
    const node = html("option", "", option);
    node.value = option;
    select.append(node);
  }
  select.addEventListener("change", () => onChange(select.value));
  root.append(select);
  return { root, update: (value) => { select.value = value; } };
};

const createToggle = (def, onChange) => {
  const root = html("div", "toggle");
  const button = html("button", "toggle-button", def.label);
  button.type = "button";
  let current = def.default;
  button.addEventListener("click", () => onChange(!current));
  root.append(button);

  const update = (value) => {
    current = value;
    button.setAttribute("aria-pressed", String(value));
  };
  return { root, update };
};

const WIDGETS = { choice: createChoice, toggle: createToggle };

// ---------- module block ----------

const createPort = (moduleId, direction, port) => {
  const root = html("div", `port port-${direction}`);
  root.dataset.module = moduleId;
  root.dataset.port = port.id;
  root.dataset.direction = direction;
  root.dataset.signal = port.signal;
  const jack = html("span", "jack");
  jack.title = `${port.label} (${port.signal})`;
  root.append(jack, html("span", "port-label", port.label));
  return root;
};

const createModule = (module, dispatch) => {
  const type = MODULE_TYPES[module.type];
  const root = html("section", "module");
  root.dataset.id = module.id;
  root.dataset.type = module.type;

  const title = html("header", "module-title");
  title.append(html("span", "", type.title));
  const close = html("button", "module-close", "×");
  close.type = "button";
  close.title = "Remove module";
  close.addEventListener("click", () => dispatch({ type: "removeModule", id: module.id }));
  title.append(close);

  const body = html("div", "module-body");
  const inputs = html("div", "ports ports-in");
  type.inputs.forEach((p) => inputs.append(createPort(module.id, "in", p)));
  const outputs = html("div", "ports ports-out");
  type.outputs.forEach((p) => outputs.append(createPort(module.id, "out", p)));

  const controls = html("div", "controls");
  controls.style.setProperty("--cols", type.columns ?? Math.min(3, type.params.length));
  const widgets = new Map();
  for (const def of type.params) {
    const set = (value) => dispatch({ type: "setParam", id: module.id, param: def.id, value });
    const widget = (WIDGETS[def.kind] ?? createKnob)(def, set);
    widgets.set(def.id, widget);
    controls.append(widget.root);
  }

  const center = html("div", "module-center");
  center.append(controls);
  let canvas = null;
  if (module.type === "scope") {
    canvas = html("canvas", "scope-canvas");
    canvas.width = 360;
    canvas.height = 140;
    center.prepend(canvas);
  }

  body.append(inputs, center, outputs);
  root.append(title, body);

  return { root, title, widgets, canvas, params: null };
};

// ---------- cables ----------

const cablePath = (a, b) => {
  const dx = Math.max(40, Math.abs(b.x - a.x) / 2);
  return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y + 20}, ${b.x - dx} ${b.y + 20}, ${b.x} ${b.y}`;
};

// ---------- view ----------

export const createView = ({ workspace, modulesLayer, cablesLayer, dispatch, onStatus = () => {} }) => {
  const blocks = new Map(); // module id -> block
  let patch = null;

  const jackCenter = (moduleId, direction, port) => {
    const jack = modulesLayer.querySelector(
      `.port[data-module="${moduleId}"][data-direction="${direction}"][data-port="${port}"] .jack`,
    );
    if (!jack) return null;
    const box = jack.getBoundingClientRect();
    const origin = modulesLayer.getBoundingClientRect();
    return { x: box.left + box.width / 2 - origin.left, y: box.top + box.height / 2 - origin.top };
  };

  const signalOf = (moduleId, port) => {
    const module = patch.modules.find((m) => m.id === moduleId);
    return MODULE_TYPES[module.type].outputs.find((p) => p.id === port).signal;
  };

  const drawCables = (draft = null) => {
    cablesLayer.replaceChildren();
    for (const cable of patch.cables) {
      const a = jackCenter(cable.from.id, "out", cable.from.port);
      const b = jackCenter(cable.to.id, "in", cable.to.port);
      if (!a || !b) continue;

      const d = cablePath(a, b);
      const group = svg("g", { class: "cable", "data-signal": signalOf(cable.from.id, cable.from.port) });
      const hit = svg("path", { d, class: "cable-hit" });
      hit.addEventListener("click", () => dispatch({ type: "disconnect", id: cable.id }));
      group.append(svg("title"), svg("path", { d, class: "cable-line" }), hit);
      group.firstChild.textContent = "Click to remove";
      cablesLayer.append(group);
    }

    if (draft) {
      const d = draft.reversed ? cablePath(draft.to, draft.from) : cablePath(draft.from, draft.to);
      const group = svg("g", { class: "cable cable-draft", "data-signal": draft.signal });
      group.append(svg("path", { d, class: "cable-line" }));
      cablesLayer.append(group);
    }
  };

  const fitLayers = () => {
    const right = Math.max(0, ...[...blocks.values()].map((b) => b.root.offsetLeft + b.root.offsetWidth));
    const bottom = Math.max(0, ...[...blocks.values()].map((b) => b.root.offsetTop + b.root.offsetHeight));
    const width = Math.max(workspace.clientWidth, right + 200);
    const height = Math.max(workspace.clientHeight, bottom + 200);
    for (const layer of [modulesLayer, cablesLayer]) {
      layer.style.width = `${width}px`;
      layer.style.height = `${height}px`;
    }
  };

  const render = (next) => {
    patch = next;
    const ids = new Set(patch.modules.map((m) => m.id));

    for (const [id, block] of blocks) {
      if (!ids.has(id)) {
        block.root.remove();
        blocks.delete(id);
      }
    }

    for (const module of patch.modules) {
      let block = blocks.get(module.id);
      if (!block) {
        block = createModule(module, dispatch);
        enableDrag(block, module.id);
        blocks.set(module.id, block);
        modulesLayer.append(block.root);
      }

      block.root.style.left = `${module.x}px`;
      block.root.style.top = `${module.y}px`;
      if (block.params !== module.params) {
        for (const [id, value] of Object.entries(module.params)) block.widgets.get(id)?.update(value);
        block.params = module.params;
      }
    }

    fitLayers();
    drawCables();
  };

  // Module dragging by its title bar.
  const enableDrag = (block, id) => {
    block.title.addEventListener("pointerdown", (event) => {
      if (event.target.closest("button")) return;
      event.preventDefault();
      modulesLayer.append(block.root); // bring to front; before capture, which a DOM move would drop
      block.title.setPointerCapture(event.pointerId);
      const module = patch.modules.find((m) => m.id === id);
      const offset = { x: event.clientX - module.x, y: event.clientY - module.y };

      const move = (e) => dispatch({
        type: "moveModule",
        id,
        x: Math.max(0, Math.round(e.clientX - offset.x)),
        y: Math.max(0, Math.round(e.clientY - offset.y)),
      });
      const up = () => {
        block.title.removeEventListener("pointermove", move);
        block.title.removeEventListener("pointerup", up);
      };
      block.title.addEventListener("pointermove", move);
      block.title.addEventListener("pointerup", up);
    });
  };

  // Cable drawing: drag from any jack and drop on a jack of the other
  // direction. Starting from an input works too; the ends are swapped.
  modulesLayer.addEventListener("pointerdown", (event) => {
    const jack = event.target.closest(".jack");
    if (!jack) return;
    event.preventDefault();

    const port = jack.parentElement.dataset;
    const start = jackCenter(port.module, port.direction, port.port);
    const reversed = port.direction === "in";
    const origin = modulesLayer.getBoundingClientRect();

    const move = (e) => drawCables({
      from: start,
      to: { x: e.clientX - origin.left, y: e.clientY - origin.top },
      reversed,
      signal: reversed ? "draft" : signalOf(port.module, port.port),
    });

    const up = (e) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const target = document.elementFromPoint(e.clientX, e.clientY)?.closest(".port");
      drawCables();
      if (!target || target.dataset.direction === port.direction) {
        if (target) onStatus("Connect an output to an input.");
        return;
      }

      const a = { id: port.module, port: port.port };
      const b = { id: target.dataset.module, port: target.dataset.port };
      dispatch({ type: "connect", from: reversed ? b : a, to: reversed ? a : b });
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  });

  // Redraws from scratch: used when a whole new patch is loaded, because its
  // ids may collide with the ones on screen (same as engine.reset).
  const reset = (next) => {
    for (const block of blocks.values()) block.root.remove();
    blocks.clear();
    render(next);
  };

  window.addEventListener("resize", () => patch && render(patch));

  const scopeCanvases = () =>
    [...blocks.entries()].filter(([, b]) => b.canvas).map(([id, b]) => ({ id, canvas: b.canvas }));

  return { render, reset, scopeCanvases };
};
