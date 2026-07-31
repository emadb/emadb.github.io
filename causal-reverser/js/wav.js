// WAV decoding via the browser's AudioContext, and a hand-rolled 16-bit PCM
// encoder for export. The source is mono internally; export duplicates it to
// dual-mono so the file opens cleanly as stereo in any editor.

const MAX_DURATION_SECONDS = 300;

// decodeAudioData resamples to the AudioContext's own hardware rate (e.g.
// 44100/48000) regardless of the file's native rate. Constructing the
// context with the file's own rate (read straight from the fmt chunk) makes
// decodeAudioData a no-op resampler, so the returned buffer stays at the
// source's actual sample rate.
function peekWavSampleRate(arrayBuffer) {
  if (arrayBuffer.byteLength < 44) return null;
  const view = new DataView(arrayBuffer);
  const readAscii = (offset, length) => {
    let s = "";
    for (let i = 0; i < length; i++) s += String.fromCharCode(view.getUint8(offset + i));
    return s;
  };
  if (readAscii(0, 4) !== "RIFF" || readAscii(8, 4) !== "WAVE") return null;

  let offset = 12;
  while (offset + 8 <= view.byteLength) {
    const chunkId = readAscii(offset, 4);
    const chunkSize = view.getUint32(offset + 4, true);
    if (chunkId === "fmt " && offset + 8 + 8 <= view.byteLength) {
      return view.getUint32(offset + 8 + 4, true);
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }
  return null;
}

export async function decodeWavFile(file) {
  const arrayBuffer = await file.arrayBuffer();
  const nativeRate = peekWavSampleRate(arrayBuffer);
  const ctx = nativeRate
    ? new (window.AudioContext || window.webkitAudioContext)({ sampleRate: nativeRate })
    : new (window.AudioContext || window.webkitAudioContext)();
  let audioBuffer;
  try {
    audioBuffer = await ctx.decodeAudioData(arrayBuffer);
  } catch (err) {
    throw new Error(`Could not decode "${file.name}" as audio (${err.message || err}).`);
  } finally {
    ctx.close();
  }

  if (audioBuffer.duration > MAX_DURATION_SECONDS) {
    throw new Error(
      `"${file.name}" is ${audioBuffer.duration.toFixed(1)}s long; ` +
      `Causal Reverser accepts files up to ${MAX_DURATION_SECONDS / 60} minutes.`
    );
  }

  return {
    name: file.name,
    sampleRate: audioBuffer.sampleRate,
    frames: audioBuffer.length,
    samples: Float32Array.from(audioBuffer.getChannelData(0)),
  };
}

export function encodeWav(samples, sampleRate) {
  const frames = samples.length;
  const channels = 2;
  const bytesPerSample = 2;
  const dataBytes = frames * channels * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);

  const writeAscii = (offset, text) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * bytesPerSample, true);
  view.setUint16(32, channels * bytesPerSample, true);
  view.setUint16(34, 8 * bytesPerSample, true);
  writeAscii(36, "data");
  view.setUint32(40, dataBytes, true);

  let offset = 44;
  for (let i = 0; i < frames; i++) {
    const pcm = toPcm16(samples[i]);
    view.setInt16(offset, pcm, true);
    view.setInt16(offset + 2, pcm, true);
    offset += 4;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

function toPcm16(sample) {
  const s = Math.max(-1, Math.min(1, sample));
  return s < 0 ? s * 0x8000 : s * 0x7fff;
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
