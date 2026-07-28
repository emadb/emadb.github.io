// Shared by every global key handler: a shortcut must never fire while the
// user is typing into a field.

export function isTypingTarget(target) {
  const tag = target?.tagName;
  return tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || target?.isContentEditable === true;
}
