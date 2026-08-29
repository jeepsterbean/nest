import { formatTime } from "../lib/time";

/** Prev/next controls for browsing recent saved brain dumps. */
export function BrainDumpHistoryControls({
  canViewPrevious,
  canViewNext,
  onPrevious,
  onNext,
  submittedAt = null,
}: {
  canViewPrevious: boolean;
  canViewNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  /** Unix seconds; shown when viewing a saved dump. */
  submittedAt?: number | null;
}) {
  return (
    <div className="brain-dump-history-controls">
      {submittedAt != null && (
        <time
          className="brain-dump-history-controls__submitted"
          dateTime={new Date(submittedAt * 1000).toISOString()}
        >
          {formatTime(submittedAt)}
        </time>
      )}
      <button
        type="button"
        tabIndex={-1}
        aria-label="View previous brain dump"
        title="Previous brain dump (Cmd/Ctrl+[)"
        disabled={!canViewPrevious}
        onClick={onPrevious}
      >
        <span aria-hidden="true">&#8249;</span>
      </button>
      <button
        type="button"
        tabIndex={-1}
        aria-label="View next brain dump"
        title="Next brain dump (Cmd/Ctrl+])"
        disabled={!canViewNext}
        onClick={onNext}
      >
        <span aria-hidden="true">&#8250;</span>
      </button>
    </div>
  );
}
