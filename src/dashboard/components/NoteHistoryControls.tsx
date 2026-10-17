import { formatTime } from "../lib/time";
import { floatingDraftIcon } from "./icons";

/** Prev/next controls for browsing recent saved notes. */
export function NoteHistoryControls({
  canViewPrevious,
  canViewNext,
  onPrevious,
  onNext,
  onPeel,
  submittedAt = null,
}: {
  canViewPrevious: boolean;
  canViewNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onPeel?: () => void;
  /** Unix seconds; shown when viewing a saved note. */
  submittedAt?: number | null;
}) {
  return (
    <div className="note-history-controls">
      {submittedAt != null && (
        <time
          className="note-history-controls__submitted"
          dateTime={new Date(submittedAt * 1000).toISOString()}
        >
          {formatTime(submittedAt)}
        </time>
      )}
      {onPeel && (
        <button
          type="button"
          tabIndex={-1}
          aria-label="Make saved note a floating draft"
          title="Make floating draft"
          disabled={submittedAt == null}
          onClick={onPeel}
        >
          {floatingDraftIcon}
        </button>
      )}
      <button
        type="button"
        tabIndex={-1}
        aria-label="View previous note"
        title="Previous note (Cmd/Ctrl+[)"
        disabled={!canViewPrevious}
        onClick={onPrevious}
      >
        <span aria-hidden="true">&#8249;</span>
      </button>
      <button
        type="button"
        tabIndex={-1}
        aria-label="View next note"
        title="Next note (Cmd/Ctrl+])"
        disabled={!canViewNext}
        onClick={onNext}
      >
        <span aria-hidden="true">&#8250;</span>
      </button>
    </div>
  );
}
