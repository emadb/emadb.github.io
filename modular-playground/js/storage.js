// Persistence: autosave to localStorage and JSON file export/import. Both
// paths go through parsePatch, so a stored or imported file gets the same
// validation as a patch built by hand.

import { parsePatch } from "./patch.js";

const KEY = "modular-playground:patch";
const SAVE_DELAY = 300; // ms; module drags dispatch many commands

let timer = null;

export const loadSaved = () => {
  try {
    const text = localStorage.getItem(KEY);
    if (!text) return null;
    const parsed = parsePatch(JSON.parse(text));
    return parsed.ok ? parsed.patch : null;
  } catch {
    return null;
  }
};

export const save = (patch) => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(patch));
    } catch {
      // storage full or blocked: the patch still lives in memory
    }
  }, SAVE_DELAY);
};

export const exportFile = (patch, name = "patch") => {
  const blob = new Blob([JSON.stringify(patch, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${name}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
};

// Returns { ok, patch } or { ok: false, error }.
export const importFile = async (file) => {
  try {
    return parsePatch(JSON.parse(await file.text()));
  } catch (error) {
    return { ok: false, error: `cannot read ${file.name}: ${error.message}` };
  }
};
