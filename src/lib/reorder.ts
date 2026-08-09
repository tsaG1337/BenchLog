/**
 * Array reordering used by the image grid's drag-to-sort and its
 * move-left/right buttons.
 *
 * Kept separate from the component because the drag handler calls it on
 * every pointer move: an off-by-one here shows up as items flickering
 * between two slots, which is far easier to pin down in a unit test than
 * with a finger on a screen.
 */

/**
 * Move the item at `from` so it ends up at index `to`, shifting the rest
 * along. Returns a new array; out-of-range or no-op moves return the
 * input unchanged (by identity), so callers can skip a re-render cheaply.
 */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] | readonly T[] {
  if (
    from === to ||
    from < 0 || from >= items.length ||
    to < 0 || to >= items.length
  ) {
    return items;
  }
  const next = items.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** True when `moveItem` would actually change the order. */
export function canMove(length: number, from: number, to: number): boolean {
  return from !== to && from >= 0 && from < length && to >= 0 && to < length;
}
