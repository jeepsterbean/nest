// Behavior and invariants: docs/interface/time-surfaces.md#dates-and-ranges
import { useEffect } from "react";

/** Left / Right page the selected range and `t` returns to Today while focus
 * is outside interactive controls. */
export function useDatePagingKeys({
  canGoBack,
  isNow,
  step,
  goToday,
}: {
  canGoBack: boolean;
  isNow: boolean;
  step: (direction: number) => void;
  goToday: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || target?.closest("input, textarea, select, button, [role='dialog']")) return;
      if (event.key === "ArrowLeft" && canGoBack) step(-1);
      else if (event.key === "ArrowRight" && !isNow) step(1);
      else if (event.key === "t") goToday();
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canGoBack, isNow, step, goToday]);
}
