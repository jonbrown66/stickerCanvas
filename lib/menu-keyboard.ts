/**
 * Returns the enabled item that should receive focus for a roving menu or
 * radio group. `enabled` is kept separate from DOM concerns so every menu
 * uses the same disabled-item and wrap-around behavior.
 */
export function getRovingFocusIndex(
  key: string,
  currentIndex: number,
  enabled: readonly boolean[],
): number | null {
  if (!enabled.some(Boolean)) return null;

  if (key === "Home") return enabled.findIndex(Boolean);
  if (key === "End") return enabled.lastIndexOf(true);

  const direction =
    key === "ArrowDown" || key === "ArrowRight"
      ? 1
      : key === "ArrowUp" || key === "ArrowLeft"
        ? -1
        : 0;
  if (!direction) return null;

  const start = currentIndex >= 0 && currentIndex < enabled.length
    ? currentIndex
    : direction > 0
      ? -1
      : 0;

  for (let offset = 1; offset <= enabled.length; offset += 1) {
    const nextIndex = (start + direction * offset + enabled.length) % enabled.length;
    if (enabled[nextIndex]) return nextIndex;
  }

  return null;
}
