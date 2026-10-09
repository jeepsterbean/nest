import { useEffect, useState, type RefObject } from "react";

export type ScrollOverflow = { above: boolean; below: boolean };

/** Whether a scroll box has content hidden past its top or bottom edge.
 * Rechecks on scroll and when the box or its content resizes, so rows
 * arriving after a reload update the hint without a scroll. */
export function useScrollOverflow(
  ref: RefObject<HTMLElement | null>,
): ScrollOverflow {
  const [overflow, setOverflow] = useState<ScrollOverflow>({
    above: false,
    below: false,
  });

  // No deps: the box's child swaps between a list and an empty note, so the
  // observer rebinds after every render rather than tracking a stale node.
  useEffect(() => {
    const box = ref.current;
    if (!box) return;
    const measure = () => {
      // One pixel of slack absorbs fractional scrollTop at non-integer zoom.
      const above = box.scrollTop > 1;
      const below = box.scrollTop + box.clientHeight < box.scrollHeight - 1;
      setOverflow((current) =>
        current.above === above && current.below === below
          ? current
          : { above, below },
      );
    };
    measure();
    box.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    for (const child of Array.from(box.children)) observer.observe(child);
    return () => {
      box.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  });

  return overflow;
}
