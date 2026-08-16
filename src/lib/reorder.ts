/** Move the item at `from` to `to`. Returns the same array if the move is a no-op. */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= items.length ||
    to >= items.length
  ) {
    return items;
  }
  const next = items.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** Reorder `ids` so `draggedId` sits where `targetId` is. */
export function moveId(ids: number[], draggedId: number, targetId: number): number[] {
  return moveItem(ids, ids.indexOf(draggedId), ids.indexOf(targetId));
}
