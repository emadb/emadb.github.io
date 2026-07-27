// Audio transport. The project is rendered offline into one buffer and played
// back from it, at the same 44.1 kHz the WAV export uses — so what you hear is
// exactly what you export, and the AudioContext resamples if its own rate differs.

import { renderProject, SAMPLE_RATE } from "./synth.js";

export function initPlayback({ getProject, onTime, onStopped }) {
  let audio = null;
  let source = null;
  let frame = 0;
  let startedAt = 0;
  let duration = 0;

  function stop() {
    if (frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
    if (source) {
      source.onended = null;
      try {
        source.stop();
      } catch {
        // already ended; nothing to stop
      }
      source.disconnect();
      source = null;
    }
    onStopped?.();
  }

  function tick() {
    const t = Math.min(duration, audio.currentTime - startedAt);
    onTime?.(t);
    frame = requestAnimationFrame(tick);
  }

  async function play() {
    stop();
    audio ??= new AudioContext();
    if (audio.state === "suspended") await audio.resume();

    const rendered = renderProject(getProject(), SAMPLE_RATE);
    const buffer = audio.createBuffer(2, rendered.left.length, SAMPLE_RATE);
    buffer.copyToChannel(rendered.left, 0);
    buffer.copyToChannel(rendered.right, 1);

    source = audio.createBufferSource();
    source.buffer = buffer;
    source.connect(audio.destination);
    source.onended = stop;

    duration = buffer.duration;
    startedAt = audio.currentTime;
    source.start();
    tick();

    return rendered;
  }

  return { play, stop, isPlaying: () => source !== null };
}
