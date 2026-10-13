import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { chevronDownIcon } from "../components/icons";
import { placeMenuSelect, type MenuSelectBox } from "../lib/placeMenuSelect";
import { taskDateFilterLabel, type TaskDateFilter } from "../lib/taskDateFilter";
import { TaskDateFilterFields } from "./TaskTableHeaderMenu";

export function TaskWorkedOnFilter({ filter, onChange, nowMs, edited, open, onOpenChange }: {
  filter: TaskDateFilter;
  onChange: (filter: TaskDateFilter) => void;
  nowMs: number;
  edited: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<MenuSelectBox | null>(null);
  const label = taskDateFilterLabel(filter, nowMs) ?? "All dates";

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      if (!triggerRef.current) return;
      setBox(placeMenuSelect(triggerRef.current.getBoundingClientRect(),
        { width: window.innerWidth, height: window.innerHeight }, 16,
        { minWidth: 256, maxVisible: 16 }));
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open]);

  useEffect(() => {
    if (!open || !box) return;
    menuRef.current?.querySelector<HTMLElement>("button")?.focus();
  }, [open, box]);

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
      onOpenChange(false);
      triggerRef.current?.focus();
    };
    const scroll = (event: Event) => {
      if (event.target instanceof Node && menuRef.current?.contains(event.target)) return;
      onOpenChange(false);
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    window.addEventListener("scroll", scroll, true);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("scroll", scroll, true);
    };
  }, [open, onOpenChange]);

  return <>
    <li className={`task-query-rule task-query-rule--worked-on${filter ? "" : " is-unset"}${edited ? " is-edited" : ""}`}>
      <button ref={triggerRef} type="button" className="task-worked-on-trigger"
        aria-label={`Worked on: ${label}`} title={edited ? `Worked on: ${label} (unsaved)` : `Worked on: ${label}`}
        aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? menuId : undefined}
        onClick={() => onOpenChange(!open)}>
        <span className="task-query-rule__field">Worked on</span>
        <span className="task-query-rule__value">{label}</span>
        <span className="task-views__chevron" aria-hidden="true">{chevronDownIcon}</span>
      </button>
      {filter && <button type="button" className="task-query-rule__remove" aria-label={`Remove Worked on: ${label}`} onClick={() => onChange(null)}>×</button>}
    </li>
    {open && box && createPortal(
      <div ref={menuRef} id={menuId} role="dialog" aria-label="Worked on"
        className={`menu-select__menu task-column-menu${box.openUp ? " menu-select__menu--up" : ""}`}
        style={{ top: box.top, left: box.left, width: box.width, maxHeight: box.maxHeight }}>
        <div className="task-column-menu__head">
          <span>Worked on</span>
          {filter && <button type="button" className="task-column-menu__reset" onClick={() => onChange(null)}>Reset</button>}
        </div>
        <TaskDateFilterFields filter={filter} onChange={onChange} emptyLabel="All dates" />
      </div>, triggerRef.current?.closest(".dashboard") ?? document.body,
    )}
  </>;
}
