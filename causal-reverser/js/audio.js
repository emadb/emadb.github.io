// A single AudioContext-backed transport, shared by source and score
// playback so only one of them ever plays at a time.

export function createTransport() {
  let ctx = null;
  let node = null;
  let startedAtCtxTime = 0;
  let startOffsetSec = 0;

  function ensureContext() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    return ctx;
  }

  function play(samples, sampleRate, { offsetSec = 0, onEnded } = {}) {
    stop();
    const audioCtx = ensureContext();
    const buffer = audioCtx.createBuffer(1, samples.length, sampleRate);
    buffer.copyToChannel(samples, 0);

    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(audioCtx.destination);
    source.onended = () => {
      if (node === source) node = null;
      if (onEnded) onEnded();
    };

    source.start(0, offsetSec);
    node = source;
    startedAtCtxTime = audioCtx.currentTime;
    startOffsetSec = offsetSec;
  }

  function stop() {
    if (node) {
      node.onended = null;
      try { node.stop(); } catch { /* already stopped */ }
      node = null;
    }
  }

  function isPlaying() {
    return node !== null;
  }

  function currentTime() {
    if (!node || !ctx) return 0;
    return startOffsetSec + (ctx.currentTime - startedAtCtxTime);
  }

  return { play, stop, isPlaying, currentTime };
}
