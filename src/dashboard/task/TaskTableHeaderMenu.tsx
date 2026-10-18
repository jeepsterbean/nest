import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Task } from "../../lib/types";
import { DayCalendar } from "../components/DayPicker";
import { checkIcon, chevronDownIcon, chevronRightIcon, eyeOffIcon, filterIcon, sortIcon, xIcon } from "../components/icons";
import { useDismiss } from "../hooks/useDismiss";
import { placeMenuSelect, placeSubmenu, type MenuSelectBox, type SubmenuBox } from "../lib/placeMenuSelect";
import {
  formatTaskDateDay,
  matchingTaskDatePreset,
  TASK_DATE_PRESETS,
  taskDateFilterCalendarRange,
  taskDateFilterInputValues,
  type TaskDateFilter,
  type TaskDatePreset,
} from "../lib/taskDateFilter";
import {
  matchingTaskScorePreset,
  selectedTaskScores,
  TASK_SCORE_PRESETS,
  toggleTaskScoreFilter,
  type TaskScoreFilter,
} from "../lib/taskScoreFilter";
import { taskSortDirectionLabel, type TaskColumnSort } from "../lib/taskColumnSort";
import type { TaskTableColumn, TaskTableColumnId } from "../lib/taskTable";
import { clearedTaskTableFilter, taskTableFilterLabel } from "../lib/taskTableFilterRules";
import { TASK_COLUMN_FILTER_FIELD, type TaskParentFilter, type TaskTableFilterField, type TaskTableQuery } from "../lib/taskTableViews";
import { matchingTaskStatusPreset, RATING_VALUES, TASK_STATUSES, TASK_STATUS_LABEL, TASK_STATUS_PRESETS, toggleTaskStatusFilter } from "../lib/tasks";
import { formatCompactDuration, taskDisplayedWorkedSeconds, toDateInput } from "../lib/time";
import {
  includeWorkedTimeThreshold,
  nearestWorkedTimeStopIndex,
  TASK_WORKED_TIME_COMPARATORS,
  workedTimeStops,
  type TaskWorkedTimeComparator,
  type TaskWorkedTimeFilter,
} from "../lib/taskWorkedTimeFilter";

type MenuPane = "sort" | "filter";

export const MENU_MIN_WIDTH = 208;
export const WIDE_MENU_MIN_WIDTH = 256;
const MENU_MAX_VISIBLE_ROWS = 14;
// Short lists scan faster without a field; long ones need one to stay usable.
const PARENT_SEARCH_THRESHOLD = 8;
// A diagonal move toward an open flyout crosses the neighbouring row; the delay
// keeps that crossing from swapping the flyout out from under the pointer.
const SUBMENU_SWITCH_DELAY_MS = 140;
export const FIRST_FOCUSABLE = ".task-column-menu__search, .task-column-menu__preset-trigger, .task-column-menu__date, .task-column-menu__range input, .task-column-menu__presets button, .menu-select__option";
// Date columns reuse Calendar's DayPicker, which blocks future days. Unix 0
// is the lower bound so any past Created, Updated, or Closed day stays pickable.
const DATE_FILTER_EARLIEST_SEC = 0;

export function MenuOption({ selected, marker, wrap, onClick, children }: {
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

function TaskDateFilterFields({ filter, onChange, emptyLabel = "Any date" }: {
  filter: TaskDateFilter;
  onChange: (filter: TaskDateFilter) => void;
  emptyLabel?: string;
}) {
  const nowMs = Date.now();
  const preset = matchingTaskDatePreset(filter, nowMs);
  const inputs = taskDateFilterInputValues(filter, nowMs);
  const [presetOpen, setPresetOpen] = useState(false);
  const [editing, setEditing] = useState<"from" | "to">("from");
  const presetRef = useRef<HTMLDivElement>(null);
  const presetLabel = preset
    ? TASK_DATE_PRESETS.find(item => item.key === preset)?.label ?? emptyLabel
    : filter
      ? "Custom"
      : emptyLabel;
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
        <MenuOption selected={filter === null} onClick={() => choosePreset(null)}>{emptyLabel}</MenuOption>
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

function TaskWorkedTimeFilterFields({ filter, onChange, candidates, workedSecondsByTask }: {
  filter: TaskWorkedTimeFilter;
  onChange: (filter: TaskWorkedTimeFilter) => void;
  candidates: Task[];
  workedSecondsByTask: ReadonlyMap<number, number> | null;
}) {
  // Snapshot at flyout open so a live Working now total cannot rebuild the line.
  const [stops] = useState(() =>
    includeWorkedTimeThreshold(
      workedTimeStops(candidates.map(task => workedSecondsByTask ? workedSecondsByTask.get(task.id) ?? 0 : taskDisplayedWorkedSeconds(task, Date.now()))),
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

/** What a filter editor needs beyond the query itself. */
export type TaskFilterContext = {
  tasks: Task[];
  workedTimeCandidates: Task[];
  workedSecondsByTask: ReadonlyMap<number, number> | null;
  workHistoryStatus: string | null;
};

// These editors need room for a calendar, a slider, or long Task titles.
const WIDE_FILTER_FIELDS = new Set<TaskTableFilterField>(["parent", "created", "updated", "closed", "workedOn", "statusChanged", "workedTime"]);
export const taskFilterMenuWidth = (field: TaskTableFilterField) =>
  WIDE_FILTER_FIELDS.has(field) ? WIDE_MENU_MIN_WIDTH : MENU_MIN_WIDTH;

/** One filter's editor, shared by column header menus and the query's rule menus.
 * `onDone` closes the menu after single-choice picks. */
export function TaskFilterFields({ field, query, onQueryChange, context, onDone }: {
  field: TaskTableFilterField;
  query: TaskTableQuery;
  onQueryChange: (patch: Partial<TaskTableQuery>) => void;
  context: TaskFilterContext;
  onDone: () => void;
}) {
  const [parentQuery, setParentQuery] = useState("");
  switch (field) {
    case "statuses": {
      const preset = matchingTaskStatusPreset(query.statuses);
      return <>
        <div className="task-column-menu__presets">{TASK_STATUS_PRESETS.map(item => <button key={item.key} type="button" aria-pressed={preset === item.key}
          onClick={() => onQueryChange({ statuses: [...item.statuses] })}>{item.label}</button>)}</div>
        {TASK_STATUSES.map(status => <MenuOption key={status} selected={query.statuses.includes(status)}
          marker={<span className={`status-dot status-dot--${status}`}/>}
          onClick={() => onQueryChange({ statuses: toggleTaskStatusFilter(query.statuses, status) })}>
          {TASK_STATUS_LABEL[status]}
        </MenuOption>)}
      </>;
    }
    case "parent": {
      const options: { value: TaskParentFilter; label: string }[] = [
        { value: null, label: "All parents" },
        { value: "none", label: "No parent" },
        ...context.tasks.filter(task => context.tasks.some(child => child.parentTaskId === task.id))
          .sort((a, b) => a.title.localeCompare(b.title))
          .map(task => ({ value: task.id, label: task.title })),
      ];
      const needle = parentQuery.trim().toLocaleLowerCase();
      const visible = needle ? options.filter(option => option.label.toLocaleLowerCase().includes(needle)) : options;
      return <>
        {options.length > PARENT_SEARCH_THRESHOLD && <input type="search" className="task-column-menu__search"
          placeholder="Find a parent…" aria-label="Find a parent" value={parentQuery}
          onChange={event => setParentQuery(event.target.value)}/>}
        {visible.map(option => <MenuOption key={option.value ?? "all"} wrap selected={query.parent === option.value}
          onClick={() => { onQueryChange({ parent: option.value }); onDone(); }}>
          {option.label}
        </MenuOption>)}
        {visible.length === 0 && <div className="task-column-menu__empty">No matching parents</div>}
      </>;
    }
    case "created":
    case "updated":
    case "closed":
    case "workedOn":
    case "statusChanged":
      return <TaskDateFilterFields filter={query[field]} onChange={filter => onQueryChange({ [field]: filter })} />;
    case "value":
    case "effort":
      return <TaskScoreFilterFields filter={query[field]} onChange={filter => onQueryChange({ [field]: filter })} />;
    case "workedTime":
      return context.workHistoryStatus
        ? <div className="task-column-menu__empty" role="status">{context.workHistoryStatus}</div>
        : <TaskWorkedTimeFilterFields filter={query.workedTime} onChange={workedTime => onQueryChange({ workedTime })}
          candidates={context.workedTimeCandidates} workedSecondsByTask={context.workedSecondsByTask} />;
  }
}

/** Ascending / descending picks for one column; picking the active direction removes the sort. */
export function TaskSortDirectionOptions({ column, sort, onSortChange, onDone }: {
  column: TaskTableColumnId;
  sort: TaskColumnSort[];
  onSortChange: (sort: TaskColumnSort[]) => void;
  onDone: () => void;
}) {
  const columnSort = sort.find(rule => rule.column === column);
  return <>{(["ascending", "descending"] as const).map(direction => {
    const selected = columnSort?.direction === direction;
    return <MenuOption key={direction} selected={selected} marker={direction === "ascending" ? "↑" : "↓"}
      onClick={() => { onSortChange(selected ? sort.filter(rule => rule.column !== column) : columnSort
        ? sort.map(rule => rule.column === column ? { ...rule, direction } : rule)
        : [...sort, { column, direction }]); onDone(); }}>
      {taskSortDirectionLabel({ column, direction })}
    </MenuOption>;
  })}</>;
}

export function TaskTableHeaderMenu({ column, query, onQueryChange, filterContext, onHide, open, onOpenChange, edited }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  edited: boolean;
  column: TaskTableColumn;
  query: TaskTableQuery;
  onQueryChange: (patch: Partial<TaskTableQuery>) => void;
  filterContext: TaskFilterContext;
  /** Absent for columns that must stay visible. */
  onHide?: () => void;
}) {
  const menuId = useId();
  const submenuId = useId();
  const [box, setBox] = useState<MenuSelectBox | null>(null);
  const [submenu, setSubmenu] = useState<MenuPane | null>(null);
  const [submenuBox, setSubmenuBox] = useState<SubmenuBox | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Partial<Record<MenuPane, HTMLButtonElement | null>>>({});
  const hoverTimer = useRef<number | undefined>(undefined);
  const focusSubmenuOnOpen = useRef(false);
  const { sort } = query;
  const onSortChange = (next: TaskColumnSort[]) => onQueryChange({ sort: next });
  const columnSort = sort.find(rule => rule.column === column.id);
  const sorted = columnSort !== undefined;
  const filterField = TASK_COLUMN_FILTER_FIELD[column.id];
  const filterable = filterField !== undefined;
  // Columns with a single action skip the row level and show their options directly.
  const nested = filterable || Boolean(onHide);
  const filterLabel = filterField
    ? taskTableFilterLabel(filterField, query, id => filterContext.tasks.find(task => task.id === id)?.title, Date.now())
    : null;
  const submenuWidth = filterField && submenu === "filter" ? taskFilterMenuWidth(filterField) : MENU_MIN_WIDTH;
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
  const reset = () => onQueryChange({
    ...(filterField ? clearedTaskTableFilter(filterField) : {}),
    ...(sorted ? { sort: sort.filter(rule => rule.column !== column.id) } : {}),
  });

  useEffect(() => {
    if (open) return;
    setSubmenu(null);
    window.clearTimeout(hoverTimer.current);
  }, [open]);

  useEffect(() => () => window.clearTimeout(hoverTimer.current), []);

  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const trigger = triggerRef.current;
      if (trigger) setBox(placeMenuSelect(trigger.getBoundingClientRect(), { width: window.innerWidth, height: window.innerHeight }, MENU_MAX_VISIBLE_ROWS, {
        minWidth: MENU_MIN_WIDTH,
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
    // Capture phase, so controls that stop pointerdown propagation still let
    // an outside press close this menu.
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

  const sortOptions = <TaskSortDirectionOptions column={column.id} sort={sort} onSortChange={onSortChange} onDone={close} />;

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

  const inWorkedOnRange = column.id === "workedTime" && filterContext.workedSecondsByTask !== null;
  const columnHeading = inWorkedOnRange
    ? <>{column.label}<span className="task-column-period">in range</span></>
    : column.label;
  const menuLabel = `${filterable ? "Sort and filter" : "Sort"} ${column.label}${inWorkedOnRange ? " in range" : ""}`;
  return <>
    <button ref={triggerRef} type="button" className={`task-column-trigger${edited ? " is-active" : ""}`}
      aria-label={`${menuLabel}${filterLabel ? `, ${filterLabel}` : ""}${sorted ? `, sorted ${columnSort?.direction}` : ""}`}
      aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? menuId : undefined}
      onPointerDown={event => event.stopPropagation()} onClick={() => onOpenChange(!open)}>
      <span>{columnHeading}</span>
      <span aria-hidden="true">{sorted ? (columnSort?.direction === "ascending" ? "↑" : "↓") : chevronDownIcon}</span>
    </button>
    {open && box && createPortal(<>
      <div ref={menuRef} id={menuId} role="dialog" aria-label={menuLabel}
        className={`menu-select__menu task-column-menu${box.openUp ? " menu-select__menu--up" : ""}`}
        style={{ top: box.top, left: box.left, width: box.width, maxHeight: box.maxHeight }}
        onPointerDown={event => event.stopPropagation()}>
        <div className="task-column-menu__head">
          <span>{columnHeading}</span>
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
        {submenu === "sort" ? sortOptions : filterField &&
          <TaskFilterFields field={filterField} query={query} onQueryChange={onQueryChange} context={filterContext} onDone={close} />}
      </div>}
    </>, triggerRef.current?.closest(".dashboard") ?? document.body)}
  </>;
}
