// Feedback detection. Web Audio silences any cycle that has no DelayNode in
// it, so every cable that closes a cycle gets a hidden one-quantum delay
// (see audio.js).
//
// A depth-first search marks the back edges: removing them leaves an acyclic
// graph, so delaying exactly those cables makes every cycle legal. Loops
// through the Delay module are marked too, because its dry path bypasses
// its DelayNode; the extra 128 samples are inaudible.

export const feedbackCables = (patch) => {
  const outgoing = new Map(patch.modules.map((m) => [m.id, []]));
  for (const cable of patch.cables) outgoing.get(cable.from.id)?.push(cable);

  const state = new Map(); // module id -> "visiting" | "done"
  const marked = new Set();

  const visit = (id) => {
    state.set(id, "visiting");

    for (const cable of outgoing.get(id) ?? []) {
      const next = state.get(cable.to.id);
      if (next === "visiting") marked.add(cable.id);
      else if (!next) visit(cable.to.id);
    }

    state.set(id, "done");
  };

  for (const m of patch.modules) if (!state.has(m.id)) visit(m.id);

  return marked;
};
