/** Prev/next controls for browsing recent saved brain dumps. */
export function BrainDumpHistoryControls({
  canViewPrevious,
  canViewNext,
  onPrevious,
  onNext,
}: {
  canViewPrevious: boolean;
  canViewNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <div className="brain-dump-history-controls">
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
