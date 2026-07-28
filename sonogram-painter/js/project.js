// Project save/load. The file is JSON with each grid stored as a base64
// PNG data URL: a grid is an image, and PNG compresses silence to
// nothing. Loading shares the image importer's decode path — a project
// file is "drop an image" plus metadata, once per grid.
//
// v2 added the noise grid alongside the tonal one. v1 files (a single
// `grid` field, no noise) still open — the tonal grid comes from that
// image, the noise grid starts empty but dimensionally in sync.

import { createGrid } from "./grid.js";
import { imageToGrid, loadImageUrl } from "./image.js";

export const FORMAT_V1 = "sonogram-painter/v1";
export const FORMAT_V2 = "sonogram-painter/v2";
export const FORMAT = FORMAT_V2; // format written by toProjectJson

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function fileSlug(name) {
  return name.trim().replace(/[^\w\- ]+/g, "").replace(/\s+/g, "-") || "untitled";
}

export function timeStamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

// Amplitude → 8-bit gray, image top = highest band (same orientation the
// importer expects back).
function gridToPngDataUrl(grid) {
  const off = document.createElement("canvas");
  off.width = grid.cols;
  off.height = grid.rows;
  const ctx = off.getContext("2d");
  const img = ctx.createImageData(grid.cols, grid.rows);
  for (let row = 0; row < grid.rows; row++) {
    const y = grid.rows - 1 - row;
    for (let col = 0; col < grid.cols; col++) {
      const v = Math.round(clamp(grid.data[row * grid.cols + col], 0, 1) * 255);
      const at = (y * grid.cols + col) * 4;
      img.data[at] = v;
      img.data[at + 1] = v;
      img.data[at + 2] = v;
      img.data[at + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return off.toDataURL("image/png");
}

export function toProjectJson(state) {
  return JSON.stringify({
    format: FORMAT_V2,
    name: state.projectName,
    durationSec: state.durationSec,
    tonalGrid: gridToPngDataUrl(state.tonalGrid),
    noiseGrid: gridToPngDataUrl(state.noiseGrid),
  });
}

// Gamma 1, floor 0: an exact 8-bit round-trip, not a lossy image import.
async function decodeGridPng(url, durationSec) {
  if (!url.startsWith("data:image/")) throw new Error("project has no grid image");
  const img = await loadImageUrl(url);
  const grid = createGrid(durationSec);
  imageToGrid(img, grid, { gamma: 1, invert: false, floor: 0 });
  return grid;
}

// Parses and coerces a project file: wrong format throws, out-of-range
// metadata clamps. Accepts both the current format and v1's single-grid
// files.
export async function fromProjectJson(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("not a JSON file");
  }
  if (data?.format !== FORMAT_V1 && data?.format !== FORMAT_V2) {
    throw new Error("not a sonogram-painter project");
  }

  const durationSec = clamp(Math.round(Number(data.durationSec)) || 10, 1, 60);
  const name =
    typeof data.name === "string" && data.name.trim() ? data.name.trim().slice(0, 60) : "untitled";

  if (data.format === FORMAT_V1) {
    const tonalGrid = await decodeGridPng(String(data.grid ?? ""), durationSec);
    return { name, durationSec, tonalGrid, noiseGrid: createGrid(durationSec) };
  }

  const tonalGrid = await decodeGridPng(String(data.tonalGrid ?? ""), durationSec);
  const noiseGrid = await decodeGridPng(String(data.noiseGrid ?? ""), durationSec);
  return { name, durationSec, tonalGrid, noiseGrid };
}
