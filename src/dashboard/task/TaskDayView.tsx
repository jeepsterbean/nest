import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { addTaskParent, removeTaskParent } from "../../lib/commands";
import type { Task } from "../../lib/types";
import { useDashboardData } from "../context/DashboardDataContext";
import { startPointerDrag } from "../lib/pointerDrag";
import { descendantIds, type TaskGraphProjection } from "../lib/taskGraph";
import { buildTaskDayForest, isInTaskDay, type TaskDayNode } from "../lib/taskDayTree";
import { formatTime } from "../lib/time";
import { StatusTrigger } from "./StatusTrigger";
import { WorkingBadge } from "./TaskWorkingControl";

/** `fromParentId` is the Parent the dragged row was shown under; null for a root row. */
type DayDrag = { taskId: number; fromParentId: number | null };

const isClosed = (task: Task) => task.status === "completed" || task.status === "cancelled";

function openChildCount(graph: TaskGraphProjection, task: Task) {
  const children = graph.childrenByParent.get(task.id) ?? [];
  return { open: children.filter(child => !isClosed(child)).length, total: children.length };
}

/** A drop is valid unless it would link a Task to itself, to a descendant (cycle), or twice to the same Parent. */
function canDropOnto(graph: TaskGraphProjection, drag: DayDrag, targetId: number) {
  const dragged = graph.byId.get(drag.taskId);
  if (!dragged || targetId === drag.taskId) return false;
  if (dragged.parentTaskIds.includes(targetId)) return false;
  return !descendantIds(graph, drag.taskId).has(targetId);
}

type RowProps = {
  node: TaskDayNode;
  parentId: number | null;
  depth: number;
  graph: TaskGraphProjection;
  selectedTaskId: number | null;
  onSelect: (id: number, origin?: HTMLElement) => void;
  drag: DayDrag | null;
  dropTargetId: number | null;
  onRowPointerDown: (event: ReactPointerEvent<HTMLElement>, drag: DayDrag) => void;
};

function TaskDayRow(props: RowProps) {
  const { node, parentId, depth, graph, selectedTaskId, onSelect, drag, dropTargetId } = props;
  const { task, reference, contextOnly, children } = node;
  const progress = openChildCount(graph, task);
  const closedToday = !contextOnly && isClosed(task);
  const acceptsDrop = drag !== null && canDropOnto(graph, drag, task.id);
  const className = [
    "task-day__row",
    depth === 0 && "task-day__row--root",
    reference && "task-day__row--reference",
    contextOnly && "task-day__row--context",
    task.status === "cancelled" && "task-day__row--cancelled",
    drag?.taskId === task.id && "task-day__row--dragging",
    acceptsDrop && dropTargetId === task.id && "task-day__row--drop-target",
    selectedTaskId === task.id && "task-day__row--selected",
  ].filter(Boolean).join(" ");

  return (
    <li className={`task-day__item${depth === 0 ? " task-day__item--root" : ""}`}>
      <div
        className={className}
        data-day-task-id={task.id}
        onPointerDown={e => {
          if (e.button !== 0 || (e.target as HTMLElement).closest(".task-status-trigger")) return;
          props.onRowPointerDown(e, { taskId: task.id, fromParentId: parentId });
        }}
      >
        <StatusTrigger task={task} compact />
        <button
          type="button"
          className="task-day__title"
          title={task.title}
          onClick={e => onSelect(task.id, e.currentTarget)}
        >
          {task.title}
        </button>
        {task.workingNow && <WorkingBadge />}
        {reference && <span className="task-day__note task-day__note--tag">also shown above</span>}
        {!reference && progress.total > 0 && (
          <span className="task-day__note task-day__note--progress">{progress.open}/{progress.total} open</span>
        )}
        {closedToday && task.closedAt !== null && (
          <time className="task-day__note" dateTime={new Date(task.closedAt * 1000).toISOString()}>
            {formatTime(task.closedAt)}
          </time>
        )}
      </div>
      {children.length > 0 && (
        <ul className="task-day__children">
          {children.map(child => (
            <TaskDayRow key={child.task.id} {...props} node={child} parentId={task.id} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

/** Today's open and just-closed Tasks as a Parent → Child outline. Dragging a row onto another makes it that Task's Child. */
export function TaskDayView({
  graph,
  nowMs,
  selectedTaskId,
  onSelect,
}: {
  graph: TaskGraphProjection;
  nowMs: number;
  selectedTaskId: number | null;
  onSelect: (id: number, origin?: HTMLElement) => void;
}) {
  const { mutate } = useDashboardData();
  const [drag, setDrag] = useState<DayDrag | null>(null);
  const [dropTargetId, setDropTargetId] = useState<number | null>(null);
  const [rootZoneActive, setRootZoneActive] = useState(false);
  // A drag ends in a click on the title it started from, which would open details.
  const suppressClickRef = useRef(false);
  const stopDragRef = useRef<(() => void) | null>(null);
  useEffect(() => () => stopDragRef.current?.(), []);

  const endDrag = () => {
    setDrag(null);
    setDropTargetId(null);
    setRootZoneActive(false);
  };

  const dropOnto = (dragged: DayDrag, targetId: number, keepShownParent: boolean) => {
    const { taskId, fromParentId } = dragged;
    // Moving out of the shown Parent only after the new link succeeds keeps a rejected drop from orphaning the Task.
    void mutate(async () => {
      await addTaskParent(taskId, targetId);
      if (!keepShownParent && fromParentId !== null && fromParentId !== targetId) await removeTaskParent(taskId, fromParentId);
    });
  };

  const dropOnRoot = ({ taskId, fromParentId }: DayDrag) => {
    if (fromParentId !== null) void mutate(() => removeTaskParent(taskId, fromParentId));
  };

  const beginDrag = (event: ReactPointerEvent<HTMLElement>, dragged: DayDrag) => {
    // Pointer capture on the row can swallow the trailing click, so a stale flag must not eat the next real one.
    suppressClickRef.current = false;
    const hit = (e: PointerEvent) => {
      const under = document.elementFromPoint(e.clientX, e.clientY);
      const rowId = under?.closest<HTMLElement>("[data-day-task-id]")?.dataset.dayTaskId;
      const targetId = rowId === undefined ? null : Number(rowId);
      return {
        targetId: targetId !== null && canDropOnto(graph, dragged, targetId) ? targetId : null,
        root: dragged.fromParentId !== null && under?.closest("[data-day-root-zone]") != null,
      };
    };
    const finish = () => {
      window.removeEventListener("keydown", onKey);
      stopDragRef.current = null;
      endDrag();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      cleanup();
      finish();
    };
    const cleanup = startPointerDrag(event, {
      onStart: () => {
        setDrag(dragged);
        window.addEventListener("keydown", onKey);
      },
      onMove: move => {
        const { targetId, root } = hit(move);
        setDropTargetId(targetId);
        setRootZoneActive(root);
      },
      onEnd: (up, wasDragged) => {
        const { targetId, root } = hit(up);
        finish();
        if (!wasDragged) return;
        suppressClickRef.current = true;
        if (targetId !== null) dropOnto(dragged, targetId, up.altKey);
        else if (root) dropOnRoot(dragged);
      },
      onCancel: finish,
    });
    stopDragRef.current = () => {
      cleanup();
      window.removeEventListener("keydown", onKey);
    };
  };

  const handleSelect = (id: number, origin?: HTMLElement) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    onSelect(id, origin);
  };

  const forest = buildTaskDayForest(graph, nowMs);
  if (forest.length === 0) {
    return <p className="task-day__empty">Nothing open and nothing closed today.</p>;
  }
  const rootZoneVisible = drag !== null && drag.fromParentId !== null;
  return (
    <>
      <ul className="task-day" aria-label="Tasks for today">
        {forest.map(node => (
          <TaskDayRow
            key={node.task.id}
            node={node}
            parentId={null}
            depth={0}
            graph={graph}
            selectedTaskId={selectedTaskId}
            onSelect={handleSelect}
            drag={drag}
            dropTargetId={dropTargetId}
            onRowPointerDown={beginDrag}
          />
        ))}
      </ul>
      {rootZoneVisible && (
        <div
          className={`task-day__root-zone${rootZoneActive ? " task-day__root-zone--active" : ""}`}
          data-day-root-zone
        >
          Drop here to remove from its Parent
        </div>
      )}
    </>
  );
}

export const taskDayCounts = (tasks: Task[], nowMs: number) => {
  const day = tasks.filter(task => isInTaskDay(task, nowMs));
  const open = day.filter(task => !isClosed(task)).length;
  return { open, closed: day.length - open };
};
