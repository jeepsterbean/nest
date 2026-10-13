import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { DateNavigation } from "./DateNavigation";
import { createTag, deleteTag, renameTag } from "../../lib/commands";
import type { BrainDump, Tag } from "../../lib/types";
import { useDashboardData } from "../context/DashboardDataContext";
import type { DayPickerProps } from "../lib/dayPicker";
import { useMediaQuery } from "../hooks/useMediaQuery";

export function BrainDumpFilters({ dayLabel, onPreviousDay, onNextDay, canGoNext, onToday, dayPicker, tagId, onTagChange, brainDumps, loaded, sectionSidebar, visible }: {
  brainDumps: BrainDump[];
  loaded: boolean;
  sectionSidebar: HTMLElement | null;
  visible: boolean;
  dayLabel: string;
  onPreviousDay: () => void;
  onNextDay: () => void;
  canGoNext: boolean;
  onToday: () => void;
  dayPicker: DayPickerProps;
  tagId: string;
  onTagChange: (id: string) => void;
}) {
  const collapsedSidebar = useMediaQuery("(max-width: 600px)");
  const tagCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const dump of brainDumps) {
      for (const tag of dump.tags) counts.set(tag.id, (counts.get(tag.id) ?? 0) + 1);
    }
    return counts;
  }, [brainDumps]);
  const { tags, mutate } = useDashboardData();
  const [menu, setMenu] = useState<{ tag: Tag; x: number; y: number } | null>(null);
  const [editor, setEditor] = useState<{ tag: Tag | null; name: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLButtonElement | null>(null);
  const close = () => {
    setMenu(null);
    setEditor(null);
    returnFocusRef.current?.focus();
  };

  // Keyed on open/closed, not the editor value, so typing a name does not
  // re-run focus and listener setup on every keystroke.
  const editorOpen = editor !== null;
  useEffect(() => {
    if (!menu && !editorOpen) return;
    popupRef.current?.querySelector<HTMLElement>("input, button")?.focus();
    const dismiss = (event: PointerEvent) => {
      if (!popupRef.current?.contains(event.target as Node)) {
        setMenu(null);
        setEditor(null);
      }
    };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
      if (menu && popupRef.current?.contains(document.activeElement)
        && ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const buttons = Array.from(popupRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1
          : (current + (event.key === "ArrowUp" ? -1 : 1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }
    };
    document.addEventListener("pointerdown", dismiss, true);
    window.addEventListener("keydown", keyboard);
    return () => {
      document.removeEventListener("pointerdown", dismiss, true);
      window.removeEventListener("keydown", keyboard);
    };
  }, [menu, editorOpen]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!editor?.name.trim() || saving) return;
    setSaving(true);
    const name = editor.name.trim();
    const success = await mutate(() => editor.tag ? renameTag(editor.tag.id, name) : createTag(name));
    setSaving(false);
    if (success) close();
  };

  const remove = async (tag: Tag) => {
    if (!window.confirm(`Delete “${tag.name}”? It will be removed from every brain dump.`)) return;
    if (await mutate(() => deleteTag(tag.id))) {
      close();
    }
  };

  const activeTagId = tags.some((tag) => String(tag.id) === tagId) ? tagId : "";
  useEffect(() => {
    if (tagId && !activeTagId) onTagChange("");
  }, [tagId, activeTagId, onTagChange]);

  const tagFilters = (
      <div className="brain-dump-filter-tags" hidden={!visible}>
        <div className="brain-dump-filter-tags__scroll" aria-label="Filter brain dumps by tag">
          <button type="button" className="brain-dump-filter-tags__row" aria-pressed={!activeTagId} onClick={() => onTagChange("")}>
            <span className="brain-dump-filter-tags__name">All tags</span>
            <span className="brain-dump-filter-tags__count">{loaded ? brainDumps.length : "…"}</span>
          </button>
          {tags.map((tag) => (
            <button key={tag.id} type="button" className="brain-dump-filter-tags__row"
              aria-pressed={activeTagId === String(tag.id)} aria-haspopup="menu"
              title={`${tag.name} — right-click to rename or delete`}
              onClick={() => onTagChange(String(tag.id))}
              onContextMenu={(event) => {
                event.preventDefault();
                returnFocusRef.current = event.currentTarget;
                setEditor(null);
                setMenu({ tag, x: event.clientX, y: event.clientY });
              }}
              onKeyDown={(event) => {
                if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
                event.preventDefault();
                const rect = event.currentTarget.getBoundingClientRect();
                returnFocusRef.current = event.currentTarget;
                setEditor(null);
                setMenu({ tag, x: rect.left, y: rect.bottom });
              }}
            >
              <span className="brain-dump-filter-tags__name">{tag.name}</span>
              <span className="brain-dump-filter-tags__count">{loaded ? tagCounts.get(tag.id) ?? 0 : "…"}</span>
            </button>
          ))}
        </div>
        <button type="button" className="brain-dump-filter-tags__row brain-dump-filter-tags__add" aria-haspopup="dialog"
          onClick={(event) => {
            returnFocusRef.current = event.currentTarget;
            setMenu(null);
            setEditor({ tag: null, name: "" });
          }}>+ Add tag</button>
      </div>
  );

  return (
    <div ref={rootRef} className="brain-dump-history__filters">
      <DateNavigation label={dayLabel} unit="day" canGoNext={canGoNext}
        onPrevious={onPreviousDay} onNext={onNextDay} onToday={onToday} picker={dayPicker} />
      {collapsedSidebar || !sectionSidebar ? tagFilters : createPortal(tagFilters, sectionSidebar)}
      {visible && (menu || editor) && createPortal(
        <div ref={popupRef} className="brain-dump-filter-popup"
          role={editor ? "dialog" : "menu"}
          aria-label={editor ? (editor.tag ? "Rename tag" : "Add tag") : `Manage ${menu?.tag.name}`}
          style={{ left: Math.max(8, Math.min(menu?.x ?? window.innerWidth / 2 - 140, window.innerWidth - 288)),
            top: Math.max(8, Math.min(menu?.y ?? 120, window.innerHeight - 160)) }}>
          {editor ? (
            <form onSubmit={(event) => void save(event)}>
              <input aria-label="Tag name" placeholder="Tag name" value={editor.name} disabled={saving}
                onChange={(event) => setEditor({ ...editor, name: event.target.value })} />
              <div>
                <button type="button" onClick={close}>Cancel</button>
                <button type="submit" className="btn-accent" disabled={saving || !editor.name.trim()}>{editor.tag ? "Save" : "Add tag"}</button>
              </div>
            </form>
          ) : menu && <>
            <button type="button" role="menuitem" onClick={() => {
              setEditor({ tag: menu.tag, name: menu.tag.name });
              setMenu(null);
            }}>Rename</button>
            <button type="button" role="menuitem" onClick={() => void remove(menu.tag)}>Delete</button>
          </>}
        </div>, rootRef.current?.closest(".dashboard") ?? document.body,
      )}
    </div>
  );
}
