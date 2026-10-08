import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Task, TaskStatus } from "../../lib/types";
import { checkIcon, chevronDownIcon, chevronRightIcon, eyeOffIcon, filterIcon, sortIcon } from "../components/icons";
import { placeMenuSelect, placeSubmenu, type MenuSelectBox, type SubmenuBox } from "../lib/placeMenuSelect";
import { type ScopeTree } from "../lib/scope";
import { taskSortDirectionLabel, type TaskColumnSort } from "../lib/taskColumnSort";
import type { TaskTableColumn } from "../lib/taskTable";
import { matchingTaskStatusPreset, TASK_STATUSES, TASK_STATUS_LABEL, TASK_STATUS_PRESETS, toggleTaskStatusFilter } from "../lib/tasks";

type ParentFilter = number | "none" | null;
type MenuPane = "sort" | "filter";

const MENU_MIN_WIDTH = 208;
const PARENT_MENU_MIN_WIDTH = 256;
const MENU_MAX_VISIBLE_ROWS = 14;
// Short lists scan faster without a field; long ones need one to stay usable.
const PARENT_SEARCH_THRESHOLD = 8;
// A diagonal move toward an open flyout crosses the neighbouring row; the delay
// keeps that crossing from swapping the flyout out from under the pointer.
const SUBMENU_SWITCH_DELAY_MS = 140;
const FIRST_FOCUSABLE = ".task-column-menu__search, .menu-select__option";

function MenuOption({ selected, marker, wrap, onClick, children }: {
  selected: boolean;
  marker?: ReactNode;
  wrap?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return <button type="button" className={`menu-select__option${wrap ? " task-column-menu__option--wrap" : ""}`} aria-pressed={selected} onClick={onClick}>
    {marker && <span className="menu-select__marker" aria-hidden="true">{marker}</span>}
    <span>{children}</span>
    {selected && <span className="menu-select__check" aria-hidden="true">{checkIcon}</span>}
  </button>;
}

export function TaskTableHeaderMenu({ column, tasks, scopeTree, statuses, onStatusesChange, scope, onScopeChange, parent, onParentChange, sort, onSortChange, onHide, open, onOpenChange }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  column: TaskTableColumn;
  tasks: Task[];
  scopeTree: ScopeTree;
  statuses: TaskStatus[];
  onStatusesChange: (statuses: TaskStatus[]) => void;
  scope: string | null;
  onScopeChange: (scope: string | null) => void;
  parent: ParentFilter;
  onParentChange: (parent: ParentFilter) => void;
  sort: TaskColumnSort | null;
  onSortChange: (sort: TaskColumnSort | null) => void;
  /** Absent for columns that must stay visible. */
  onHide?: () => void;
}) {
  const menuId = useId();
  const submenuId = useId();
  const [box, setBox] = useState<MenuSelectBox | null>(null);
  const [submenu, setSubmenu] = useState<MenuPane | null>(null);
  const [submenuBox, setSubmenuBox] = useState<SubmenuBox | null>(null);
  const [parentQuery, setParentQuery] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Partial<Record<MenuPane, HTMLButtonElement | null>>>({});
  const hoverTimer = useRef<number | undefined>(undefined);
  const focusSubmenuOnOpen = useRef(false);
  const sorted = sort?.column === column.id;
  const filterable = column.id === "status" || column.id === "scope" || column.id === "parent";
  // Columns with a single action skip the row level and show their options directly.
  const nested = filterable || Boolean(onHide);
  const preset = matchingTaskStatusPreset(statuses);
  const filterLabel = column.id === "status" ? preset === "all" ? null : preset ?? `${statuses.length} statuses` : column.id === "scope" ? scope : column.id === "parent" && parent !== null ? parent === "none" ? "No parent" : tasks.find(task => task.id === parent)?.title ?? "Parent" : null;
  const submenuWidth = column.id === "parent" && submenu === "filter" ? PARENT_MENU_MIN_WIDTH : MENU_MIN_WIDTH;
  const close = () => { onOpenChange(false); triggerRef.current?.focus(); };
  const closeSubmenu = (returnFocus: boolean) => {
    window.clearTimeout(hoverTimer.current);
    if (returnFocus && submenu) rowRefs.current[submenu]?.focus();
    setSubmenu(null);
  };
  const openSubmenu = (pane: MenuPane, focus: boolean) => {
    window.clearTimeout(hoverTimer.current);
    focusSubmenuOnOpen.current = focus;
    if (pane === submenu) {
      if (focus) submenuRef.current?.querySelector<HTMLElement>(FIRST_FOCUSABLE)?.focus();
      return;
    }
    setSubmenuBox(null);
    setSubmenu(pane);
  };
  const reset = () => {
    if (column.id === "status") onStatusesChange([...TASK_STATUSES]);
    if (column.id === "scope") onScopeChange(null);
    if (column.id === "parent") onParentChange(null);
    if (sorted) onSortChange(null);
  };

  useEffect(() => {
    if (open) return;
    setParentQuery("");
    setSubmenu(null);
    window.clearTimeout(hoverTimer.current);
  }, [open]);

  useEffect(() => () => window.clearTimeout(hoverTimer.current), []);

  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const trigger = triggerRef.current;
      if (trigger) setBox(placeMenuSelect(trigger.getBoundingClientRect(), { width: window.innerWidth, height: window.innerHeight }, MENU_MAX_VISIBLE_ROWS, {
        minWidth: column.id === "parent" && !nested ? PARENT_MENU_MIN_WIDTH : MENU_MIN_WIDTH,
        maxVisible: MENU_MAX_VISIBLE_ROWS,
      }));
    };
    update();
    window.addEventListener("resize", update);
    const onScroll = (event: Event) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !submenuRef.current?.contains(target)) onOpenChange(false);
    };
    document.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", update);
      document.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  // Measured after the flyout renders hidden, so it can lift to fit its content.
  // Parent search narrows the list without re-placing, so the flyout holds still while typing.
  useLayoutEffect(() => {
    const row = submenu && rowRefs.current[submenu];
    const menu = menuRef.current;
    const flyout = submenuRef.current;
    if (!row || !menu || !flyout) return;
    setSubmenuBox(placeSubmenu(row.getBoundingClientRect(), menu.getBoundingClientRect(), { width: window.innerWidth, height: window.innerHeight }, {
      width: submenuWidth,
      contentHeight: flyout.scrollHeight,
    }));
  }, [submenu, box]);

  useEffect(() => {
    if (!submenuBox || !focusSubmenuOnOpen.current) return;
    focusSubmenuOnOpen.current = false;
    submenuRef.current?.querySelector<HTMLElement>(FIRST_FOCUSABLE)?.focus();
  }, [submenuBox]);

  useEffect(() => {
    if (!open) return;

    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !submenuRef.current?.contains(target) && !triggerRef.current?.contains(target)) onOpenChange(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (submenu) closeSubmenu(true);
      else close();
    };
    document.addEventListener("pointerdown", onPointer, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, box, submenu]);

  useEffect(() => {
    if (open && box) menuRef.current?.querySelector<HTMLElement>(nested ? ".task-column-menu__row, .menu-select__option" : FIRST_FOCUSABLE)?.focus();
  }, [open, Boolean(box)]);

  const hoverRow = (event: ReactPointerEvent, pane: MenuPane | null) => {
    if (event.pointerType !== "mouse" || pane === submenu) {
      window.clearTimeout(hoverTimer.current);
      return;
    }
    window.clearTimeout(hoverTimer.current);
    const apply = () => pane ? openSubmenu(pane, false) : closeSubmenu(false);
    if (submenu === null) apply();
    else hoverTimer.current = window.setTimeout(apply, SUBMENU_SWITCH_DELAY_MS);
  };

  const onRowsKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const rows = [...event.currentTarget.querySelectorAll<HTMLElement>(".menu-select__option")];
    const index = rows.indexOf(document.activeElement as HTMLElement);
    if (index === -1) return;
    event.preventDefault();
    rows[(index + (event.key === "ArrowDown" ? 1 : rows.length - 1)) % rows.length]?.focus();
  };

  const onSubmenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft" && !(event.target instanceof HTMLInputElement)) {
      event.preventDefault();
      closeSubmenu(true);
    }
  };

  const parentOptions: { value: ParentFilter; label: string }[] = column.id === "parent" ? [
    { value: null, label: "All parents" },
    { value: "none", label: "No parent" },
    ...tasks.filter(task => tasks.some(child => child.parentTaskId === task.id))
      .sort((a, b) => a.title.localeCompare(b.title))
      .map(task => ({ value: task.id, label: task.title })),
  ] : [];
  const normalizedParentQuery = parentQuery.trim().toLocaleLowerCase();
  const visibleParentOptions = normalizedParentQuery
    ? parentOptions.filter(option => option.label.toLocaleLowerCase().includes(normalizedParentQuery))
    : parentOptions;

  const sortOptions = (["ascending", "descending"] as const).map(direction => {
    const selected = sorted && sort?.direction === direction;
    return <MenuOption key={direction} selected={selected} marker={direction === "ascending" ? "↑" : "↓"}
      onClick={() => { onSortChange(selected ? null : { column: column.id, direction }); close(); }}>
      {taskSortDirectionLabel({ column: column.id, direction })}
    </MenuOption>;
  });

  const filterOptions = <>
    {column.id === "status" && <>
      <div className="task-column-menu__presets">{TASK_STATUS_PRESETS.map(item => <button key={item.key} type="button" aria-pressed={preset === item.key}
        onClick={() => onStatusesChange([...item.statuses])}>{item.label}</button>)}</div>
      {TASK_STATUSES.map(status => <MenuOption key={status} selected={statuses.includes(status)}
        marker={<span className={`status-dot status-dot--${status}`}/>}
        onClick={() => onStatusesChange(toggleTaskStatusFilter(statuses, status))}>
        {TASK_STATUS_LABEL[status]}
      </MenuOption>)}
    </>}
    {column.id === "scope" && [null, ...[...scopeTree.byPath.keys()].sort((a, b) => a.localeCompare(b))].map(path =>
      <MenuOption key={path ?? "all"} selected={scope === path} onClick={() => { onScopeChange(path); close(); }}>
        {path ?? "All scopes"}
      </MenuOption>)}
    {column.id === "parent" && <>
      {parentOptions.length > PARENT_SEARCH_THRESHOLD && <input type="search" className="task-column-menu__search"
        placeholder="Find a parent…" aria-label="Find a parent" value={parentQuery}
        onChange={event => setParentQuery(event.target.value)}/>}
      {visibleParentOptions.map(option => <MenuOption key={option.value ?? "all"} wrap selected={parent === option.value}
        onClick={() => { onParentChange(option.value); close(); }}>
        {option.label}
      </MenuOption>)}
      {visibleParentOptions.length === 0 && <div className="task-column-menu__empty">No matching parents</div>}
    </>}
  </>;

  const paneRow = (pane: MenuPane, label: string, icon: ReactNode, hint: string | null) =>
    <button ref={element => { rowRefs.current[pane] = element; }} type="button"
      className={`menu-select__option task-column-menu__row${submenu === pane ? " is-open" : ""}`}
      aria-haspopup="true" aria-expanded={submenu === pane} aria-controls={submenu === pane ? submenuId : undefined}
      onPointerEnter={event => hoverRow(event, pane)}
      onClick={() => openSubmenu(pane, true)}
      onKeyDown={event => { if (event.key === "ArrowRight") { event.preventDefault(); openSubmenu(pane, true); } }}>
      <span className="menu-select__marker" aria-hidden="true">{icon}</span>
      <span>{label}</span>
      <span className="task-column-menu__hint">{hint}</span>
      <span className="task-column-menu__chevron" aria-hidden="true">{chevronRightIcon}</span>
    </button>;

  const menuLabel = `${filterable ? "Sort and filter" : "Sort"} ${column.label}`;
  return <>
    <button ref={triggerRef} type="button" className={`task-column-trigger${sorted || filterLabel ? " is-active" : ""}`}
      aria-label={`${menuLabel}${filterLabel ? `, ${filterLabel}` : ""}${sorted ? `, sorted ${sort?.direction}` : ""}`}
      aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? menuId : undefined}
      onPointerDown={event => event.stopPropagation()} onClick={() => onOpenChange(!open)}>
      <span>{column.label}</span>
      <span aria-hidden="true">{sorted ? sort?.direction === "ascending" ? "↑" : "↓" : chevronDownIcon}</span>
    </button>
    {open && box && createPortal(<>
      <div ref={menuRef} id={menuId} role="dialog" aria-label={menuLabel}
        className={`menu-select__menu task-column-menu${box.openUp ? " menu-select__menu--up" : ""}`}
        style={{ top: box.top, left: box.left, width: box.width, maxHeight: box.maxHeight }}>
        <div className="task-column-menu__head">
          <span>{column.label}</span>
          {(sorted || filterLabel) && <button type="button" className="task-column-menu__reset" onClick={reset}>Reset</button>}
        </div>

        {nested ? <div className="task-column-menu__section" onKeyDown={onRowsKeyDown}>
          {paneRow("sort", "Sort", sortIcon, sorted && sort ? taskSortDirectionLabel(sort) : null)}
          {filterable && paneRow("filter", "Filter", filterIcon, filterLabel)}
          {onHide && <button type="button" className="menu-select__option task-column-menu__row task-column-menu__row--action"
            onPointerEnter={event => hoverRow(event, null)}
            onClick={() => { onOpenChange(false); onHide(); }}>
            <span className="menu-select__marker" aria-hidden="true">{eyeOffIcon}</span>
            <span>Hide column</span>
          </button>}
        </div> : <div className="task-column-menu__section" role="group" aria-label="Sort">
          <div className="task-column-menu__label">Sort</div>
          {sortOptions}
        </div>}
      </div>
      {submenu && <div ref={submenuRef} id={submenuId} role="group" aria-label={submenu === "sort" ? "Sort" : "Filter"}
        className="menu-select__menu task-column-menu task-column-menu--submenu"
        style={submenuBox
          ? { top: submenuBox.top, left: submenuBox.left, width: submenuBox.width, maxHeight: submenuBox.maxHeight }
          : { top: 0, left: 0, width: submenuWidth, visibility: "hidden" }}
        onPointerEnter={() => window.clearTimeout(hoverTimer.current)}
        onKeyDown={onSubmenuKeyDown}>
        {submenu === "sort" ? sortOptions : filterOptions}
      </div>}
    </>, triggerRef.current?.closest(".dashboard") ?? document.body)}
  </>;
}
