import { useEffect, useState } from "react";
import { setTaskWorking } from "../../lib/commands";
import type { Task } from "../../lib/types";
import { useDashboardData } from "../context/DashboardDataContext";
import {
  formatClockedTime,
  formatWorkedTime,
  taskWorkSessionSeconds,
} from "../lib/time";

function PlayIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="m7 5 7.5 5L7 15Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

function useWorkSessionSeconds(task: Task, nowMs?: number) {
  // Tick locally unless a parent already supplies a shared clock.
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
  return taskWorkSessionSeconds(task.workStartedAt, nowMs ?? localNowMs);
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
  const sessionSeconds = useWorkSessionSeconds(task, nowMs);
  const seconds = task.workingNow
    ? task.workedSeconds + (sessionSeconds ?? 0)
    : null;
  const timeLabel =
    playPause && seconds !== null ? formatClockedTime(seconds) : null;
  const label = task.workingNow ? "Stop working" : "Start working";
  const sessionHint =
    seconds === null
      ? ""
      : seconds < 60
        ? `, ${seconds}s`
        : `, ${Math.floor(seconds / 60)}m`;

  return (
    <button
      type="button"
      className={`working-toggle${
        compact ? " working-toggle--compact" : ""
      }${playPause ? " working-toggle--play-pause" : ""}`}
      aria-label={`${label} on ${task.title}${sessionHint}`}
      aria-pressed={task.workingNow}
      title={`${label} on this task${sessionHint}`}
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
          {!compact && <span>{task.workingNow ? "Working now" : "Start"}</span>}
        </>
      )}
    </button>
  );
}

/** Worked time while Working now — every stretch, not only today or the open
 * one. Hidden when idle. */
export function CurrentStretch({
  task,
  nowMs,
}: {
  task: Task;
  nowMs?: number;
}) {
  const session = useWorkSessionSeconds(task, nowMs);
  if (session === null) return null;
  const seconds = task.workedSeconds + session;

  return (
    <time
      className="worked-time"
      dateTime={`PT${seconds}S`}
      title="Worked time"
      aria-label={`${formatWorkedTime(seconds)} Worked time`}
    >
      {formatWorkedTime(seconds)}
    </time>
  );
}

/** Worked time: every finished stretch banked by SQL, plus the open one while
 * it runs. Stands on its own — the total outlives Working now and Active, so
 * it is not a child of the working control. */
export function WorkedTime({
  task,
  nowMs,
}: {
  task: Task;
  nowMs?: number;
}) {
  const seconds = task.workedSeconds + (useWorkSessionSeconds(task, nowMs) ?? 0);

  return (
    <time
      className="worked-time"
      dateTime={`PT${seconds}S`}
      title="Worked time"
      aria-label={`${formatWorkedTime(seconds)} Worked time`}
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
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!task.workingNow) return;
    const interval = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, [task.workingNow]);
  return (
    <span className="working-control">
      <WorkingToggle
        task={task}
        compact={compact}
        playPause={playPause}
        nowMs={nowMs}
        onToggle={(working) => mutate(() => setTaskWorking(task.id, working))}
      />
      {showTime && !playPause && (
        <CurrentStretch task={task} nowMs={nowMs} />
      )}
    </span>
  );
}
