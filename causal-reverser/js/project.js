// Versioned project JSON: document (events, score), source metadata,
// analysis/generation settings. Never the WAV bytes themselves - on load,
// the designer re-selects the source file and the app verifies it actually
// matches before trusting the saved score against it.

export const PROJECT_VERSION = "causal-reverser/v1";

export function toProjectJson(doc) {
  return {
    version: PROJECT_VERSION,
    name: doc.projectName || "untitled",
    source: {
      name: doc.source.name,
      sampleRate: doc.source.sampleRate,
      frames: doc.source.frames,
    },
    events: doc.events.map((e) => ({ ...e })),
    score: doc.score.map((c) => ({ ...c })),
    settings: {
      sensitivity: doc.sensitivity,
      minGapSeconds: doc.minGapSeconds,
      outputDurationSeconds: doc.outputDurationSeconds,
      fadeMs: doc.fadeMs,
      premonitionSeed: doc.premonitionSeed,
      explodedSeed: doc.explodedSeed,
      impossibleSeed: doc.impossibleSeed,
    },
  };
}

export function parseProjectJson(text) {
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("Project file is not valid JSON.");
  }
  if (!json || json.version !== PROJECT_VERSION) {
    const got = json && json.version ? `"${json.version}"` : "none";
    throw new Error(`Unrecognized project version (got ${got}, expected "${PROJECT_VERSION}").`);
  }
  if (!json.source || typeof json.source.sampleRate !== "number" || typeof json.source.frames !== "number") {
    throw new Error("Project file is missing source metadata.");
  }
  if (!Array.isArray(json.events) || !Array.isArray(json.score)) {
    throw new Error("Project file is missing events or score data.");
  }
  return json;
}

export function sourceMatchesProject(source, project) {
  return source.sampleRate === project.source.sampleRate && source.frames === project.source.frames;
}
