import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { listTaskUpdates } from "../../lib/commands";
import type { Task, TaskUpdate, TaskUpdateKind, TaskUpdatePage, TaskWorkInterval } from "../../lib/types";
import { formatDate, formatTime, startOfDayMs } from "../lib/time";
import { RECORDED_TASK_STATUS_LABEL } from "../lib/tasks";

const labels: Record<TaskUpdateKind, string> = {
  created: "Task created", status: "Status changed", title: "Renamed", description: "Description updated",
  scope: "Scope", value: "Value", effort: "Effort", parent_set: "Parent set",
  parent_removed: "Parent removed", child_added: "Child added", child_removed: "Child removed",
  blocker_added: "Blocker added", blocker_removed: "Blocker removed",
  dependent_added: "Dependent added", dependent_removed: "Dependent removed",
  follows: "Follows task", follow_up: "Follow-up created",
  follows_removed: "Follows link removed", follow_up_removed: "Follow-up removed", work_started: "Started work",
  work_stopped: "Stopped work", work_corrected: "Work corrected", work_removed: "Work removed",
};

// A recorded interval is a past snapshot, so an open end means the stretch was
// still running then. "Working now" would claim it is live today.
function workIntervalLabel({ startedAt, endedAt }: TaskWorkInterval): string {
  const moment = (seconds: number) => `${formatDate(seconds)}, ${formatTime(seconds)}`;
  return `${moment(startedAt)} – ${endedAt === null ? "still running" : moment(endedAt)}`;
}

function updateDetail(update: TaskUpdate): string | null {
  if (update.relatedTitle !== null) return update.relatedTitle;
  if (update.workBefore !== null || update.workAfter !== null) {
    return [update.workBefore, update.workAfter]
      .filter((interval) => interval !== null).map(workIntervalLabel).join(" → ");
  }
  if (update.beforeValue === null && update.afterValue === null) return null;
  const recordsStatus = update.kind === "status" || update.kind === "created";
  const valueLabel = (value: string | null) => value === null ? "None"
    : recordsStatus ? (RECORDED_TASK_STATUS_LABEL as Record<string, string>)[value] ?? value : value;
  if (update.kind === "created") return valueLabel(update.afterValue);
  return `${valueLabel(update.beforeValue)} → ${valueLabel(update.afterValue)}`;
}

function dayLabel(day: number, today: number): string {
  const year = new Date(day).getFullYear();
  const yearSuffix = year !== new Date(today).getFullYear() ? ` ${year}` : "";
  return `${day === today ? "Today · " : ""}${formatDate(day / 1000)}${yearSuffix}`;
}

export function TaskUpdates({ task }: { task: Task }) {
  const [page, setPage] = useState<TaskUpdatePage | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retries, setRetries] = useState(0);
  const generation = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  const [topDay, setTopDay] = useState<number | null>(null);

  // The dashboard reloads for unrelated changes too (Timer due, Notes,
  // Phases), which must not refetch, so only a new History revision does.
  useEffect(() => {
    const request = ++generation.current;
    // Work boundaries can move or disappear, so cached older pages become
    // invalid too. Restart pagination to keep one continuous current history.
    setPage(null);
    setTopDay(null);
    if (listRef.current) listRef.current.scrollTop = 0;
    setLoading(true);
    setFailed(false);
    void listTaskUpdates(task.id).then((result) => {
      if (request === generation.current) setPage(result);
    }).catch(() => { if (request === generation.current) setFailed(true); })
      .finally(() => { if (request === generation.current) setLoading(false); });
    return () => { generation.current++; };
  }, [task.id, task.historyRevision, retries]);

  const loadMore = () => {
    if (!page || loading) return;
    const request = generation.current;
    setLoading(true);
    setFailed(false);
    void listTaskUpdates(task.id, page.updates[page.updates.length - 1]?.cursor ?? null).then((result) => {
      if (request === generation.current) setPage({ ...result, updates: [...page.updates, ...result.updates] });
    }).catch(() => { if (request === generation.current) setFailed(true); })
      .finally(() => { if (request === generation.current) setLoading(false); });
  };

  // Only an earlier page can fail while a page is held, so Retry repeats that
  // page instead of discarding everything already loaded.
  const retry = () => page ? loadMore() : setRetries((value) => value + 1);

  const dayGroups: { day: number; updates: TaskUpdate[] }[] = [];
  for (const update of page?.updates ?? []) {
    const day = startOfDayMs(update.cursor.time);
    const lastGroup = dayGroups[dayGroups.length - 1];
    if (lastGroup?.day === day) lastGroup.updates.push(update);
    else dayGroups.push({ day, updates: [update] });
  }
  const today = startOfDayMs(Date.now() / 1000);
  const shownDay = dayGroups.find(({ day }) => day === topDay)?.day ?? dayGroups[0]?.day;

  // The heading carries the date of the first entry still in view, so day
  // groups in the list only need a divider between them.
  const syncTopDay = () => {
    const list = listRef.current;
    if (!list) return;
    const listTop = list.getBoundingClientRect().top;
    for (const group of list.querySelectorAll<HTMLElement>("[data-day]")) {
      if (group.getBoundingClientRect().bottom > listTop) { setTopDay(Number(group.dataset.day)); return; }
    }
  };
  useLayoutEffect(syncTopDay, [page]);

  return <section className="task-updates" aria-label="History">
    <header className="task-updates__head">
      <h3>History</h3>
      {shownDay !== undefined && <span className="task-updates__day-label">{dayLabel(shownDay, today)}</span>}
    </header>
    <div ref={listRef} className="task-updates__list" tabIndex={0} aria-busy={loading} onScroll={syncTopDay}>
      {dayGroups.map(({ day, updates }) => <div className="task-updates__day" key={day} data-day={day}>
        <ol aria-label={dayLabel(day, today)}>{updates.map((update) => {
          const detail = updateDetail(update);
          return <li key={`${update.cursor.source}:${update.cursor.id}`}>
            <time dateTime={new Date(update.cursor.time * 1000).toISOString()}>{formatTime(update.cursor.time)}</time>
            <span className="task-updates__entry">
              <span className="task-updates__event">{labels[update.kind]}</span>
              {detail !== null && <span className="task-updates__detail">{detail}</span>}
            </span>
          </li>;
        })}</ol>
      </div>)}
      {loading && <p role="status">Loading updates…</p>}
      {failed && <p role="alert">Updates unavailable. <button type="button" onClick={retry}>Retry</button></p>}
      {!loading && !failed && page && <>
        {page.updates.length === 0 && <p>No updates yet.</p>}
        {page.hasMore && <button type="button" onClick={loadMore}>Load earlier updates</button>}
        {!page.hasMore && <>
          <p>Beginning of history.</p>
          {task.createdAt < page.recordingStartedAt && <p>
            Edits recorded since {formatDate(page.recordingStartedAt)} {new Date(page.recordingStartedAt * 1000).getFullYear()}.
          </p>}
        </>}
      </>}
    </div>
  </section>;
}
