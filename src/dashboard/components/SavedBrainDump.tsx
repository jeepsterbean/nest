import { useEffect, useRef, type CSSProperties } from "react";
import { brainDumpStorageToDisplayHtml } from "../../lib/brainDumpRichText";
import type { BrainDump } from "../../lib/types";
import { formatDate, formatTime } from "../lib/time";
import "./SavedBrainDump.css";

export function SavedBrainDump({ dump }: { dump: BrainDump }) {
  // History is a static snapshot: unfold lists so all text is readable without controls.
  const html = brainDumpStorageToDisplayHtml(dump.text)
    .replace(/<(\/?)details\b[^>]*>/gi, "<$1div>")
    .replace(/<(\/?)summary\b[^>]*>/gi, "<$1p>");

  return (
    <article className="saved-brain-dump" aria-label="Saved brain dump">
      <time dateTime={new Date(dump.createdAt * 1000).toISOString()}>
        {formatDate(dump.createdAt)} · {formatTime(dump.createdAt)}
      </time>
      <div className="event-dump__text" dangerouslySetInnerHTML={{ __html: html }} />
      {dump.tags.length > 0 && (
        <div className="event-dump__tags" aria-label="Brain dump tags">
          {dump.tags.map((tag) => <span key={tag.id}>{tag.name}</span>)}
        </div>
      )}
    </article>
  );
}

export type SavedBrainDumpPosition = { x: number; y: number };

export function SavedBrainDumpPopover({ dump, open, position, onClose }: {
  dump: BrainDump;
  open: boolean;
  position: SavedBrainDumpPosition | null;
  onClose: () => void;
}) {
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideInteraction = (event: PointerEvent) => {
      if (!popoverRef.current?.contains(event.target as Node)) onClose();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", closeOnOutsideInteraction, true);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideInteraction, true);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose, open]);

  if (!open || !position) return null;
  return (
    <div
      ref={popoverRef}
      className="saved-brain-dump-popover"
      role="dialog"
      aria-label="Saved brain dump, read only"
      tabIndex={-1}
      style={{ left: position.x + 12, top: position.y } as CSSProperties}
    >
      <SavedBrainDump dump={dump} />
    </div>
  );
}
