// Image import: a dropped or picked PNG/JPG becomes grid content.
// Luminance → amplitude, image top = high frequencies. The image is drawn
// stretched onto an offscreen canvas the size of the grid, so the grid
// stays fully paintable afterwards — the image is content, not a layer.
// Item 9's project loader shares this decode path.

export function loadImageUrl(url, cleanup) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      cleanup?.();
      resolve(img);
    };
    img.onerror = () => {
      cleanup?.();
      reject(new Error("not a readable image"));
    };
    img.src = url;
  });
}

export function loadImageFile(file) {
  const url = URL.createObjectURL(file);
  return loadImageUrl(url, () => URL.revokeObjectURL(url));
}

// Camera blacks are never quite zero; below this the cell is treated as
// silence so a photo doesn't carry a full-spectrum noise floor.
const SILENCE_FLOOR = 0.02;

// Replaces the grid's content with the image. Gamma shapes luminance →
// amplitude (photos are mostly bright, sound wants mostly silence, so
// values > 1 that push mids toward quiet are the useful range); invert
// flips luminance first, for dark-on-white sources. The project loader
// passes floor: 0 for an exact round-trip of its own PNGs.
export function imageToGrid(img, grid, { gamma = 1, invert = false, floor = SILENCE_FLOOR } = {}) {
  const off = document.createElement("canvas");
  off.width = grid.cols;
  off.height = grid.rows;
  const ctx = off.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, grid.cols, grid.rows);
  ctx.drawImage(img, 0, 0, grid.cols, grid.rows);
  const px = ctx.getImageData(0, 0, grid.cols, grid.rows).data;

  for (let row = 0; row < grid.rows; row++) {
    const y = grid.rows - 1 - row; // image top = highest band
    for (let col = 0; col < grid.cols; col++) {
      const at = (y * grid.cols + col) * 4;
      let lum = (0.2126 * px[at] + 0.7152 * px[at + 1] + 0.0722 * px[at + 2]) / 255;
      if (invert) lum = 1 - lum;
      const v = gamma === 1 ? lum : Math.pow(lum, gamma);
      grid.data[row * grid.cols + col] = v < floor ? 0 : v;
    }
  }
}
