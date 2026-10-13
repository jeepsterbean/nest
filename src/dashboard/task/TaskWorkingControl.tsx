import { useEffect, useState } from "react";
import type { Task } from "../../lib/types";
import {
  formatClockedTime,
  formatWorkedTime,
  taskWorkStretchSeconds,
} from "../lib/time";

function PlayIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="m7 5 7.5 5L7 15Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

function useWorkSessionSeconds(
  task: Task,
  nowMs?: number,
  tickWhileWorking = true,
) {
  // Tick locally unless a parent already supplies a shared clock.
  const [localNowMs, setLocalNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (
      !tickWhileWorking ||
      nowMs !== undefined ||
      !task.workingNow ||
      task.workStartedAt === null
    ) {
      return;
    }
    setLocalNowMs(Date.now());
    const interval = window.setInterval(() => setLocalNowMs(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, [nowMs, task.workingNow, task.workStartedAt, tickWhileWorking]);

  if (
    !tickWhileWorking ||
    !task.workingNow ||
    task.workStartedAt === null
  ) {
    return null;
  }
  return taskWorkStretchSeconds(task.workStartedAt, nowMs ?? localNowMs);
}

export function WorkingBadge() {
  return (
    <span
      className="working-badge working-badge--compact"
      aria-label="Working now"
      title="Working now"
    >
      <span className="working-beacon" aria-hidden="true" />
    </span>
  );
}

export function WorkingToggle({
  task,
  onToggle,
  compact = false,
  playPause = false,
  disabled = false,
  tabIndex,
  nowMs,
}: {
  task: Task;
  onToggle: (working: boolean) => Promise<unknown> | void;
  compact?: boolean;
  playPause?: boolean;
  disabled?: boolean;
  tabIndex?: number;
  nowMs?: number;
}) {
  const [pending, setPending] = useState(false);
  const sessionSeconds = useWorkSessionSeconds(task, nowMs, playPause);
  const seconds = task.workingNow
    ? task.workedSeconds + (sessionSeconds ?? 0)
    : null;
  const timeLabel =
    playPause && seconds !== null ? formatClockedTime(seconds) : null;
  const label = task.workingNow ? "Stop working" : "Start working";

  return (
    <button
      type="button"
      className={`working-toggle${
        compact ? " working-toggle--compact" : ""
      }${playPause ? " working-toggle--play-pause" : ""}${
        task.workingNow && !playPause ? " working-toggle--working-dot" : ""
      }`}
      aria-label={`${label} on ${task.title}`}
      aria-pressed={task.workingNow}
      title={`${label} on this task`}
      tabIndex={tabIndex}
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
      {playPause ? (
        timeLabel === null ? (
          <PlayIcon />
        ) : (
          <span aria-hidden="true">{timeLabel}</span>
        )
      ) : (
        <>
          <span className="working-beacon" aria-hidden="true" />
          {!compact && !task.workingNow && <span>Start</span>}
        </>
      )}
    </button>
  );
}

/** Worked time: every finished stretch banked by SQL, plus the open one while
 * it runs. Stands on its own — the total outlives Working now and Active, so
 * it is not a child of the working control. `rangeSeconds` replaces the
 * all-time total with time already clipped to a Worked on range. */
export function WorkedTime({
  task,
  nowMs,
  rangeSeconds,
}: {
  task: Task;
  nowMs?: number;
  rangeSeconds?: number;
}) {
  const allTimeSeconds = task.workedSeconds + (useWorkSessionSeconds(task, nowMs) ?? 0);
  const seconds = rangeSeconds ?? allTimeSeconds;
  const period = rangeSeconds === undefined ? "Worked time, all time" : "Worked time in range";

  return (
    <time
      className="worked-time"
      dateTime={`PT${seconds}S`}
      title={period}
      aria-label={`${formatWorkedTime(seconds)} ${period}`}
    >
      {formatWorkedTime(seconds)}
    </time>
  );
}
