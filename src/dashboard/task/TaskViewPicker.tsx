import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { checkIcon, chevronDownIcon, editIcon, refreshIcon, saveIcon, trashIcon } from "../components/icons";
import type { TaskTableViews } from "../hooks/useTaskTableViews";
import { placeMenuSelect, type MenuSelectBox } from "../lib/placeMenuSelect";
import {
  MAX_SAVED_TASK_VIEWS,
  RAW_TASK_VIEW_ID,
  SAVED_TASK_VIEW_NAME_MAX,
  type SavedTaskView,
  type SavedTaskViewProblem,
  type SavedTaskViewResult,
} from "../lib/taskTableViews";

const MENU_MIN_WIDTH = 236;
// Views, the add row, and room for a problem note.
const MENU_MAX_VISIBLE_ROWS = MAX_SAVED_TASK_VIEWS + 3;

type RowEdit =
  | { kind: "rename"; id: string; text: string; problem: SavedTaskViewProblem | null }
  | { kind: "delete"; id: string }
  | { kind: "create"; text: string; problem: SavedTaskViewProblem | null };

function ProblemNote({ problem, onSwitch }: {
  problem: SavedTaskViewProblem | null;
  onSwitch: (view: SavedTaskView) => void;
}) {
  if (!problem || problem.kind === "blank") return null;
  let content: ReactNode;
  if (problem.kind === "duplicate") {
    content = <>
      Same as <strong>{problem.match.name}</strong>
      <span aria-hidden="true"> · </span>
      <button type="button" className="task-views__link" onClick={() => onSwitch(problem.match)}>Switch to it</button>
    </>;
  } else if (problem.kind === "nameTaken") {
    content = "That name is already used";
  } else {
    content = `${MAX_SAVED_TASK_VIEWS} views saved. Delete one first`;
  }
  return <p className="task-views__note" role="status">{content}</p>;
}

function NameField({ text, label, onChange, onSubmit, onCancel }: {
  text: string;
  label: string;
  onChange: (text: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };
  return <form className="task-views__field" onSubmit={submit}>
    <input autoFocus type="text" value={text} aria-label={label} placeholder="View name" maxLength={SAVED_TASK_VIEW_NAME_MAX}
      onChange={event => onChange(event.target.value)}
      onKeyDown={event => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        onCancel();
      }}/>
    <button type="submit" className="task-views__link" disabled={!text.trim()}>Save</button>
  </form>;
}

/** Saved-view picker for the Tasks table query. */
export function TaskViewPicker({ views }: { views: TaskTableViews }) {
  const [saveProblem, setSaveProblem] = useState<SavedTaskViewProblem | null>(null);
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<MenuSelectBox | null>(null);
  const [rowEdit, setRowEdit] = useState<RowEdit | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const { selected, edited } = views;
  useEffect(() => setSaveProblem(null), [selected.id, edited]);

  const atCap = views.views.length >= MAX_SAVED_TASK_VIEWS;
  const canSaveAs = edited && !atCap;

  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) setRowEdit(null);
  }, [open]);

  // Revert (or matching the saved query again) means there is nothing new to
  // name, so drop a half-finished create field rather than let it submit a duplicate.
  useEffect(() => {
    if (!edited) setRowEdit((current) => (current?.kind === "create" ? null : current));
  }, [edited]);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const trigger = triggerRef.current;
      if (trigger) setBox(placeMenuSelect(trigger.getBoundingClientRect(), { width: window.innerWidth, height: window.innerHeight }, MENU_MAX_VISIBLE_ROWS, {
        minWidth: MENU_MIN_WIDTH,
        maxVisible: MENU_MAX_VISIBLE_ROWS,
      }));
    };
    place();
    window.addEventListener("resize", place);
    const onScroll = (event: Event) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", place);
      document.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      close(true);
    };
    document.addEventListener("pointerdown", onPointer, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (open && box) menuRef.current?.querySelector<HTMLElement>(".task-views__option[aria-pressed='true']")?.focus();
  }, [open, Boolean(box)]);

  const switchTo = (view: SavedTaskView) => {
    views.select(view);
    close(true);
  };

  const keepOpenOnFailure = (result: SavedTaskViewResult, onFail: (problem: SavedTaskViewProblem) => void) => {
    if (result.ok) setRowEdit(null);
    else onFail(result.problem);
  };

  const viewRow = (view: SavedTaskView) => {
    const isSelected = view.id === selected.id;
    if (rowEdit?.kind === "rename" && rowEdit.id === view.id) {
      return <li key={view.id}>
        <NameField text={rowEdit.text} label={`Rename ${view.name}`}
          onChange={text => setRowEdit({ ...rowEdit, text, problem: null })}
          onSubmit={() => keepOpenOnFailure(views.rename(view.id, rowEdit.text), problem => setRowEdit({ ...rowEdit, problem }))}
          onCancel={() => setRowEdit(null)}/>
        <ProblemNote problem={rowEdit.problem} onSwitch={switchTo}/>
      </li>;
    }
    if (rowEdit?.kind === "delete" && rowEdit.id === view.id) {
      return <li key={view.id} className="task-views__confirm" role="group" aria-label={`Delete ${view.name}?`}>
        <span>Delete <strong>{view.name}</strong>?</span>
        <button type="button" className="task-views__link task-views__link--danger" autoFocus
          onClick={() => { views.remove(view.id); setRowEdit(null); }}>Delete</button>
        <span aria-hidden="true">·</span>
        <button type="button" className="task-views__link" onClick={() => setRowEdit(null)}>Keep</button>
      </li>;
    }
    return <li key={view.id} className="task-views__row">
      <button type="button" className="menu-select__option task-views__option" aria-pressed={isSelected}
        onClick={() => switchTo(view)}>
        <span>{view.name}</span>
        {isSelected && <span className="menu-select__check" aria-hidden="true">{checkIcon}</span>}
      </button>
      {view.id !== RAW_TASK_VIEW_ID && <span className="task-views__actions">
        <button type="button" aria-label={`Rename ${view.name}`} title="Rename"
          onClick={() => setRowEdit({ kind: "rename", id: view.id, text: view.name, problem: null })}>{editIcon}</button>
        <button type="button" aria-label={`Delete ${view.name}`} title="Delete"
          onClick={() => setRowEdit({ kind: "delete", id: view.id })}>{trashIcon}</button>
      </span>}
    </li>;
  };

  return <>
    <div className="task-views__control">
    <button ref={triggerRef} type="button" className={`task-views__trigger${edited ? " is-edited" : ""}`}
      title={selected.name}
      aria-label={`Task view: ${selected.name}${edited ? ", unsaved changes" : ""}`}
      aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? menuId : undefined}
      onClick={() => setOpen(!open)}>
      <span className="task-views__name">{selected.name}</span>
      {!edited && <span className="task-views__chevron" aria-hidden="true">{chevronDownIcon}</span>}
    </button>
    {edited && <span className="task-views__changes">
      <button type="button" aria-label="Save view" title={selected.id === RAW_TASK_VIEW_ID ? "Raw view is protected. Save current as view from the menu." : "Save view"}
        disabled={selected.id === RAW_TASK_VIEW_ID}
        onClick={() => { const result = views.save(); setSaveProblem(result.ok ? null : result.problem); }}>{saveIcon}</button>
      <button type="button" aria-label="Revert view" title="Revert view" onClick={views.revert}>{refreshIcon}</button>
    </span>}
    {saveProblem && <div className="task-views__save-problem"><ProblemNote problem={saveProblem} onSwitch={switchTo}/></div>}
    </div>
    {open && box && createPortal(
      <div ref={menuRef} id={menuId} role="dialog" aria-label="Task views"
        className={`menu-select__menu task-column-menu task-views__menu${box.openUp ? " menu-select__menu--up" : ""}`}
        style={{ top: box.top, left: box.left, width: box.width, maxHeight: box.maxHeight }}>
        <div className="task-column-menu__section">
          <div className="task-column-menu__label">Views</div>
          <ul className="task-views__list">{views.views.map(viewRow)}</ul>
        </div>
        <div className="task-column-menu__section">
          {rowEdit?.kind === "create" ? <div className="task-views__create">
            <NameField text={rowEdit.text} label="New view name"
              onChange={text => setRowEdit({ ...rowEdit, text, problem: null })}
              onSubmit={() => keepOpenOnFailure(views.create(rowEdit.text), problem => setRowEdit({ ...rowEdit, problem }))}
              onCancel={() => setRowEdit(null)}/>
            <ProblemNote problem={rowEdit.problem} onSwitch={switchTo}/>
          </div> : <button type="button" className="menu-select__option task-column-menu__row--action"
            disabled={!canSaveAs}
            title={!edited ? "No changes from this view" : atCap ? `${MAX_SAVED_TASK_VIEWS} views saved. Delete one first` : undefined}
            onClick={() => setRowEdit({ kind: "create", text: "", problem: null })}>
            <span>Save current as view</span>
          </button>}
        </div>
      </div>,
      triggerRef.current?.closest(".dashboard") ?? document.body,
    )}
  </>;
}
