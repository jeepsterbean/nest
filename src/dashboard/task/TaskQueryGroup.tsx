import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { placeMenuSelect, type MenuSelectBox } from "../lib/placeMenuSelect";

/** The group owns its nested portaled editors through React's capture path. */
export function TaskQueryGroup({ label, icon, title, count, action, adder, isEmpty, emptyHint, children }: {
  label: string;
  icon: ReactNode;
  title: string;
  /** Omitted for groups that are controls rather than lists; zero also hides the badge. */
  count?: number;
  action?: { label: string; ariaLabel: string; onClick: () => void } | null;
  /** Rendered after the bulk action, so the add control stays at the right edge. */
  adder?: ReactNode;
  /** An empty group stays listed so Filters, Sort, and Hidden never shift position. */
  isEmpty: boolean;
  emptyHint: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<MenuSelectBox | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const insidePress = useRef<Event | null>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      if (trigger.current) setBox(placeMenuSelect(trigger.current.getBoundingClientRect(),
        { width: window.innerWidth, height: window.innerHeight }, 12, { minWidth: 280, maxVisible: 12 }));
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (insidePress.current !== event) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const target = event.target as Node;
      if (!trigger.current?.contains(target) && !menu.current?.contains(target)) return;
      event.preventDefault();
      setOpen(false);
      trigger.current?.focus();
    };
    const scroll = (event: Event) => {
      const scrolled = event.target;
      if (scrolled instanceof Node && (menu.current?.contains(scrolled) || insidePress.current?.target === scrolled)) return;
      // The popover is fixed-positioned once, so any scroll that moves the trigger closes it,
      // including page-level scrolls whose target is the document.
      if (scrolled === document || (scrolled instanceof HTMLElement && scrolled.contains(trigger.current))) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    document.addEventListener("scroll", scroll, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
      document.removeEventListener("scroll", scroll, true);
    };
  }, [open]);
  useEffect(() => {
    if (open && box) menu.current?.querySelector<HTMLElement>("button:not(:disabled)")?.focus();
  }, [open, Boolean(box)]);
  return <section className="task-query__group" aria-label={label}
    onPointerDownCapture={event => { insidePress.current = event.nativeEvent; }}>
    <button ref={trigger} type="button" className="task-query__group-trigger" aria-expanded={open}
      aria-haspopup="dialog" aria-controls={open ? id : undefined} onClick={() => setOpen(value => !value)}>
      {icon}<span>{title}</span>{count ? <span className="task-query__count">{count}</span> : null}
    </button>
    {open && box && createPortal(<div ref={menu} id={id} role="dialog" aria-label={label}
      className="menu-select__menu task-column-menu task-query task-query__popover"
      style={{ top: box.top, left: box.left, width: box.width, maxHeight: box.maxHeight }}>
      <div className="task-query__head">
        <strong>{title}</strong><div className="task-query__tools">
          {action && <button type="button" className="task-query__action" aria-label={action.ariaLabel} onClick={action.onClick}>{action.label}</button>}
          {adder}
        </div>
      </div>
      {isEmpty ? <p className="task-query__hint">{emptyHint}</p> : children}
    </div>, trigger.current?.closest(".dashboard") ?? document.body)}
  </section>;
}
