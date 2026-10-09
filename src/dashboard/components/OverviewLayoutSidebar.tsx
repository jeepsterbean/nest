import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { MoreHorizontal, Plus } from "lucide-react";
import {
  MAX_SAVED_LAYOUTS,
  type OverviewLayoutController,
  type SavedLayout,
  type SavedLayoutProblem,
  type SavedLayoutResult,
} from "../lib/overviewGrid";
import { useDismiss } from "../hooks/useDismiss";
import { IconPickerButton, NestIcon, pickRandomIcon } from "./PulseIcon";

type Controls = Pick<
  OverviewLayoutController,
  | "savedLayouts"
  | "selection"
  | "loadSavedLayout"
  | "saveSelectedLayout"
  | "createLayout"
  | "renameLayout"
  | "setLayoutIcon"
  | "deleteLayout"
>;

type RowMenu = { id: string; confirmingDelete: boolean };
type NameDraft = { text: string; problem: SavedLayoutProblem | null };

function ProblemNote({
  problem,
  onSwitch,
}: {
  problem: SavedLayoutProblem | null;
  onSwitch: (id: string) => void;
}) {
  if (!problem || problem.kind === "blank") return null;
  let content: ReactNode;
  if (problem.kind === "duplicate") {
    content = (
      <>
        Same as <strong>{problem.match.label}</strong>
        <span aria-hidden="true"> · </span>
        <button
          type="button"
          className="overview-layouts__link"
          onClick={() => onSwitch(problem.match.id)}
        >
          Switch to it
        </button>
      </>
    );
  } else if (problem.kind === "nameTaken") {
    content = "That name is already used";
  } else {
    content = `${MAX_SAVED_LAYOUTS} layouts saved. Delete one first`;
  }
  return (
    <p className="overview-layouts__note" role="status">
      {content}
    </p>
  );
}

function NameField({
  draft,
  icon,
  label,
  onChange,
  onSubmit,
  onCancel,
  onSwitch,
}: {
  draft: NameDraft;
  icon: string;
  label: string;
  onChange: (text: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  onSwitch: (id: string) => void;
}) {
  const formRef = useRef<HTMLFormElement | null>(null);
  useDismiss(formRef, true, (reason) => {
    // An outside press keeps a typed name and must not also activate the
    // control under the pointer. Escape or an empty field closes.
    if (reason === "outside" && draft.text.trim()) {
      onSubmit();
      return true;
    }
    onCancel();
  });

  return (
    <form
      ref={formRef}
      className="overview-layouts__form"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <span className="overview-layouts__form-row">
        <span className="overview-layouts__form-tile" aria-hidden="true">
          <NestIcon name={icon} />
        </span>
        <input
          className="overview-layouts__input"
          type="text"
          value={draft.text}
          placeholder="Layout name"
          aria-label={label}
          autoFocus
          onChange={(event) => onChange(event.target.value)}
        />
      </span>
      <ProblemNote problem={draft.problem} onSwitch={onSwitch} />
    </form>
  );
}

export function OverviewLayoutSidebar({
  savedLayouts,
  selection,
  loadSavedLayout,
  saveSelectedLayout,
  createLayout,
  renameLayout,
  setLayoutIcon,
  deleteLayout,
}: Controls) {
  const [menu, setMenu] = useState<RowMenu | null>(null);
  const [renaming, setRenaming] = useState<(NameDraft & { id: string }) | null>(
    null,
  );
  const [creating, setCreating] = useState<(NameDraft & { icon: string }) | null>(
    null,
  );
  const [pendingSwitchId, setPendingSwitchId] = useState<string | null>(null);
  const [switchAfterCreate, setSwitchAfterCreate] = useState<string | null>(null);
  const [saveProblem, setSaveProblem] = useState<SavedLayoutProblem | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const confirmRef = useRef<HTMLDivElement | null>(null);

  useDismiss(menuRef, menu !== null, () => setMenu(null));
  useDismiss(confirmRef, pendingSwitchId !== null, () => setPendingSwitchId(null));

  // A save note describes one attempt; it goes stale once the board or the
  // selection moves on.
  useEffect(() => setSaveProblem(null), [selection]);

  const selected = savedLayouts.find((saved) => saved.id === selection.id);
  const isFull = savedLayouts.length >= MAX_SAVED_LAYOUTS;

  const switchTo = (id: string) => {
    setPendingSwitchId(null);
    setSwitchAfterCreate(null);
    setCreating(null);
    loadSavedLayout(id);
  };

  const beginSaveAsNew = (id: string) => {
    setMenu(null);
    setRenaming(null);
    setPendingSwitchId(null);
    setSwitchAfterCreate(id);
    setCreating({
      text: "",
      problem: null,
      icon: pickRandomIcon(selected?.icon ?? ""),
    });
  };

  const requestSwitch = (id: string) => {
    if (selection.edited) setPendingSwitchId(id);
    else switchTo(id);
  };

  const saveAndSwitch = (id: string) => {
    const result = saveSelectedLayout();
    if (result && !result.ok) {
      setPendingSwitchId(null);
      setSaveProblem(result.problem);
      return;
    }
    switchTo(id);
  };

  const handleSave = () => {
    const result = saveSelectedLayout();
    setSaveProblem(result && !result.ok ? result.problem : null);
  };

  const submitName = (
    result: SavedLayoutResult,
    onDone: () => void,
    onProblem: (problem: SavedLayoutProblem) => void,
  ) => {
    if (result.ok) onDone();
    else onProblem(result.problem);
  };

  const renderRow = (saved: SavedLayout) => {
    const isSelected = saved.id === selection.id;
    const isEdited = isSelected && selection.edited;
    const menuOpen = menu?.id === saved.id;

    if (renaming?.id === saved.id) {
      return (
        <li key={saved.id} className="overview-layouts__item">
          <NameField
            draft={renaming}
            icon={saved.icon}
            label={`Rename ${saved.label}`}
            onChange={(text) => setRenaming({ ...renaming, text, problem: null })}
            onSubmit={() =>
              submitName(
                renameLayout(saved.id, renaming.text),
                () => setRenaming(null),
                (problem) =>
                  problem.kind === "blank"
                    ? setRenaming(null)
                    : setRenaming({ ...renaming, problem }),
              )
            }
            onCancel={() => setRenaming(null)}
            onSwitch={requestSwitch}
          />
        </li>
      );
    }

    const label = (
      <>
        <span className="section-nav__label">{saved.label}</span>
        {isEdited ? (
          <span className="overview-layouts__edited" aria-hidden="true" />
        ) : null}
      </>
    );
    const accessibleName = `${saved.label}${isEdited ? ", unsaved changes" : ""}`;

    return (
      <li
        key={saved.id}
        className={`overview-layouts__item${menuOpen ? " is-menu-open" : ""}`}
      >
        <div className="overview-layouts__row">
          {isSelected ? (
            <IconPickerButton
              controlClassName="section-nav__picker"
              triggerClassName="section-nav__button section-nav__button--active"
              icon={saved.icon}
              label={saved.label}
              title={`${saved.label}${isEdited ? " · unsaved changes" : ""} · click to change icon`}
              ariaLabel={`${accessibleName}, choose icon`}
              ariaCurrent="page"
              onChange={(icon) => setLayoutIcon(saved.id, icon)}
            >
              {label}
            </IconPickerButton>
          ) : (
            <button
              type="button"
              className="section-nav__button"
              aria-label={accessibleName}
              title={saved.label}
              onClick={() => requestSwitch(saved.id)}
            >
              <NestIcon name={saved.icon} />
              {label}
            </button>
          )}
          <div
            className="overview-layouts__menu-anchor"
            ref={menuOpen ? menuRef : undefined}
          >
            <button
              type="button"
              className="overview-layouts__more"
              aria-label={`More for ${saved.label}`}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() =>
                setMenu(menuOpen ? null : { id: saved.id, confirmingDelete: false })
              }
            >
              <MoreHorizontal aria-hidden="true" />
            </button>
            {menuOpen ? (
              <div
                className="overview-layouts__menu"
                role="menu"
                aria-label={`${saved.label} options`}
              >
                {menu.confirmingDelete ? (
                  <>
                    <p className="overview-layouts__menu-text">
                      Delete <strong>{saved.label}</strong>?
                    </p>
                    <button
                      type="button"
                      role="menuitem"
                      className="menu-select__option overview-layouts__danger"
                      autoFocus
                      onClick={() => {
                        setMenu(null);
                        deleteLayout(saved.id);
                      }}
                    >
                      <span>Delete</span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="menu-select__option"
                      onClick={() => setMenu(null)}
                    >
                      <span>Cancel</span>
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      role="menuitem"
                      className="menu-select__option"
                      autoFocus
                      onClick={() => {
                        setMenu(null);
                        setRenaming({ id: saved.id, text: saved.label, problem: null });
                      }}
                    >
                      <span>Rename</span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="menu-select__option overview-layouts__danger"
                      onClick={() => setMenu({ id: saved.id, confirmingDelete: true })}
                    >
                      <span>Delete</span>
                    </button>
                  </>
                )}
              </div>
            ) : null}
          </div>
        </div>
        {isEdited ? (
          <div className="overview-layouts__changes">
            <div className="overview-layouts__change-actions">
              <button
                type="button"
                className="overview-layouts__link"
                onClick={handleSave}
              >
                Save
              </button>
              <span aria-hidden="true">·</span>
              <button
                type="button"
                className="overview-layouts__link"
                onClick={() => switchTo(saved.id)}
              >
                Revert
              </button>
            </div>
            <ProblemNote problem={saveProblem} onSwitch={switchTo} />
          </div>
        ) : null}
        {pendingSwitchId === saved.id ? (
          <div
            ref={confirmRef}
            className="overview-layouts__confirm"
            role="alertdialog"
            aria-label="Unsaved changes"
          >
            <p className="overview-layouts__menu-text">
              {selected ? (
                <>
                  <strong>{selected.label}</strong> has unsaved changes.
                </>
              ) : (
                "This arrangement isn't saved."
              )}
            </p>
            {!selected && isFull ? (
              <p className="overview-layouts__menu-text">
                {MAX_SAVED_LAYOUTS} layouts saved. Delete one first
              </p>
            ) : null}
            <div className="overview-layouts__confirm-actions">
              {selected ? (
                <button
                  type="button"
                  className="overview-layouts__confirm-primary"
                  autoFocus
                  onClick={() => saveAndSwitch(saved.id)}
                >
                  Save and switch
                </button>
              ) : !isFull ? (
                <button
                  type="button"
                  className="overview-layouts__confirm-primary"
                  autoFocus
                  onClick={() => beginSaveAsNew(saved.id)}
                >
                  Save as new
                </button>
              ) : null}
              <button
                type="button"
                className="overview-layouts__confirm-secondary"
                autoFocus={!selected && isFull}
                onClick={() => switchTo(saved.id)}
              >
                Discard
              </button>
              <button
                type="button"
                className="overview-layouts__confirm-secondary"
                onClick={() => setPendingSwitchId(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </li>
    );
  };

  return (
    <aside className="section-sidebar">
      <h2 className="section-sidebar__title" id="overview-layouts-title">
        Overview
      </h2>
      <nav className="section-nav" aria-labelledby="overview-layouts-title">
        {savedLayouts.length ? (
          <ul className="overview-layouts">{savedLayouts.map(renderRow)}</ul>
        ) : null}
        {creating ? (
          <NameField
            draft={creating}
            icon={creating.icon}
            label="New layout name"
            onChange={(text) => setCreating({ ...creating, text, problem: null })}
            onSubmit={() =>
              submitName(
                createLayout(creating.text, creating.icon),
                () => {
                  const nextId = switchAfterCreate;
                  setCreating(null);
                  setSwitchAfterCreate(null);
                  if (nextId) loadSavedLayout(nextId);
                },
                (problem) => {
                  if (problem.kind === "blank") {
                    setCreating(null);
                    setSwitchAfterCreate(null);
                    return;
                  }
                  setCreating({ ...creating, problem });
                },
              )
            }
            onCancel={() => {
              setCreating(null);
              setSwitchAfterCreate(null);
            }}
            onSwitch={switchTo}
          />
        ) : (
          <button
            type="button"
            className="overview-layouts__add"
            aria-label="New layout from the current board"
            title={
              isFull
                ? `${MAX_SAVED_LAYOUTS} layouts saved. Delete one to add another`
                : "Save the current board as a new layout"
            }
            disabled={isFull}
            onClick={() => {
              setSwitchAfterCreate(null);
              setCreating({
                text: "",
                problem: null,
                icon: pickRandomIcon(selected?.icon ?? ""),
              });
            }}
          >
            <Plus aria-hidden="true" />
            <span className="section-nav__label">New layout</span>
          </button>
        )}
      </nav>
    </aside>
  );
}
