import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Task, TaskStatus } from "../../lib/types";
import { DayCalendar } from "../components/DayPicker";
import { checkIcon, chevronDownIcon, chevronRightIcon, eyeOffIcon, filterIcon, sortIcon, xIcon } from "../components/icons";
import { useDismiss } from "../hooks/useDismiss";
import { placeMenuSelect, placeSubmenu, type MenuSelectBox, type SubmenuBox } from "../lib/placeMenuSelect";
import { type ScopeTree } from "../lib/scope";
import {
  formatTaskDateDay,
  matchingTaskDatePreset,
  TASK_DATE_PRESETS,
  taskDateFilterCalendarRange,
  taskDateFilterInputValues,
  taskDateFilterLabel,
  type TaskDateFilter,
  type TaskDatePreset,
} from "../lib/taskDateFilter";
import {
  matchingTaskScorePreset,
  selectedTaskScores,
  TASK_SCORE_PRESETS,
  taskScoreFilterLabel,
  toggleTaskScoreFilter,
  type TaskScoreFilter,
} from "../lib/taskScoreFilter";
import { taskSortDirectionLabel, type TaskColumnSort } from "../lib/taskColumnSort";
import type { TaskTableColumn } from "../lib/taskTable";
import type { TaskParentFilter } from "../lib/taskTableViews";
import { matchingTaskStatusPreset, RATING_VALUES, TASK_STATUSES, TASK_STATUS_LABEL, TASK_STATUS_PRESETS, taskStatusFilterLabel, toggleTaskStatusFilter } from "../lib/tasks";
import { formatCompactDuration, taskDisplayedWorkedSeconds, toDateInput } from "../lib/time";
import {
  includeWorkedTimeThreshold,
  nearestWorkedTimeStopIndex,
  TASK_WORKED_TIME_COMPARATORS,
  taskWorkedTimeFilterLabel,
  workedTimeStops,
  type TaskWorkedTimeComparator,
  type TaskWorkedTimeFilter,
} from "../lib/taskWorkedTimeFilter";

type MenuPane = "sort" | "filter";

const MENU_MIN_WIDTH = 208;
const PARENT_MENU_MIN_WIDTH = 256;
const MENU_MAX_VISIBLE_ROWS = 14;
// Short lists scan faster without a field; long ones need one to stay usable.
const PARENT_SEARCH_THRESHOLD = 8;
// A diagonal move toward an open flyout crosses the neighbouring row; the delay
// keeps that crossing from swapping the flyout out from under the pointer.
const SUBMENU_SWITCH_DELAY_MS = 140;
const FIRST_FOCUSABLE = ".task-column-menu__search, .task-column-menu__preset-trigger, .task-column-menu__date, .task-column-menu__range input, .task-column-menu__presets button, .menu-select__option";
// Created/Updated reuse Calendar's DayPicker, which blocks future days. Unix 0
// is the lower bound so any past Created or Updated day stays pickable.
const DATE_FILTER_EARLIEST_SEC = 0;

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

function TaskDateBoundField({ label, day, nowMs, editing, onEdit, onClear }: {
  label: string;
  day: string;
  nowMs: number;
  editing: boolean;
  onEdit: () => void;
  onClear: () => void;
}) {
  const filled = day !== "";
  return <div className="task-column-menu__date-row">
    <span>{label}</span>
    <div className={`task-column-menu__date-wrap${editing ? " is-editing" : ""}`}>
      <button type="button" className={`task-column-menu__date${filled ? "" : " is-empty"}`}
        aria-label={`${label} date`} aria-pressed={editing}
        onPointerDown={event => event.stopPropagation()} onClick={onEdit}>
        {filled ? formatTaskDateDay(day, nowMs) : "—"}
      </button>
      {filled && <button type="button" className="task-column-menu__date-clear" aria-label={`Clear ${label.toLowerCase()} date`}
        onPointerDown={event => event.stopPropagation()} onClick={onClear}>
        {xIcon}
      </button>}
    </div>
  </div>;
}

function TaskDateFilterFields({ filter, onChange }: {
  filter: TaskDateFilter;
  onChange: (filter: TaskDateFilter) => void;
}) {
  const nowMs = Date.now();
  const preset = matchingTaskDatePreset(filter, nowMs);
  const inputs = taskDateFilterInputValues(filter, nowMs);
  const [presetOpen, setPresetOpen] = useState(false);
  const [editing, setEditing] = useState<"from" | "to">("from");
  const presetRef = useRef<HTMLDivElement>(null);
  const presetLabel = preset
    ? TASK_DATE_PRESETS.find(item => item.key === preset)?.label ?? "Any date"
    : filter
      ? "Custom"
      : "Any date";
  const writeRange = (fromDay: string, toDay: string) => {
    const nextFrom = fromDay || null;
    const nextTo = toDay || null;
    onChange(nextFrom === null && nextTo === null ? null : { kind: "range", fromDay: nextFrom, toDay: nextTo });
  };
  const choosePreset = (next: TaskDatePreset | null) => {
    onChange(next === null ? null : { kind: "preset", preset: next });
    setPresetOpen(false);
  };
  useDismiss(presetRef, presetOpen, () => { setPresetOpen(false); });
  useEffect(() => {
    if (!presetOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setPresetOpen(false);
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [presetOpen]);
  return <div className="task-column-menu__dates">
    <div ref={presetRef} className="task-column-menu__preset">
      <button type="button" className="task-column-menu__preset-trigger" aria-haspopup="true"
        aria-expanded={presetOpen} aria-label="Date range"
        onPointerDown={event => event.stopPropagation()}
        onClick={() => setPresetOpen(open => !open)}>
        <span>{presetLabel}</span>
        <span className="task-column-menu__chevron" aria-hidden="true">{chevronDownIcon}</span>
      </button>
      {presetOpen && <div className="task-column-menu__preset-menu" role="group" aria-label="Date range">
        <MenuOption selected={filter === null} onClick={() => choosePreset(null)}>Any date</MenuOption>
        {TASK_DATE_PRESETS.map(item =>
          <MenuOption key={item.key} selected={preset === item.key} onClick={() => choosePreset(item.key)}>
            {item.label}
          </MenuOption>)}
      </div>}
    </div>
    <TaskDateBoundField label="From" day={inputs.fromDay} nowMs={nowMs} editing={editing === "from"}
      onEdit={() => setEditing("from")} onClear={() => writeRange("", inputs.toDay)} />
    <TaskDateBoundField label="To" day={inputs.toDay} nowMs={nowMs} editing={editing === "to"}
      onEdit={() => setEditing("to")} onClear={() => writeRange(inputs.fromDay, "")} />
    <div className="task-column-menu__calendar">
      <DayCalendar earliestSec={DATE_FILTER_EARLIEST_SEC} nowMs={nowMs}
        selected={taskDateFilterCalendarRange(filter, nowMs)}
        onPick={dayMs => {
          const day = toDateInput(Math.floor(dayMs / 1000));
          if (editing === "from") {
            writeRange(day, inputs.toDay);
            setEditing("to");
          } else {
            writeRange(inputs.fromDay, day);
          }
        }} />
    </div>
  </div>;
}

function TaskScoreFilterFields({ filter, onChange }: {
  filter: TaskScoreFilter;
  onChange: (filter: TaskScoreFilter) => void;
}) {
  const preset = matchingTaskScorePreset(filter);
  const selected = selectedTaskScores(filter);
  return <>
    <div className="task-column-menu__presets">{TASK_SCORE_PRESETS.map(item =>
      <button key={item.key} type="button" aria-pressed={preset === item.key}
        onClick={() => onChange(item.key === "all" ? null : { kind: "none" })}>{item.label}</button>)}</div>
    {RATING_VALUES.map(score =>
      <MenuOption key={score} selected={selected.includes(score)}
        onClick={() => onChange(toggleTaskScoreFilter(filter, score))}>
        {score}
      </MenuOption>)}
  </>;
}

function TaskWorkedTimeFilterFields({ filter, onChange, candidates }: {
  filter: TaskWorkedTimeFilter;
  onChange: (filter: TaskWorkedTimeFilter) => void;
  candidates: Task[];
}) {
  // Snapshot at flyout open so a live Working now total cannot rebuild the line.
  const [stops] = useState(() =>
    includeWorkedTimeThreshold(
      workedTimeStops(candidates.map(task => taskDisplayedWorkedSeconds(task, Date.now()))),
      filter,
    ));
  const comparator = filter?.comparator ?? "more";
  const index = nearestWorkedTimeStopIndex(stops, filter?.seconds ?? stops[0] ?? 0);
  const seconds = stops[index] ?? 0;
  const maxIndex = Math.max(0, stops.length - 1);
  const progress = maxIndex === 0 ? 0 : (index / maxIndex) * 100;
  const write = (nextComparator: TaskWorkedTimeComparator, nextSeconds: number) =>
    onChange({ comparator: nextComparator, seconds: nextSeconds });
  return <div className="task-column-menu__worked">
    <div className="task-column-menu__presets" role="group" aria-label="Worked time comparison">
      {TASK_WORKED_TIME_COMPARATORS.map(item =>
        <button key={item.key} type="button" aria-pressed={comparator === item.key}
          onClick={() => write(item.key, seconds)}>{item.label}</button>)}
    </div>
    <label className="task-column-menu__range" style={{ "--range-progress": `${progress}%` } as CSSProperties}>
      <span className="task-column-menu__range-value">{formatCompactDuration(seconds)}</span>
      <input type="range" min={0} max={maxIndex} step={1} value={index}
        aria-label="Worked time" aria-valuetext={formatCompactDuration(seconds)}
        onPointerDown={event => event.stopPropagation()}
        onChange={event => write(comparator, stops[Number(event.target.value)] ?? 0)} />
      <span className="task-column-menu__range-scale">
        <span>{formatCompactDuration(stops[0] ?? 0)}</span>
        <span>{formatCompactDuration(stops[stops.length - 1] ?? 0)}</span>
      </span>
    </label>
  </div>;
}

export function TaskTableHeaderMenu({ column, tasks, scopeTree, statuses, onStatusesChange, scope, onScopeChange, parent, onParentChange, createdFilter, onCreatedFilterChange, updatedFilter, onUpdatedFilterChange, valueFilter, onValueFilterChange, effortFilter, onEffortFilterChange, workedTimeFilter, onWorkedTimeFilterChange, workedTimeCandidates, sort, onSortChange, onHide, open, onOpenChange, edited }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  edited: boolean;
  column: TaskTableColumn;
  tasks: Task[];
  scopeTree: ScopeTree;
  statuses: TaskStatus[];
  onStatusesChange: (statuses: TaskStatus[]) => void;
  scope: string | null;
  onScopeChange: (scope: string | null) => void;
  parent: TaskParentFilter;
  onParentChange: (parent: TaskParentFilter) => void;
  createdFilter: TaskDateFilter;
  onCreatedFilterChange: (filter: TaskDateFilter) => void;
  updatedFilter: TaskDateFilter;
  onUpdatedFilterChange: (filter: TaskDateFilter) => void;
  valueFilter: TaskScoreFilter;
  onValueFilterChange: (filter: TaskScoreFilter) => void;
  effortFilter: TaskScoreFilter;
  onEffortFilterChange: (filter: TaskScoreFilter) => void;
  workedTimeFilter: TaskWorkedTimeFilter;
  onWorkedTimeFilterChange: (filter: TaskWorkedTimeFilter) => void;
  workedTimeCandidates: Task[];
  sort: TaskColumnSort[];
  onSortChange: (sort: TaskColumnSort[]) => void;
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
  const columnSort = sort.find(rule => rule.column === column.id);
  const sorted = columnSort !== undefined;
  const dateFilter = column.id === "created" ? createdFilter : column.id === "updated" ? updatedFilter : null;
  const onDateFilterChange = column.id === "created" ? onCreatedFilterChange : column.id === "updated" ? onUpdatedFilterChange : null;
  const scoreFilter = column.id === "value" ? valueFilter : column.id === "effort" ? effortFilter : null;
  const onScoreFilterChange = column.id === "value" ? onValueFilterChange : column.id === "effort" ? onEffortFilterChange : null;
  const filterable = column.id === "status" || column.id === "scope" || column.id === "parent" || column.id === "created" || column.id === "updated" || column.id === "value" || column.id === "effort" || column.id === "workedTime";
  // Columns with a single action skip the row level and show their options directly.
  const nested = filterable || Boolean(onHide);
  const preset = matchingTaskStatusPreset(statuses);
  const dateFilterLabel = column.id === "created" || column.id === "updated" ? taskDateFilterLabel(dateFilter) : null;
  const filterLabel = column.id === "status" ? preset === "all" ? null : taskStatusFilterLabel(statuses) : column.id === "scope" ? scope : column.id === "parent" && parent !== null ? parent === "none" ? "No parent" : tasks.find(task => task.id === parent)?.title ?? "Parent" : column.id === "value" || column.id === "effort" ? taskScoreFilterLabel(scoreFilter) : column.id === "workedTime" ? taskWorkedTimeFilterLabel(workedTimeFilter) : dateFilterLabel;
  const wideFilter = column.id === "parent" || column.id === "created" || column.id === "updated" || column.id === "workedTime";
  const submenuWidth = wideFilter && submenu === "filter" ? PARENT_MENU_MIN_WIDTH : MENU_MIN_WIDTH;
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
    if (column.id === "created") onCreatedFilterChange(null);
    if (column.id === "updated") onUpdatedFilterChange(null);
    if (column.id === "value") onValueFilterChange(null);
    if (column.id === "effort") onEffortFilterChange(null);
    if (column.id === "workedTime") onWorkedTimeFilterChange(null);
    if (sorted) onSortChange(sort.filter(rule => rule.column !== column.id));
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
      if (menuRef.current?.contains(target) || submenuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      onOpenChange(false);
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
    const target = event.target;
    if (event.key === "ArrowLeft"
      && !(target instanceof HTMLInputElement)
      && !(target instanceof HTMLSelectElement)
      && !(target instanceof Element && target.closest(".task-column-menu__calendar"))) {
      event.preventDefault();
      closeSubmenu(true);
    }
  };

  const parentOptions: { value: TaskParentFilter; label: string }[] = column.id === "parent" ? [
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
    const selected = sorted && columnSort?.direction === direction;
    return <MenuOption key={direction} selected={selected} marker={direction === "ascending" ? "↑" : "↓"}
      onClick={() => { onSortChange(selected ? sort.filter(rule => rule.column !== column.id) : sorted
        ? sort.map(rule => rule.column === column.id ? { ...rule, direction } : rule)
        : [...sort, { column: column.id, direction }]); close(); }}>
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
    {onDateFilterChange && <TaskDateFilterFields filter={dateFilter} onChange={onDateFilterChange} />}
    {onScoreFilterChange && <TaskScoreFilterFields filter={scoreFilter} onChange={onScoreFilterChange} />}
    {column.id === "workedTime" && <TaskWorkedTimeFilterFields filter={workedTimeFilter} onChange={onWorkedTimeFilterChange} candidates={workedTimeCandidates} />}
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
    <button ref={triggerRef} type="button" className={`task-column-trigger${edited ? " is-active" : ""}`}
      aria-label={`${menuLabel}${filterLabel ? `, ${filterLabel}` : ""}${sorted ? `, sorted ${columnSort?.direction}` : ""}`}
      aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? menuId : undefined}
      onPointerDown={event => event.stopPropagation()} onClick={() => onOpenChange(!open)}>
      <span>{column.label}</span>
      <span aria-hidden="true">{sorted ? (columnSort?.direction === "ascending" ? "↑" : "↓") : chevronDownIcon}</span>
    </button>
    {open && box && createPortal(<>
      <div ref={menuRef} id={menuId} role="dialog" aria-label={menuLabel}
        className={`menu-select__menu task-column-menu${box.openUp ? " menu-select__menu--up" : ""}`}
        style={{ top: box.top, left: box.left, width: box.width, maxHeight: box.maxHeight }}
        onPointerDown={event => event.stopPropagation()}>
        <div className="task-column-menu__head">
          <span>{column.label}</span>
          {(sorted || filterLabel) && <button type="button" className="task-column-menu__reset" onClick={reset}>Reset</button>}
        </div>

        {nested ? <div className="task-column-menu__section" onKeyDown={onRowsKeyDown}>
          {paneRow("sort", "Sort", sortIcon, columnSort ? taskSortDirectionLabel(columnSort) : null)}
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
        onPointerDown={event => event.stopPropagation()}
        onPointerEnter={() => window.clearTimeout(hoverTimer.current)}
        onKeyDown={onSubmenuKeyDown}>
        {submenu === "sort" ? sortOptions : filterOptions}
      </div>}
    </>, triggerRef.current?.closest(".dashboard") ?? document.body)}
  </>;
}
