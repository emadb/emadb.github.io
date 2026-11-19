// Draws every Scope module's signal once per animation frame. The trace
// starts at a rising zero crossing so periodic signals stand still.

const findTrigger = (samples, span) => {
  for (let i = 1; i < samples.length - span; i++) {
    if (samples[i - 1] < 0 && samples[i] >= 0) return i;
  }
  return 0;
};

const draw = (canvas, samples, zoom) => {
  const g = canvas.getContext("2d");
  const { width, height } = canvas;
  const style = getComputedStyle(canvas);
  const span = Math.floor(samples.length / zoom / 2);
  const start = findTrigger(samples, span);

  g.clearRect(0, 0, width, height);
  g.strokeStyle = style.getPropertyValue("--scope-grid").trim();
  g.beginPath();
  g.moveTo(0, height / 2);
  g.lineTo(width, height / 2);
  g.stroke();

  g.strokeStyle = style.getPropertyValue("--scope-trace").trim();
  g.lineWidth = 1.5;
  g.beginPath();
  for (let x = 0; x < width; x++) {
    const sample = samples[start + Math.floor((x / width) * span)] ?? 0;
    const y = height / 2 - Math.max(-1, Math.min(1, sample)) * (height / 2 - 4);
    if (x === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.stroke();
};

// scopes() -> [{ canvas, analyser, zoom }]
export const startScopes = (scopes) => {
  let buffer = new Float32Array(0);

  const frame = () => {
    for (const { canvas, analyser, zoom } of scopes()) {
      if (!analyser) continue;
      if (buffer.length !== analyser.fftSize) buffer = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(buffer);
      draw(canvas, buffer, zoom);
    }
    requestAnimationFrame(frame);
  };

  requestAnimationFrame(frame);
};
