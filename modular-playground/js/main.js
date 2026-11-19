// App state and event wiring. The patch lives here; every change goes
// through dispatch -> applyCommand -> setPatch, which then syncs the audio
// engine, the view and the autosave.

import { createEngine } from "./audio.js";
import { applyCommand, emptyPatch, parsePatch } from "./patch.js";
import { MODULE_TYPES } from "./modules.js";
import { createView } from "./ui.js";
import { startNoteInput } from "./keyboard.js";
import { startScopes } from "./scope.js";
import { loadSaved, save, exportFile, importFile } from "./storage.js";
import { PRESETS } from "./presets.js";

const $ = (id) => document.getElementById(id);

const engine = createEngine();
let patch = emptyPatch();
let powered = false;

const status = (text) => { $("status").textContent = text; };

const setPatch = (next) => {
  patch = next;
  engine.sync(patch);
  view.render(patch);
  save(patch);
};

// A whole new patch: ids may collide with the live ones, so rebuild audio.
const loadPatch = (next) => {
  patch = next;
  engine.reset(patch);
  view.reset(patch);
  save(patch);
};

const dispatch = (command) => {
  const result = applyCommand(patch, command);
  if (result.ok) setPatch(result.patch);
  else status(result.error);
  return result;
};

const view = createView({
  workspace: $("workspace"),
  modulesLayer: $("modules"),
  cablesLayer: $("cables"),
  dispatch,
  onStatus: status,
});

// ---------- toolbar ----------

for (const [type, def] of Object.entries(MODULE_TYPES)) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = def.title;
  button.title = `Add ${def.title}`;
  button.addEventListener("click", () => {
    const workspace = $("workspace");
    const step = (patch.modules.length % 6) * 24;
    dispatch({ type: "addModule", moduleType: type, x: workspace.scrollLeft + 40 + step, y: workspace.scrollTop + 40 + step });
  });
  $("palette").append(button);
}

for (const name of Object.keys(PRESETS)) {
  const option = document.createElement("option");
  option.value = name;
  option.textContent = name;
  $("preset").append(option);
}

$("preset").addEventListener("change", (event) => {
  const name = event.target.value;
  event.target.value = "";
  if (!name) return;
  loadPatch(parsePatch(PRESETS[name]).patch);
  status(`Loaded "${name}".`);
});

$("new-patch").addEventListener("click", () => {
  loadPatch(emptyPatch());
  status("New empty patch. Add modules from the toolbar.");
});

$("export").addEventListener("click", () => exportFile(patch));
$("import").addEventListener("click", () => $("import-file").click());

$("import-file").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file) return;

  const result = await importFile(file);
  if (!result.ok) {
    status(`Import failed: ${result.error}. The current patch is unchanged.`);
    return;
  }
  loadPatch(result.patch);
  status(`Imported ${file.name}.`);
});

$("power").addEventListener("click", async () => {
  powered = !powered;
  await engine.power(powered);
  $("power").setAttribute("aria-pressed", String(powered));
  status(powered ? "Audio on." : "Audio off.");
});

// ---------- notes and scopes ----------

startNoteInput({
  noteOn: (semitone) => engine.adaptersOf("keyboard").forEach((k) => k.noteOn(semitone)),
  noteOff: () => engine.adaptersOf("keyboard").forEach((k) => k.noteOff()),
});

startScopes(() => view.scopeCanvases().map(({ id, canvas }) => ({
  canvas,
  analyser: engine.adapterOf(id)?.analyser,
  zoom: patch.modules.find((m) => m.id === id)?.params.zoom ?? 1,
})));

// ---------- start ----------

loadPatch(loadSaved() ?? parsePatch(PRESETS["Subtractive voice"]).patch);

// Console access for experiments: mp.dispatch({ type: "addModule", ... }),
// mp.load(patchJson).
window.mp = {
  dispatch,
  engine,
  patch: () => patch,
  load: (json) => {
    const parsed = parsePatch(json);
    if (parsed.ok) loadPatch(parsed.patch);
    return parsed;
  },
};
