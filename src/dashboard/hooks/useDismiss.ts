import { useEffect, useRef, type RefObject } from "react";

/** Closes a popover on an outside press or Escape, tested against a ref the
 *  popover owns. Returning true from an outside dismiss swallows the click
 *  that follows. That listener stays up after the popover unmounts, because
 *  the click is a later event than the press that closed it. */
export function useDismiss(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  onDismiss: (reason: "outside" | "escape") => boolean | void,
) {
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (ref.current?.contains(event.target as Node)) return;
      if (dismissRef.current("outside") !== true) return;
      const stopClick = (click: MouseEvent) => {
        click.preventDefault();
        click.stopPropagation();
        document.removeEventListener("pointercancel", forgetClick, true);
      };
      const forgetClick = () => {
        document.removeEventListener("click", stopClick, true);
      };
      document.addEventListener("click", stopClick, { capture: true, once: true });
      document.addEventListener("pointercancel", forgetClick, {
        capture: true,
        once: true,
      });
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      dismissRef.current("escape");
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, ref]);
}
