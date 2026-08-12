import { useState } from "react";
import { setTaskWorking } from "../../lib/commands";
import type { Task } from "../../lib/types";
import { useDashboardData } from "../context/DashboardDataContext";

export function WorkingBadge({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className={`working-badge${compact ? " working-badge--compact" : ""}`}
      aria-label={compact ? "Working now" : undefined}
      title="Working now"
    >
      <span className="working-beacon" aria-hidden="true" />
      {!compact && <span>Working now</span>}
    </span>
  );
}

export function WorkingToggle({
  task,
  onToggle,
  compact = false,
  disabled = false,
}: {
  task: Task;
  onToggle: (working: boolean) => Promise<unknown> | void;
  compact?: boolean;
  disabled?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const label = task.workingNow ? "Stop working" : "Start working";

  return (
    <button
      type="button"
      className={`working-toggle${
        compact ? " working-toggle--compact" : ""
      }`}
      aria-label={`${label} on ${task.title}`}
      aria-pressed={task.workingNow}
      title={`${label} on this task`}
      disabled={disabled || pending}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={async (event) => {
        event.stopPropagation();
        if (pending) return;
        setPending(true);
        try {
          await onToggle(!task.workingNow);
        } finally {
          setPending(false);
        }
      }}
    >
      <span className="working-beacon" aria-hidden="true" />
      {!compact && <span>{task.workingNow ? "Working now" : "Start"}</span>}
    </button>
  );
}

export function TaskWorkingControl({
  task,
  compact = false,
}: {
  task: Task;
  compact?: boolean;
}) {
  const { mutate } = useDashboardData();
  return (
    <WorkingToggle
      task={task}
      compact={compact}
      onToggle={(working) => mutate(() => setTaskWorking(task.id, working))}
    />
  );
}
