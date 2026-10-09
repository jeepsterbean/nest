/** Close an open overlay when the pointer lands outside its keep-alive root. */
export function shouldDismissOnPointerDown(
  open: boolean,
  target: EventTarget | null,
  keepInsideSelector: string,
): boolean {
  if (
    !open ||
    target == null ||
    typeof (target as { closest?: unknown }).closest !== "function"
  ) {
    return false;
  }
  return !(target as Element).closest(keepInsideSelector);
}

/** Ignore re-render blurs (relatedTarget is null); close when focus actually left. */
export function shouldCloseOverlayOnFocusLeave(
  currentTarget: EventTarget | null,
  relatedTarget: EventTarget | null,
): boolean {
  if (relatedTarget == null) return false;
  if (
    currentTarget == null ||
    typeof (currentTarget as { contains?: unknown }).contains !== "function"
  ) {
    return true;
  }
  return !(currentTarget as Node).contains(relatedTarget as Node);
}
