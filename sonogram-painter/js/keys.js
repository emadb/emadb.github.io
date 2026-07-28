// Shared by every global key handler: a shortcut must never fire while the
// user is typing into a field.

export function isTypingTarget(target) {
  const tag = target?.tagName;
  return tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || target?.isContentEditable === true;
}

// Undo must still work right after clicking a checkbox or dragging a
// slider (they keep focus): only genuinely text-editing targets swallow
// the undo shortcut.
const TEXT_TYPES = new Set(["text", "number", "search", "email", "url", "password", "tel"]);

export function isTextEntryTarget(target) {
  if (target?.isContentEditable === true || target?.tagName === "TEXTAREA") return true;
  return target?.tagName === "INPUT" && TEXT_TYPES.has(target.type);
}
