import { useEffect, useState } from "react";
import { setTaskWorking } from "../../lib/commands";
import type { Task } from "../../lib/types";
import { useDashboardData } from "../context/DashboardDataContext";
import { formatWorkedTime, taskWorkSessionSeconds } from "../lib/time";

function PlayPauseIcon({ pause }: { pause: boolean }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      {pause ? (
        <>
          <path d="M6.5 5.5v9" />
          <path d="M13.5 5.5v9" />
        </>
      ) : (
        <path d="m7 5 7.5 5L7 15Z" fill="currentColor" stroke="none" />
      )}
    </svg>
  );
}

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
  playPause = false,
  disabled = false,
}: {
  task: Task;
  onToggle: (working: boolean) => Promise<unknown> | void;
  compact?: boolean;
  playPause?: boolean;
  disabled?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const label = task.workingNow ? "Stop working" : "Start working";

  return (
    <button
      type="button"
      className={`working-toggle${
        compact ? " working-toggle--compact" : ""
      }${playPause ? " working-toggle--play-pause" : ""}`}
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
      {playPause ? (
        <PlayPauseIcon pause={task.workingNow} />
      ) : (
        <>
          <span className="working-beacon" aria-hidden="true" />
          {!compact && <span>{task.workingNow ? "Working now" : "Start"}</span>}
        </>
      )}
    </button>
  );
}

export function WorkedTime({
  task,
  nowMs,
}: {
  task: Task;
  nowMs?: number;
}) {
  const [localNowMs, setLocalNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (
      nowMs !== undefined ||
      !task.workingNow ||
      task.workStartedAt === null
    ) {
      return;
    }
    setLocalNowMs(Date.now());
    const interval = window.setInterval(() => setLocalNowMs(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, [nowMs, task.workingNow, task.workStartedAt]);

  if (!task.workingNow || task.workStartedAt === null) return null;
  const seconds = taskWorkSessionSeconds(task.workStartedAt, nowMs ?? localNowMs);

  return (
    <time
      className="worked-time"
      dateTime={`PT${seconds}S`}
      title="Current work session"
      aria-label={`${formatWorkedTime(seconds)} current work session`}
    >
      {formatWorkedTime(seconds)}
    </time>
  );
}

export function TaskWorkingControl({
  task,
  compact = false,
  playPause = false,
  showTime = true,
}: {
  task: Task;
  compact?: boolean;
  playPause?: boolean;
  showTime?: boolean;
}) {
  const { mutate } = useDashboardData();
  return (
    <span className="working-control">
      <WorkingToggle
        task={task}
        compact={compact}
        playPause={playPause}
        onToggle={(working) => mutate(() => setTaskWorking(task.id, working))}
      />
      {showTime && <WorkedTime task={task} />}
    </span>
  );
}
