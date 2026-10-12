import { Eye } from "lucide-react";

/** Phases-only: swap settled rows for every checkpoint in the window. */
export function LogsRawToggle({
  active,
  onClick,
}: {
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`logs-raw-toggle${active ? " logs-raw-toggle--active" : ""}`}
      aria-pressed={active}
      aria-label="Every Phase checkpoint"
      title="Every Phase checkpoint"
      onClick={onClick}
    >
      <Eye aria-hidden="true" />
    </button>
  );
}
