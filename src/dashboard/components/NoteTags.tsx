import { useEffect, useMemo, useRef, useState } from "react";
import type { NoteTag, Tag } from "../../lib/types";

const RECENT_TAG_LIMIT = 5;
const PRUNE_GRACE_MS = 1500;

const selectedTags = (tags: Tag[], selectedIds: number[]) =>
  selectedIds.flatMap((id) => {
    const tag = tags.find((candidate) => candidate.id === id);
    return tag ? [tag] : [];
  });

export function composerTags(tags: Tag[], selectedIds: number[]) {
  const selected = selectedTags(tags, selectedIds);
  const selectedSet = new Set(selectedIds);
  const recent = tags
    .filter((tag) => tag.lastUsedAt !== null && !selectedSet.has(tag.id))
    .slice(0, RECENT_TAG_LIMIT);
  return [...selected, ...recent];
}

// Shared by the composers: while browsing a saved note, show its own tags
// read-only instead of the live tag list/draft selection.
export function useComposerTagProps(
  tags: Tag[],
  selectedIds: number[],
  viewingNote: { tags: NoteTag[] } | null | undefined,
) {
  return useMemo(() => {
    if (!viewingNote) return { tags, selectedIds };
    return {
      tags: viewingNote.tags.map((tag) => ({
        ...tag,
        createdAt: 0,
        lastUsedAt: null,
      })),
      selectedIds: viewingNote.tags.map((tag) => tag.id),
    };
  }, [tags, selectedIds, viewingNote]);
}

export function NoteTags({
  tags,
  selectedIds,
  disabled = false,
  autoOpen = false,
  dismissVersion = 0,
  selectedOnly = false,
  onChange,
}: {
  tags: Tag[];
  selectedIds: number[];
  disabled?: boolean;
  autoOpen?: boolean;
  dismissVersion?: number;
  /** Show only the selected Tags, as static chips; the menu edits them. */
  selectedOnly?: boolean;
  onChange: (ids: number[]) => void;
}) {
  const [open, setOpen] = useState(autoOpen);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const visibleTags = useMemo(
    () => selectedOnly ? selectedTags(tags, selectedIds) : composerTags(tags, selectedIds),
    [selectedOnly, selectedIds, tags],
  );
  const filteredTags = tags.filter((tag) =>
    tag.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );

  // Other windows load their tag list independently and asynchronously, so a
  // tag id can legitimately be "not in `tags` yet" without being deleted
  // (e.g. just created in another window, with this window's own reload
  // still in flight). ponytail: wait out that race with a grace period
  // instead of resolving it deterministically; a delete immediately
  // followed by re-selecting the same id elsewhere stays selected until the
  // grace period elapses. Raise PRUNE_GRACE_MS if reloads start lagging it.
  useEffect(() => {
    // A selected-only strip shows a saved note, where pruning would write to
    // the record; the backend already drops deleted Tags from saved notes.
    if (disabled || selectedOnly) return;
    const availableIds = new Set(tags.map((tag) => tag.id));
    const validIds = selectedIds.filter((id) => availableIds.has(id));
    if (validIds.length === selectedIds.length) return;
    const timeout = setTimeout(() => onChange(validIds), PRUNE_GRACE_MS);
    return () => clearTimeout(timeout);
  }, [disabled, onChange, selectedOnly, selectedIds, tags]);

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    const dismissIfOutside = (target: EventTarget | null) => {
      if (rootRef.current?.contains(target as Node)) return;
      setOpen(false);
      setQuery("");
    };
    const dismiss = (event: PointerEvent) => {
      dismissIfOutside(event.target);
    };
    const dismissOnFocus = (event: FocusEvent) => {
      dismissIfOutside(event.target);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("pointerdown", dismiss, true);
    document.addEventListener("focusin", dismissOnFocus, true);
    window.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss, true);
      document.removeEventListener("focusin", dismissOnFocus, true);
      window.removeEventListener("keydown", escape);
    };
  }, [open]);

  useEffect(() => {
    if (dismissVersion === 0) return;
    setOpen(false);
    setQuery("");
  }, [dismissVersion]);

  const toggle = (id: number) => {
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((selectedId) => selectedId !== id)
        : [...selectedIds, id],
    );
  };

  return (
    <div ref={rootRef} className="note-tags">
      <div className="note-tags__scroll" aria-label="Note tags">
        {visibleTags.map((tag) => {
          if (selectedOnly) {
            return (
              <span key={tag.id} className="note-tag" title={tag.name}>
                {tag.name}
              </span>
            );
          }
          const selected = selectedIds.includes(tag.id);
          return (
            <button
              key={tag.id}
              type="button"
              className={`note-tag${selected ? " is-selected" : ""}`}
              aria-pressed={selected}
              disabled={disabled}
              title={tag.name}
              onClick={() => toggle(tag.id)}
            >
              {tag.name}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        className="note-tags__more"
        aria-label="Choose from all tags"
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        …
      </button>
      {open && (
        <div className="note-tags__menu" role="dialog" aria-label="All tags">
          <input
            ref={searchRef}
            type="search"
            value={query}
            placeholder="Find a tag"
            aria-label="Find a tag"
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="note-tags__options">
            {filteredTags.map((tag) => {
              const selected = selectedIds.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  aria-pressed={selected}
                  className={selected ? "is-selected" : undefined}
                  onClick={() => {
                    toggle(tag.id);
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  <span>{tag.name}</span>
                  {selected && <span aria-hidden="true">✓</span>}
                </button>
              );
            })}
            {filteredTags.length === 0 && (
              <p>{tags.length ? "No matching tags" : "No tags yet"}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
