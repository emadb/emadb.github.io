// Immutable-style document helpers: every event that enters or leaves state
// passes through normalizeEvent, so the anatomy invariant
//   start <= excitation <= body <= resonance <= end
// (with excitation retaining a small non-zero minimum length) always holds,
// regardless of whether it came from analysis, a manual edit, or a project
// file.

const MIN_EXCITATION_FRAMES = 8;

let nextEventSeq = 1;

export function normalizeEvent(raw, totalFrames) {
  const clamp = (v) => Math.max(0, Math.min(totalFrames, Math.round(v)));

  let startFrame = clamp(raw.startFrame);
  let excitationFrame = clamp(raw.excitationFrame);
  let bodyFrame = clamp(raw.bodyFrame);
  let resonanceFrame = clamp(raw.resonanceFrame);
  let endFrame = clamp(raw.endFrame);

  excitationFrame = Math.max(excitationFrame, startFrame);
  bodyFrame = Math.max(bodyFrame, excitationFrame);
  resonanceFrame = Math.max(resonanceFrame, bodyFrame);
  endFrame = Math.max(endFrame, resonanceFrame);

  if (bodyFrame - excitationFrame < MIN_EXCITATION_FRAMES) {
    bodyFrame = Math.min(endFrame, excitationFrame + MIN_EXCITATION_FRAMES);
    resonanceFrame = Math.max(resonanceFrame, bodyFrame);
    endFrame = Math.max(endFrame, resonanceFrame);
  }

  // Re-clamp downward in case the excitation-minimum push above ran past
  // totalFrames (an onset right at the very end of the file).
  endFrame = Math.min(endFrame, totalFrames);
  resonanceFrame = Math.min(resonanceFrame, endFrame);
  bodyFrame = Math.min(bodyFrame, resonanceFrame);
  excitationFrame = Math.min(excitationFrame, bodyFrame);
  startFrame = Math.min(startFrame, excitationFrame);

  return {
    id: raw.id || `event-${nextEventSeq++}`,
    startFrame,
    excitationFrame,
    bodyFrame,
    resonanceFrame,
    endFrame,
    manual: !!raw.manual,
    touched: !!raw.touched,
  };
}

function overlaps(a, b) {
  return a.startFrame < b.endFrame && b.startFrame < a.endFrame;
}

// Re-analysis (onset sensitivity / min-gap changed) must not silently
// destroy a designer's manual work: keep any event that was manually
// created or has been edited since it was detected, and only fill in
// freshly-detected events where they don't overlap a kept one.
export function mergeDetectedEvents(previousEvents, detectedEvents) {
  const kept = previousEvents.filter((e) => e.manual || e.touched);
  const additions = detectedEvents.filter((d) => !kept.some((k) => overlaps(k, d)));
  return [...kept, ...additions].sort((a, b) => a.startFrame - b.startFrame);
}

export function findEventAtFrame(events, frame) {
  return events.find((e) => frame >= e.startFrame && frame < e.endFrame) || null;
}

const ROLE_RANGES = [
  ["foreshadow", "startFrame", "excitationFrame"],
  ["excitation", "excitationFrame", "bodyFrame"],
  ["body", "bodyFrame", "resonanceFrame"],
  ["resonance", "resonanceFrame", "endFrame"],
];

// Which anatomical role a frame falls in, for picking up a single role band
// to drag into the causal score.
export function roleAtFrame(event, frame) {
  for (const [role, fromKey, toKey] of ROLE_RANGES) {
    if (frame >= event[fromKey] && frame < event[toKey]) return role;
  }
  return "resonance";
}

// The cross-event limits a boundary drag must respect: an event's start
// can't cross into its predecessor, its end can't cross into its successor.
// events must be sorted by startFrame (true by construction everywhere they
// enter state).
export function getNeighborBounds(events, eventId, totalFrames) {
  const idx = events.findIndex((e) => e.id === eventId);
  if (idx === -1) return { floor: 0, ceiling: totalFrames };
  return {
    floor: idx > 0 ? events[idx - 1].endFrame : 0,
    ceiling: idx < events.length - 1 ? events[idx + 1].startFrame : totalFrames,
  };
}

// Move one boundary of one event. All five boundaries share the same
// re-normalization pass, so internal ordering and the excitation minimum
// are always restored regardless of which handle moved; neighborBounds only
// needs to guard the two outer edges against crossing into another event.
export function dragBoundary(event, boundaryKey, rawFrame, neighborBounds, totalFrames) {
  let clamped = rawFrame;
  if (boundaryKey === "startFrame") clamped = Math.max(neighborBounds.floor, rawFrame);
  else if (boundaryKey === "endFrame") clamped = Math.min(neighborBounds.ceiling, rawFrame);

  return normalizeEvent(
    {
      ...event,
      [boundaryKey]: clamped,
      touched: event.manual ? event.touched : true,
    },
    totalFrames
  );
}

const DEFAULT_EXCITATION_MS = 15;
const DEFAULT_BODY_MS = 120;
const DEFAULT_RESONANCE_MS = 200;

// Double-clicking a void interval creates a small manual event anchored at
// the clicked frame, clamped to whatever gap is actually available between
// its neighbors. Returns null if the frame already belongs to an event.
export function createManualEventAt(events, sampleRate, totalFrames, onsetFrame) {
  if (findEventAtFrame(events, onsetFrame)) return null;

  let prevEvent = null;
  let nextEvent = null;
  for (const e of events) {
    if (e.endFrame <= onsetFrame) prevEvent = e;
    if (e.startFrame >= onsetFrame && !nextEvent) nextEvent = e;
  }
  const floor = prevEvent ? prevEvent.endFrame : 0;
  const ceiling = nextEvent ? nextEvent.startFrame : totalFrames;

  const excitationFrame = onsetFrame;
  const bodyFrame = Math.min(ceiling, excitationFrame + Math.round((DEFAULT_EXCITATION_MS / 1000) * sampleRate));
  const resonanceFrame = Math.min(ceiling, bodyFrame + Math.round((DEFAULT_BODY_MS / 1000) * sampleRate));
  const endFrame = Math.min(ceiling, resonanceFrame + Math.round((DEFAULT_RESONANCE_MS / 1000) * sampleRate));
  const startFrame = Math.max(floor, excitationFrame); // zero-length foreshadow by default

  return normalizeEvent(
    { startFrame, excitationFrame, bodyFrame, resonanceFrame, endFrame, manual: true, touched: false },
    totalFrames
  );
}
