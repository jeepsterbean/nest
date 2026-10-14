import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { placeMenuSelect, type MenuSelectBox } from "../lib/placeMenuSelect";
import { FIRST_FOCUSABLE } from "./TaskTableHeaderMenu";

const MENU_MAX_VISIBLE_ROWS = 16;

/** A query rule's name and value as a button that opens its editor beside the row,
 * so the sidebar edits the same rule a column header menu does. */
export function TaskQueryRuleMenu({ name, value, title, menuLabel, minWidth, open, onOpenChange, onReset, children }: {
  name: string;
  value: string;
  title: string;
  menuLabel: string;
  minWidth: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Absent when the menu has nothing to reset. */
  onReset?: () => void;
  children: (close: () => void) => ReactNode;
}) {
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<MenuSelectBox | null>(null);

  const close = () => {
    const trigger = triggerRef.current;
    const query = trigger?.closest(".task-query");
    const controls = query ? Array.from(query.querySelectorAll<HTMLButtonElement>("button:not(:disabled):not(.task-query-rule__remove):not(.task-query-rule__grip)")) : [];
    const index = trigger ? controls.indexOf(trigger) : -1;
    const fallbackControls = [...controls.slice(index + 1), ...controls.slice(0, Math.max(0, index)).reverse()];
    trigger?.focus();
    onOpenChange(false);
    // A selection can remove its own rule. Wait for that commit before choosing
    // a surviving control, and preserve focus if another interaction moved it.
    requestAnimationFrame(() => {
      if (trigger?.isConnected || document.activeElement !== document.body) return;
      fallbackControls.find(control => control.isConnected && !control.disabled)?.focus();
    });
  };

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      if (!triggerRef.current) return;
      setBox(placeMenuSelect(triggerRef.current.getBoundingClientRect(),
        { width: window.innerWidth, height: window.innerHeight }, MENU_MAX_VISIBLE_ROWS,
        { minWidth, maxVisible: MENU_MAX_VISIBLE_ROWS }));
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open, minWidth]);

  useEffect(() => {
    if (open && box) menuRef.current?.querySelector<HTMLElement>(FIRST_FOCUSABLE)?.focus();
  }, [open, Boolean(box)]);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      onOpenChange(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      close();
    };
    const scroll = (event: Event) => {
      if (event.target instanceof Node && menuRef.current?.contains(event.target)) return;
      onOpenChange(false);
    };
    // Capture phase, so date fields that stop pointerdown propagation still
    // let an outside press close this menu.
    document.addEventListener("pointerdown", dismiss, true);
    document.addEventListener("keydown", escape);
    window.addEventListener("scroll", scroll, true);
    return () => {
      document.removeEventListener("pointerdown", dismiss, true);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("scroll", scroll, true);
    };
  }, [open, onOpenChange]);

  return <>
    <button ref={triggerRef} type="button" className="task-query-rule__trigger"
      aria-label={`${name}: ${value}`} title={title}
      aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? menuId : undefined}
      onClick={() => onOpenChange(!open)}>
      <span className="task-query-rule__field">{name}</span>
      <span className="task-query-rule__value">{value}</span>
    </button>
    {open && box && createPortal(
      <div ref={menuRef} id={menuId} role="dialog" aria-label={menuLabel}
        className={`menu-select__menu task-column-menu${box.openUp ? " menu-select__menu--up" : ""}`}
        style={{ top: box.top, left: box.left, width: box.width, maxHeight: box.maxHeight }}>
        <div className="task-column-menu__head">
          <span>{menuLabel}</span>
          {onReset && <button type="button" className="task-column-menu__reset" onClick={onReset}>Reset</button>}
        </div>
        <div className="task-column-menu__section">{children(close)}</div>
      </div>, triggerRef.current?.closest(".dashboard") ?? document.body,
    )}
  </>;
}
