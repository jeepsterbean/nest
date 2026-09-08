import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { Task } from "../../lib/types";
import { xIcon } from "../components/icons";
import { useDashboardData } from "../context/DashboardDataContext";
import { startPointerDrag } from "../lib/pointerDrag";
import { isTaskBlocked } from "../lib/taskGraph";
import {
  MAP_COLS,
  MAP_ROW_HEIGHT,
  mapRowCount,
  placeOnMap,
  pruneTaskMapLayout,
  readTaskMapLayout,
  removeFromMap,
  writeTaskMapLayout,
  type MapCell,
  type TaskMapLayout,
} from "../lib/taskMap";
import { WORKING_STATUSES } from "../lib/tasks";
import { TaskGraphBadges } from "./TaskRelations";

const CARD_INSET = 5;
const EDGE_STATES = ["plain", "done", "selected"] as const;
type EdgeState = (typeof EDGE_STATES)[number];
const isClosed = (task: Task) =>
  task.status === "completed" || task.status === "cancelled";

type Drag = {
  taskId: number;
  clientX: number;
  clientY: number;
  cell: MapCell | null;
  overTray: boolean;
};

/** Open Tasks wait in the tray; dropped ones sit on the grid with Blocker lines drawn between them. */
export function TaskMap({
  tasks,
  selectedTaskId,
  onSelect,
}: {
  /** Scope-filtered tasks feed the tray; the board shows every placed task. */
  tasks: Task[];
  selectedTaskId: number | null;
  onSelect: (id: number, origin?: HTMLElement) => void;
}) {
  const { tasks: allTasks, taskGraph } = useDashboardData();
  const [layout, setLayout] = useState<TaskMapLayout>(readTaskMapLayout);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [boardWidth, setBoardWidth] = useState(0);
  const boardRef = useRef<HTMLDivElement>(null);
  const trayRef = useRef<HTMLElement>(null);
  const suppressClickRef = useRef(false);

  useEffect(() => writeTaskMapLayout(layout), [layout]);
  useEffect(() => {
    const liveIds = new Set(allTasks.map((task) => task.id));
    setLayout((prev) => pruneTaskMapLayout(prev, liveIds));
  }, [allTasks]);
  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const observer = new ResizeObserver(() =>
      setBoardWidth(board.getBoundingClientRect().width),
    );
    observer.observe(board);
    return () => observer.disconnect();
  }, []);

  const placedTasks = useMemo(
    () => allTasks.filter((task) => layout[task.id]),
    [allTasks, layout],
  );
  const trayTasks = useMemo(
    () =>
      tasks.filter(
        (task) => WORKING_STATUSES.includes(task.status) && !layout[task.id],
      ),
    [tasks, layout],
  );
  const rows = mapRowCount(layout);
  const cellWidth = boardWidth / MAP_COLS;

  const cellAt = (clientX: number, clientY: number): MapCell | null => {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return null;
    if (
      clientX < rect.left ||
      clientX >= rect.right ||
      clientY < rect.top ||
      clientY >= rect.bottom
    ) {
      return null;
    }
    return {
      x: Math.floor(((clientX - rect.left) / rect.width) * MAP_COLS),
      y: Math.floor((clientY - rect.top) / MAP_ROW_HEIGHT),
    };
  };
  const isOverTray = (clientX: number, clientY: number) => {
    const rect = trayRef.current?.getBoundingClientRect();
    return (
      !!rect &&
      clientX >= rect.left &&
      clientX < rect.right &&
      clientY >= rect.top &&
      clientY < rect.bottom
    );
  };

  const beginDrag = (task: Task) => (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    startPointerDrag(event, {
      onStart: () =>
        setDrag({
          taskId: task.id,
          clientX: event.clientX,
          clientY: event.clientY,
          cell: null,
          overTray: false,
        }),
      onMove: (move) =>
        setDrag({
          taskId: task.id,
          clientX: move.clientX,
          clientY: move.clientY,
          cell: cellAt(move.clientX, move.clientY),
          overTray: isOverTray(move.clientX, move.clientY),
        }),
      onEnd: (up, dragged) => {
        setDrag(null);
        if (!dragged) return;
        suppressClickRef.current = true;
        const cell = cellAt(up.clientX, up.clientY);
        if (cell) {
          setLayout((prev) => placeOnMap(prev, task.id, cell));
        } else if (isOverTray(up.clientX, up.clientY)) {
          setLayout((prev) => removeFromMap(prev, task.id));
        }
      },
      onCancel: () => setDrag(null),
    });
  };

  // A drag that ends on the pressed element still fires click; swallow that one.
  const onClickCapture = (event: {
    preventDefault: () => void;
    stopPropagation: () => void;
  }) => {
    if (!suppressClickRef.current) return;
    suppressClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  };

  const edges = useMemo(() => {
    if (cellWidth === 0) return [];
    const halfW = cellWidth / 2 - CARD_INSET;
    const halfH = MAP_ROW_HEIGHT / 2 - CARD_INSET;
    const center = (cell: MapCell) => ({
      x: (cell.x + 0.5) * cellWidth,
      y: (cell.y + 0.5) * MAP_ROW_HEIGHT,
    });
    const result: { key: string; d: string; state: EdgeState }[] = [];
    for (const blocked of placedTasks) {
      for (const blocker of taskGraph.blockersByTask.get(blocked.id) ?? []) {
        const from = layout[blocker.id];
        if (!from) continue;
        const a = center(from);
        const b = center(layout[blocked.id]);
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        if (dx === 0 && dy === 0) continue;
        // Trim the line so it runs edge to edge instead of under the cards.
        const trim = Math.min(halfW / Math.abs(dx), halfH / Math.abs(dy));
        result.push({
          key: `${blocker.id}-${blocked.id}`,
          d: `M${a.x + dx * trim} ${a.y + dy * trim} L${b.x - dx * trim} ${
            b.y - dy * trim
          }`,
          state:
            selectedTaskId === blocker.id || selectedTaskId === blocked.id
              ? "selected"
              : isClosed(blocker)
                ? "done"
                : "plain",
        });
      }
    }
    return result;
  }, [cellWidth, layout, placedTasks, selectedTaskId, taskGraph]);

  const draggedTask =
    drag === null ? null : taskGraph.byId.get(drag.taskId) ?? null;

  return (
    <div className={`task-map${drag ? " task-map--dragging" : ""}`}>
      <aside
        ref={trayRef}
        className={`task-map__tray${drag?.overTray ? " task-map__tray--over" : ""}`}
        aria-label="Open tasks waiting to be placed"
      >
        <div className="task-map__tray-head">
          <span>Open</span>
          <span>{trayTasks.length}</span>
        </div>
        {trayTasks.length === 0 ? (
          <div className="task-map__tray-empty">
            {tasks.some((task) => WORKING_STATUSES.includes(task.status))
              ? "Every open task is on the map."
              : "No open tasks here."}
          </div>
        ) : (
          <ol className="task-map__tray-list">
            {trayTasks.map((task) => (
              <li key={task.id}>
                <button
                  type="button"
                  className={`task-map__tray-item${
                    drag?.taskId === task.id
                      ? " task-map__tray-item--dragging"
                      : ""
                  }`}
                  title="Drag onto the map, or click to place it in the first free cell"
                  onPointerDown={beginDrag(task)}
                  onClickCapture={onClickCapture}
                  onClick={() =>
                    setLayout((prev) =>
                      placeOnMap(prev, task.id, { x: 0, y: 0 }),
                    )
                  }
                >
                  <span className={`status-dot status-dot--${task.status}`} />
                  <span className="task-map__tray-title">{task.title}</span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </aside>

      <div
        ref={boardRef}
        className="task-map__board"
        style={{
          gridTemplateRows: `repeat(${rows}, ${MAP_ROW_HEIGHT}px)`,
          backgroundSize: `${100 / MAP_COLS}% ${MAP_ROW_HEIGHT}px`,
        }}
        aria-label="Task map"
      >
        <svg
          className="task-map__edges"
          width={boardWidth}
          height={rows * MAP_ROW_HEIGHT}
          aria-hidden="true"
        >
          <defs>
            {/* One marker per state: WebKit here has no context-stroke, so the
                arrowhead cannot inherit its line's colour. */}
            {EDGE_STATES.map((state) => (
              <marker
                key={state}
                id={`task-map-arrow-${state}`}
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto"
              >
                <path className={`task-map__arrow--${state}`} d="M0 0L10 5L0 10z" />
              </marker>
            ))}
          </defs>
          {edges.map((edge) => (
            <path
              key={edge.key}
              className={`task-map__edge task-map__edge--${edge.state}`}
              d={edge.d}
              markerEnd={`url(#task-map-arrow-${edge.state})`}
            />
          ))}
        </svg>

        {placedTasks.length === 0 && !drag && (
          <div className="task-map__hint">
            Drag an open task here. Arrows point from a Blocker to the task it
            blocks.
          </div>
        )}

        {drag?.cell && (
          <div
            className="task-map__target"
            style={{ gridColumn: drag.cell.x + 1, gridRow: drag.cell.y + 1 }}
          />
        )}

        {placedTasks.map((task) => {
          const cell = layout[task.id];
          const blocked = isTaskBlocked(taskGraph, task.id);
          return (
            <div
              key={task.id}
              className={`task-map-card task-map-card--${task.status}${
                blocked ? " task-map-card--blocked" : ""
              }${isClosed(task) ? " task-map-card--done" : ""}${
                selectedTaskId === task.id ? " task-map-card--selected" : ""
              }${drag?.taskId === task.id ? " task-map-card--dragging" : ""}`}
              style={{ gridColumn: cell.x + 1, gridRow: cell.y + 1 }}
              onPointerDown={beginDrag(task)}
              onClickCapture={onClickCapture}
            >
              <div className="task-map-card__top">
                <span className={`status-dot status-dot--${task.status}`} />
                <button
                  type="button"
                  className="task-map-card__open"
                  title="Open details"
                  onClick={(event) => onSelect(task.id, event.currentTarget)}
                >
                  {task.title}
                </button>
                <button
                  type="button"
                  className="task-map-card__remove"
                  aria-label={`Send ${task.title} back to the tray`}
                  title="Back to tray"
                  onClick={() =>
                    setLayout((prev) => removeFromMap(prev, task.id))
                  }
                >
                  {xIcon}
                </button>
              </div>
              <TaskGraphBadges task={task} />
            </div>
          );
        })}
      </div>

      {drag && draggedTask && (
        <div
          className="task-map__ghost"
          style={{ left: drag.clientX, top: drag.clientY }}
          aria-hidden="true"
        >
          {draggedTask.title}
        </div>
      )}
    </div>
  );
}
