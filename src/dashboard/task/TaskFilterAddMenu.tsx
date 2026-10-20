import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { plusIcon } from "../components/icons";
import { placeMenuSelect, type MenuSelectBox } from "../lib/placeMenuSelect";
import type { TaskTableFilterField } from "../lib/taskTableViews";

const MENU_MIN_WIDTH = 160;

/** Lists the filters that have no row yet; picking one hands its field to the caller,
 * which adds the row and opens its editor. */
export function TaskFilterAddMenu({ options, onPick }: {
  options: readonly { field: TaskTableFilterField; name: string }[];
  onPick: (field: TaskTableFilterField) => void;
}) {
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<MenuSelectBox | null>(null);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      if (!triggerRef.current) return;
      setBox(placeMenuSelect(triggerRef.current.getBoundingClientRect(),
        { width: window.innerWidth, height: window.innerHeight }, options.length,
        { minWidth: MENU_MIN_WIDTH, maxVisible: options.length }));
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open, options.length]);

  useEffect(() => {
    if (open && box) menuRef.current?.querySelector<HTMLElement>("button")?.focus();
  }, [open, Boolean(box)]);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      close();
    };
    const scroll = (event: Event) => {
      if (event.target instanceof Node && menuRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss, true);
    document.addEventListener("keydown", escape);
    window.addEventListener("scroll", scroll, true);
    return () => {
      document.removeEventListener("pointerdown", dismiss, true);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("scroll", scroll, true);
    };
  }, [open]);

  return <>
    <button ref={triggerRef} type="button" className="task-query__action task-query__add"
      aria-label="Add filter" title="Add filter" disabled={options.length === 0}
      aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
      onClick={() => setOpen(current => !current)}>{plusIcon}</button>
    {open && box && createPortal(
      <div ref={menuRef} id={menuId} role="menu" aria-label="Add filter"
        className={`menu-select__menu task-column-menu${box.openUp ? " menu-select__menu--up" : ""}`}
        style={{ top: box.top, left: box.left, width: box.width, maxHeight: box.maxHeight }}>
        <div className="task-column-menu__section">
          {options.map(option => <button key={option.field} type="button" role="menuitem" className="menu-select__option"
            onClick={() => { setOpen(false); onPick(option.field); }}>
            <span>{option.name}</span>
          </button>)}
        </div>
      </div>, triggerRef.current?.closest(".dashboard") ?? document.body,
    )}
  </>;
}
