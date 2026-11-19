// Patch core: the patch is plain JSON, and every change goes through a
// command that is validated against the current patch and returns a new one.
// No DOM and no Web Audio here, so the same functions serve the UI, the
// presets and the JSON import.
//
// Patch shape:
//   { modules: [{ id, type, params, x, y }],
//     cables:  [{ id, from: { id, port }, to: { id, port } }],
//     nextId }

import { MODULE_TYPES, defaultParams, findPort, findParam } from "./modules.js";

export const emptyPatch = () => ({ modules: [], cables: [], nextId: 1 });

const ok = (patch, extra = {}) => ({ ok: true, patch, ...extra });
const fail = (error) => ({ ok: false, error });

const findModule = (patch, id) => patch.modules.find((m) => m.id === id);

const clampParam = (def, value) => {
  if (def.kind === "choice") return def.options.includes(value) ? value : null;
  if (def.kind === "toggle") return typeof value === "boolean" ? value : null;
  if (typeof value !== "number" || Number.isNaN(value)) return null;

  const clamped = Math.min(def.max, Math.max(def.min, value));
  return def.step ? Math.round(clamped / def.step) * def.step : clamped;
};

const addModule = (patch, { moduleType, x = 0, y = 0 }) => {
  if (!MODULE_TYPES[moduleType]) return fail(`unknown module type "${moduleType}"`);

  const id = `m${patch.nextId}`;
  const module = { id, type: moduleType, params: defaultParams(moduleType), x, y };
  return ok({ ...patch, modules: [...patch.modules, module], nextId: patch.nextId + 1 }, { id });
};

const removeModule = (patch, { id }) => {
  if (!findModule(patch, id)) return fail(`unknown module "${id}"`);

  return ok({
    ...patch,
    modules: patch.modules.filter((m) => m.id !== id),
    cables: patch.cables.filter((c) => c.from.id !== id && c.to.id !== id),
  });
};

const moveModule = (patch, { id, x, y }) => {
  if (!findModule(patch, id)) return fail(`unknown module "${id}"`);

  return ok({
    ...patch,
    modules: patch.modules.map((m) => (m.id === id ? { ...m, x, y } : m)),
  });
};

const setParam = (patch, { id, param, value }) => {
  const module = findModule(patch, id);
  if (!module) return fail(`unknown module "${id}"`);

  const def = findParam(module.type, param);
  if (!def) return fail(`module "${id}" has no param "${param}"`);

  const clamped = clampParam(def, value);
  if (clamped === null) return fail(`invalid value for "${param}": ${value}`);

  const params = { ...module.params, [param]: clamped };
  return ok({
    ...patch,
    modules: patch.modules.map((m) => (m.id === id ? { ...m, params } : m)),
  });
};

const sameEnd = (a, b) => a.id === b.id && a.port === b.port;

const connect = (patch, { from, to }) => {
  const source = findModule(patch, from.id);
  const target = findModule(patch, to.id);
  if (!source || !target) return fail("cable end on an unknown module");

  if (!findPort(source.type, "outputs", from.port)) {
    return fail(`"${from.port}" is not an output of ${source.type}`);
  }
  if (!findPort(target.type, "inputs", to.port)) {
    return fail(`"${to.port}" is not an input of ${target.type}`);
  }

  const duplicate = patch.cables.some((c) => sameEnd(c.from, from) && sameEnd(c.to, to));
  if (duplicate) return fail("these ports are already connected");

  const id = `c${patch.nextId}`;
  const cable = { id, from: { ...from }, to: { ...to } };
  return ok({ ...patch, cables: [...patch.cables, cable], nextId: patch.nextId + 1 }, { id });
};

const disconnect = (patch, { id }) => {
  if (!patch.cables.some((c) => c.id === id)) return fail(`unknown cable "${id}"`);

  return ok({ ...patch, cables: patch.cables.filter((c) => c.id !== id) });
};

const COMMANDS = { addModule, removeModule, moveModule, setParam, connect, disconnect };

// Returns { ok: true, patch, id? } or { ok: false, error }. Never mutates.
export const applyCommand = (patch, command) => {
  const handler = COMMANDS[command.type];
  return handler ? handler(patch, command) : fail(`unknown command "${command.type}"`);
};

// Rebuilds a patch from untrusted JSON (import, localStorage) by replaying
// it as commands, so a loaded patch passes the same validation as one built
// by hand. Unknown or invalid params are dropped; ids are reassigned.
export const parsePatch = (json) => {
  if (!json || !Array.isArray(json.modules) || !Array.isArray(json.cables)) {
    return fail("not a patch: missing modules or cables");
  }

  let patch = emptyPatch();
  const idMap = new Map();

  for (const m of json.modules) {
    const added = addModule(patch, { moduleType: m.type, x: Number(m.x) || 0, y: Number(m.y) || 0 });
    if (!added.ok) return added;
    patch = added.patch;
    idMap.set(m.id, added.id);

    for (const [param, value] of Object.entries(m.params ?? {})) {
      const set = setParam(patch, { id: added.id, param, value });
      if (set.ok) patch = set.patch;
    }
  }

  for (const c of json.cables) {
    const from = { id: idMap.get(c.from?.id), port: c.from?.port };
    const to = { id: idMap.get(c.to?.id), port: c.to?.port };
    const connected = connect(patch, { from, to });
    if (!connected.ok) return connected;
    patch = connected.patch;
  }

  return ok(patch);
};
