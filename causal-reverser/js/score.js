// Score clip model: non-destructive references into the source, plus their
// output placement. Every clip that enters state passes through
// normalizeClip, which is also the model boundary that rejects a degenerate
// or invalid interval outright (never silently skipped later by the
// renderer).
//
// Trim semantics (fixed here so items 8-10's generators and item 7's
// renderer agree): trimming the LEFT edge moves sourceStartFrame and
// outputStartFrame together by the same delta (divided by rate, though v1
// never sets rate != 1 from the UI) — the clip's tail stays put. Trimming
// the RIGHT edge only moves sourceEndFrame — the clip's head stays put and
// its duration changes.

const MIN_CLIP_FRAMES = 8;
const MIN_GAIN = 0;
const MAX_GAIN = 2;
const GAIN_STEP = 0.05;
export const LANE_COUNT = 4;

let nextClipSeq = 1;

export function clipOutputDuration(clip) {
  return Math.max(1, Math.round((clip.sourceEndFrame - clip.sourceStartFrame) / clip.rate));
}

export function clipOutputEnd(clip) {
  return clip.outputStartFrame + clipOutputDuration(clip);
}

// Returns null (rejected) rather than a clamped-to-nothing clip.
export function normalizeClip(raw, sourceFrames) {
  const sourceStartFrame = Math.max(0, Math.min(sourceFrames, Math.round(raw.sourceStartFrame)));
  const sourceEndFrame = Math.max(0, Math.min(sourceFrames, Math.round(raw.sourceEndFrame)));
  if (sourceEndFrame - sourceStartFrame < MIN_CLIP_FRAMES) return null;

  return {
    id: raw.id || `clip-${nextClipSeq++}`,
    eventId: raw.eventId ?? null,
    role: raw.role ?? null,
    sourceStartFrame,
    sourceEndFrame,
    outputStartFrame: Math.max(0, Math.round(raw.outputStartFrame)),
    rate: raw.rate || 1,
    reverse: !!raw.reverse,
    gain: raw.gain ?? 1,
    lane: Math.max(0, Math.min(LANE_COUNT - 1, Math.round(raw.lane ?? 0))),
  };
}

// The one place the "fixed buffer, clamp at edges" policy from the grilling
// session is enforced. Call this after any mutation that could move a clip
// or change its duration.
export function clampClipToOutput(clip, outputFrames) {
  const duration = clipOutputDuration(clip);
  const maxStart = Math.max(0, outputFrames - duration);
  return { ...clip, outputStartFrame: Math.max(0, Math.min(maxStart, clip.outputStartFrame)) };
}

export function moveClip(clip, newOutputStartFrame, outputFrames) {
  return clampClipToOutput({ ...clip, outputStartFrame: Math.max(0, Math.round(newOutputStartFrame)) }, outputFrames);
}

export function setClipLane(clip, lane) {
  return { ...clip, lane: Math.max(0, Math.min(LANE_COUNT - 1, Math.round(lane))) };
}

export function trimClipLeft(clip, newSourceStartFrame) {
  const clampedSource = Math.max(0, Math.min(clip.sourceEndFrame - MIN_CLIP_FRAMES, Math.round(newSourceStartFrame)));
  const deltaSource = clampedSource - clip.sourceStartFrame;
  const deltaOutput = Math.round(deltaSource / clip.rate);
  return {
    ...clip,
    sourceStartFrame: clampedSource,
    outputStartFrame: Math.max(0, clip.outputStartFrame + deltaOutput),
  };
}

export function trimClipRight(clip, newSourceEndFrame, sourceFrames) {
  const clampedSource = Math.min(
    sourceFrames,
    Math.max(clip.sourceStartFrame + MIN_CLIP_FRAMES, Math.round(newSourceEndFrame))
  );
  return { ...clip, sourceEndFrame: clampedSource };
}

export function toggleReverse(clip) {
  return { ...clip, reverse: !clip.reverse };
}

export function adjustGain(clip, direction) {
  const gain = Math.max(MIN_GAIN, Math.min(MAX_GAIN, clip.gain + direction * GAIN_STEP));
  return { ...clip, gain };
}

export function duplicateClip(clip) {
  return { ...clip, id: `clip-${nextClipSeq++}` };
}

// Shrinking outputDurationSeconds can leave existing clips clamped or,
// if a clip's own duration now exceeds the whole buffer, unfittable — those
// are rejected outright rather than silently truncated.
export function reflowScoreForOutputFrames(score, outputFrames) {
  return score.filter((clip) => clipOutputDuration(clip) <= outputFrames).map((clip) => clampClipToOutput(clip, outputFrames));
}

const PREMONITION_SPLIT_FRAGMENTS = 3;

// Premonition: for every participating event, its resonance is placed
// *before* its excitation in the causal score - the anchor for the
// unmoved parts (excitation, body) is the event's own source position
// (mirrors source timing by default, per the grilling-session decision),
// while the resonance is pulled earlier so it ends leadTimeFrames before
// the excitation begins. A false omen keeps the early resonance but omits
// the excitation/body that would normally follow it. The RNG is consumed
// once per event (participation roll, then false-omen roll) so a fixed
// seed always reproduces the same score.
export function generatePremonition(events, selectedEventIds, options, rng, sourceFrames) {
  const { leadTimeFrames, probability, tail, falseOmenProbability } = options;
  const targets = selectedEventIds.size ? events.filter((e) => selectedEventIds.has(e.id)) : events;
  const clips = [];

  for (const event of targets) {
    if (rng() > probability) continue;
    const isFalseOmen = rng() < falseOmenProbability;

    const resonanceDuration = event.endFrame - event.resonanceFrame;
    if (resonanceDuration > 0) {
      const resonanceOutputEnd = event.excitationFrame - leadTimeFrames;
      if (tail === "split") {
        const fragFrames = Math.max(1, Math.floor(resonanceDuration / PREMONITION_SPLIT_FRAGMENTS));
        let cursorEnd = resonanceOutputEnd;
        for (let f = PREMONITION_SPLIT_FRAGMENTS - 1; f >= 0; f--) {
          const fragSourceStart = event.resonanceFrame + f * fragFrames;
          const fragSourceEnd = f === PREMONITION_SPLIT_FRAGMENTS - 1 ? event.endFrame : fragSourceStart + fragFrames;
          const fragDuration = fragSourceEnd - fragSourceStart;
          const clip = normalizeClip(
            {
              eventId: event.id,
              role: "resonance",
              sourceStartFrame: fragSourceStart,
              sourceEndFrame: fragSourceEnd,
              outputStartFrame: cursorEnd - fragDuration,
            },
            sourceFrames
          );
          if (clip) clips.push(clip);
          cursorEnd -= fragDuration;
        }
      } else {
        const clip = normalizeClip(
          {
            eventId: event.id,
            role: "resonance",
            sourceStartFrame: event.resonanceFrame,
            sourceEndFrame: event.endFrame,
            outputStartFrame: resonanceOutputEnd - resonanceDuration,
            reverse: tail === "reversed",
          },
          sourceFrames
        );
        if (clip) clips.push(clip);
      }
    }

    if (!isFalseOmen) {
      if (event.bodyFrame > event.excitationFrame) {
        const c = normalizeClip(
          {
            eventId: event.id,
            role: "excitation",
            sourceStartFrame: event.excitationFrame,
            sourceEndFrame: event.bodyFrame,
            outputStartFrame: event.excitationFrame,
          },
          sourceFrames
        );
        if (c) clips.push(c);
      }
      if (event.resonanceFrame > event.bodyFrame) {
        const c = normalizeClip(
          {
            eventId: event.id,
            role: "body",
            sourceStartFrame: event.bodyFrame,
            sourceEndFrame: event.resonanceFrame,
            outputStartFrame: event.bodyFrame,
          },
          sourceFrames
        );
        if (c) clips.push(c);
      }
    }
  }

  return clips;
}

const ROLE_SPAN_KEYS = {
  foreshadow: ["startFrame", "excitationFrame"],
  excitation: ["excitationFrame", "bodyFrame"],
  body: ["bodyFrame", "resonanceFrame"],
  resonance: ["resonanceFrame", "endFrame"],
};

// Exploded Event: split each participating event into its anatomical role
// clips and scatter them around the event's own excitationFrame (the same
// anchor convention as Premonition). At zero radius and no quantization the
// roles land contiguously, in exactly the configured order, starting at the
// anchor - that's the case item 9's verification checks. Collision policy
// only matters once jitter can actually cause overlap.
export function generateExplodedEvent(events, selectedEventIds, options, rng, sourceFrames) {
  const { roleOrder, radiusFrames, quantizeFrames, collisionPolicy } = options;
  const targets = selectedEventIds.size ? events.filter((e) => selectedEventIds.has(e.id)) : events;
  const allClips = [];

  for (const event of targets) {
    const anchor = event.excitationFrame;
    let cursor = anchor;
    const placed = [];

    for (const role of roleOrder) {
      const [fromKey, toKey] = ROLE_SPAN_KEYS[role];
      const sourceStart = event[fromKey];
      const sourceEnd = event[toKey];
      const duration = sourceEnd - sourceStart;
      if (duration <= 0) continue;

      let outputStart = cursor;
      if (radiusFrames > 0) outputStart += Math.round((rng() * 2 - 1) * radiusFrames);
      if (quantizeFrames > 0) outputStart = Math.round(outputStart / quantizeFrames) * quantizeFrames;

      placed.push({ role, sourceStart, sourceEnd, outputStart, duration });
      cursor += duration;
    }

    if (collisionPolicy === "push-apart") {
      placed.sort((a, b) => a.outputStart - b.outputStart);
      let floor = -Infinity;
      for (const p of placed) {
        if (p.outputStart < floor) p.outputStart = floor;
        floor = p.outputStart + p.duration;
      }
    }

    for (const p of placed) {
      const clip = normalizeClip(
        {
          eventId: event.id,
          role: p.role,
          sourceStartFrame: p.sourceStart,
          sourceEndFrame: p.sourceEnd,
          outputStartFrame: p.outputStart,
        },
        sourceFrames
      );
      if (clip) allClips.push(clip);
    }
  }

  return allClips;
}

function eventDuration(e) {
  return e.endFrame - e.startFrame;
}

// Matching pool scope (decided here, deferred from the grilling session):
// candidates are every OTHER event in the whole document, not just the
// current selection - a single-event selection would otherwise have zero
// valid candidates to swap against.
function findMaterialMatch(event, allEvents, strategy, rng) {
  const candidates = allEvents.filter((e) => e.id !== event.id);
  if (!candidates.length) return null;

  if (strategy === "chronological") {
    const idx = allEvents.findIndex((e) => e.id === event.id);
    for (let step = 1; step <= allEvents.length; step++) {
      const candidate = allEvents[(idx + step) % allEvents.length];
      if (candidate.id !== event.id) return candidate;
    }
    return null;
  }
  if (strategy === "random") {
    return candidates[Math.floor(rng() * candidates.length)];
  }
  if (strategy === "similar-duration") {
    const targetDur = eventDuration(event);
    return candidates.reduce((best, c) =>
      Math.abs(eventDuration(c) - targetDur) < Math.abs(eventDuration(best) - targetDur) ? c : best
    );
  }
  if (strategy === "opposite-duration") {
    const targetDur = eventDuration(event);
    return candidates.reduce((best, c) =>
      Math.abs(eventDuration(c) - targetDur) > Math.abs(eventDuration(best) - targetDur) ? c : best
    );
  }
  return null;
}

const ALL_ROLES = ["foreshadow", "excitation", "body", "resonance"];

// Impossible Materials: keeps a target event's own timeline (every role
// anchored at the event's own source position, as usual) but the one
// selected role's audio comes from a matched OTHER event instead. Each
// generated clip's eventId names whichever event its audio actually comes
// from (not always the target), so a swap stays inspectable - never a
// fabricated or dangling reference, and never a role's audio that crosses
// into a different role's bounds of its *source* event.
export function generateImpossibleMaterials(events, selectedEventIds, options, rng, sourceFrames) {
  const { role, strategy } = options;
  const targets = selectedEventIds.size ? events.filter((e) => selectedEventIds.has(e.id)) : events;
  const clips = [];

  for (const event of targets) {
    const match = findMaterialMatch(event, events, strategy, rng);
    if (!match) continue; // no valid candidate anywhere in the document; skip rather than fabricate

    for (const r of ALL_ROLES) {
      const [fromKey, toKey] = ROLE_SPAN_KEYS[r];
      const source = r === role ? match : event;
      const sourceStart = source[fromKey];
      const sourceEnd = source[toKey];
      if (sourceEnd - sourceStart <= 0) continue;

      const clip = normalizeClip(
        {
          eventId: source.id,
          role: r,
          sourceStartFrame: sourceStart,
          sourceEndFrame: sourceEnd,
          outputStartFrame: event[fromKey], // always anchored at the TARGET event's own timeline slot
        },
        sourceFrames
      );
      if (clip) clips.push(clip);
    }
  }

  return clips;
}
