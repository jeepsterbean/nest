import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import type { Task } from "../../lib/types";
import { chevronRightIcon, xIcon } from "../components/icons";
import { useDashboardData } from "../context/DashboardDataContext";
import { startPointerDrag } from "../lib/pointerDrag";
import { childProgress } from "../lib/taskGraph";
import {
  cascadeSpot,
  clampMapView,
  connectorPath,
  MAP_BOARD_HEIGHT,
  MAP_BOARD_WIDTH,
  MAP_CARD_WIDTH,
  placeOnMap,
  pruneTaskMapLayout,
  readTaskMapLayout,
  readTaskMapView,
  removeFromMap,
  toBoardPoint,
  writeTaskMapLayout,
  writeTaskMapView,
  zoomAround,
  type MapPoint,
  type MapView,
  type TaskMapLayout,
} from "../lib/taskMap";
import { TASK_STATUS_LABEL, WORKING_STATUSES } from "../lib/tasks";
import { TaskStatusIcon } from "./TaskStatusIcon";

/** Used until a box has been measured, so first-paint lines land close. */
const FALLBACK_CARD_HEIGHT = 128;
/** Wheel deltas are far coarser than trackpad pinch deltas; scale them apart. */
const WHEEL_ZOOM_RATE = 0.0015;
const PINCH_ZOOM_RATE = 0.01;
const BUTTON_ZOOM_STEP = 1.25;

const isClosed = (task: Task) =>
  task.status === "completed" || task.status === "cancelled";

type Drag = {
  taskId: number;
  /** Pointer offset inside the box, in board pixels, so it does not jump. */
  grab: MapPoint;
  clientX: number;
  clientY: number;
  overSidebar: boolean;
  /** Where the box sits while the drag runs; null when it is not over the canvas. */
  point: MapPoint | null;
};

type Attribute = { name: string; value: string; muted?: boolean };

/** Open Tasks wait in the Map sidebar; dropped ones become entity boxes placed
 * freely on a big pan/zoom canvas, wired by Parent connectors. */
export function TaskMap({
  tasks,
  selectedTaskId,
  composer,
  onSelect,
}: {
  tasks: Task[];
  selectedTaskId: number | null;
  /** The "add an active task" row, rendered at the top of the sidebar. */
  composer?: ReactNode;
  onSelect: (id: number, origin?: HTMLElement) => void;
}) {
  const { tasks: allTasks, taskGraph } = useDashboardData();
  const [layout, setLayout] = useState<TaskMapLayout>(readTaskMapLayout);
  const [view, setView] = useState<MapView>(readTaskMapView);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [panning, setPanning] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [heights, setHeights] = useState<Record<number, number>>({});
  const viewportRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const suppressClickRef = useRef(false);
  const viewRef = useRef(view);
  viewRef.current = view;
  const interacting = drag !== null || panning;

  // Hold the writes until the gesture ends: a move is one storage write, not sixty.
  useEffect(() => {
    if (!interacting) writeTaskMapLayout(layout);
  }, [layout, interacting]);
  useEffect(() => {
    if (!interacting) writeTaskMapView(view);
  }, [view, interacting]);
  useEffect(() => {
    const liveIds = new Set(allTasks.map((task) => task.id));
    setLayout((prev) => pruneTaskMapLayout(prev, liveIds));
  }, [allTasks]);

  const viewportRect = () => viewportRef.current?.getBoundingClientRect() ?? null;

  // Wheel zooms about the pointer; a listener on the element, since React's
  // onWheel is passive and cannot preventDefault the page zoom.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = viewport.getBoundingClientRect();
      const rate = event.ctrlKey ? PINCH_ZOOM_RATE : WHEEL_ZOOM_RATE;
      const pointer = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
      setView((prev) =>
        clampMapView(zoomAround(prev, Math.exp(-event.deltaY * rate), pointer), rect),
      );
    };
    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, []);

  // Keep the canvas covering the viewport when the window or panels resize.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(([entry]) =>
      setView((prev) => clampMapView(prev, entry.contentRect)),
    );
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  // Box heights vary with how many attribute rows a task has; connectors need
  // the real height, so measure rather than predict it.
  const sizeObserver = useMemo(
    () =>
      new ResizeObserver((entries) => {
        setHeights((prev) => {
          let next = prev;
          for (const entry of entries) {
            const element = entry.target as HTMLElement;
            const id = Number(element.dataset.taskId);
            if (prev[id] === element.offsetHeight) continue;
            next = { ...next, [id]: element.offsetHeight };
          }
          return next;
        });
      }),
    [],
  );
  useEffect(() => () => sizeObserver.disconnect(), [sizeObserver]);
  const measureCard = (node: HTMLDivElement | null) => {
    if (!node) return;
    sizeObserver.observe(node);
    return () => sizeObserver.unobserve(node);
  };

  /** What the canvas shows: the stored layout with the in-flight drag applied. */
  const boardLayout = useMemo(
    () => (drag?.point ? placeOnMap(layout, drag.taskId, drag.point) : layout),
    [layout, drag],
  );
  const placedTasks = useMemo(
    () => allTasks.filter((task) => boardLayout[task.id]),
    [allTasks, boardLayout],
  );
  const sidebarTasks = useMemo(
    () =>
      tasks.filter(
        (task) => WORKING_STATUSES.includes(task.status) && !boardLayout[task.id],
      ),
    [tasks, boardLayout],
  );

  /** Board point under the pointer, less the grab offset; null off-canvas. */
  const boardPointAt = (
    clientX: number,
    clientY: number,
    grab: MapPoint,
  ): MapPoint | null => {
    const rect = viewportRect();
    if (!rect || rect.width === 0) return null;
    if (
      clientX < rect.left ||
      clientX >= rect.right ||
      clientY < rect.top ||
      clientY >= rect.bottom
    ) {
      return null;
    }
    const point = toBoardPoint(viewRef.current, {
      x: clientX - rect.left,
      y: clientY - rect.top,
    });
    return { x: point.x - grab.x, y: point.y - grab.y };
  };
  const isOverSidebar = (clientX: number, clientY: number) => {
    const rect = sidebarRef.current?.getBoundingClientRect();
    return (
      !!rect &&
      clientX >= rect.left &&
      clientX < rect.right &&
      clientY >= rect.top &&
      clientY < rect.bottom
    );
  };
  /** Middle of the canvas as it is currently framed — where click-placed boxes go. */
  const viewportCenterOnBoard = (): MapPoint => {
    const rect = viewportRect();
    return rect
      ? toBoardPoint(viewRef.current, { x: rect.width / 2, y: rect.height / 2 })
      : { x: 24, y: 24 };
  };

  const beginDrag =
    (task: Task, fromSidebar: boolean) => (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      const rect = event.currentTarget.getBoundingClientRect();
      const zoom = viewRef.current.zoom;
      // A sidebar row is narrower than a box; grab it near its top-left instead.
      const grab = fromSidebar
        ? { x: 24, y: 14 }
        : {
            x: (event.clientX - rect.left) / zoom,
            y: (event.clientY - rect.top) / zoom,
          };
      // The box follows the pointer through drag state alone; the layout — and
      // so storage — takes a single write on drop.
      let dropPoint: MapPoint | null = null;
      const track = (move: { clientX: number; clientY: number }) => {
        const overSidebar = isOverSidebar(move.clientX, move.clientY);
        const point = overSidebar
          ? null
          : boardPointAt(move.clientX, move.clientY, grab);
        if (point) dropPoint = point;
        setDrag({
          taskId: task.id,
          grab,
          clientX: move.clientX,
          clientY: move.clientY,
          overSidebar,
          point,
        });
      };

      startPointerDrag(event, {
        onStart: () => track(event),
        onMove: track,
        onEnd: (up, dragged) => {
          setDrag(null);
          if (!dragged) return;
          suppressClickRef.current = true;
          const point = dropPoint;
          if (isOverSidebar(up.clientX, up.clientY)) {
            setLayout((prev) => removeFromMap(prev, task.id));
          } else if (point) {
            setLayout((prev) => placeOnMap(prev, task.id, point));
          }
        },
        onCancel: () => setDrag(null),
      });
    };

  /** Dragging bare canvas pans; dragging a box is handled by the box itself. */
  const beginPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest(".task-entity")) return;
    const origin = viewRef.current;
    const startX = event.clientX;
    const startY = event.clientY;
    startPointerDrag(event, {
      startImmediately: true,
      onStart: () => setPanning(true),
      onMove: (move) => {
        const rect = viewportRect();
        if (!rect) return;
        setView(
          clampMapView(
            {
              zoom: origin.zoom,
              x: origin.x + (move.clientX - startX),
              y: origin.y + (move.clientY - startY),
            },
            rect,
          ),
        );
      },
      onEnd: () => setPanning(false),
      onCancel: () => setPanning(false),
    });
  };

  const zoomByButton = (factor: number) => {
    const rect = viewportRect();
    if (!rect) return;
    setView((prev) =>
      clampMapView(
        zoomAround(prev, factor, { x: rect.width / 2, y: rect.height / 2 }),
        rect,
      ),
    );
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
    const boxOf = (id: number) => {
      const point = boardLayout[id];
      return point === undefined
        ? null
        : {
            x: point.x,
            y: point.y,
            width: MAP_CARD_WIDTH,
            height: heights[id] ?? FALLBACK_CARD_HEIGHT,
          };
    };
    const result: { key: string; d: string; state: string }[] = [];
    for (const task of placedTasks) {
      for (const parentId of task.parentTaskIds) {
        const target = boxOf(task.id);
        const source = boxOf(parentId);
        if (!target || !source) continue;
        const selected = selectedTaskId === task.id || selectedTaskId === parentId;
        const parent = taskGraph.byId.get(parentId);
        result.push({
          key: `${parentId}-${task.id}`,
          d: connectorPath(source, target).d,
          state: selected
            ? "selected"
            : isClosed(task) || (parent !== undefined && isClosed(parent))
              ? "done"
              : "plain",
        });
      }
    }
    return result;
  }, [heights, boardLayout, placedTasks, selectedTaskId, taskGraph]);

  const draggedTask =
    drag === null ? null : taskGraph.byId.get(drag.taskId) ?? null;

  const attributesOf = (task: Task): Attribute[] => {
    const progress = childProgress(taskGraph, task.id);
    const parents = task.parentTaskIds.flatMap((id) => {
      const parent = taskGraph.byId.get(id);
      return parent ? [parent.title] : [];
    });
    return [
      { name: "status", value: TASK_STATUS_LABEL[task.status] },
      {
        name: "value / effort",
        value: `${task.value ?? "—"} / ${task.effort ?? "—"}`,
        muted: task.value === null && task.effort === null,
      },
      ...(parents.length > 0 ? [{ name: "parents", value: parents.join(", ") }] : []),
      ...(progress.total > 0
        ? [{ name: "children", value: `${progress.completed} / ${progress.total}` }]
        : []),
    ];
  };

  return (
    <div className={`task-map${interacting ? " task-map--dragging" : ""}`}>
      <div
        ref={viewportRef}
        className={`task-map__viewport${panning ? " task-map__viewport--panning" : ""}`}
        onPointerDown={beginPan}
        aria-label="Task map"
      >
        <div
          className="task-map__canvas"
          style={{
            width: MAP_BOARD_WIDTH,
            height: MAP_BOARD_HEIGHT,
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
          }}
        >
          <svg
            className="task-map__edges"
            width={MAP_BOARD_WIDTH}
            height={MAP_BOARD_HEIGHT}
            aria-hidden="true"
          >
            <defs>
              {/* One marker per state: WebKit here has no context-stroke, so the
                  arrowhead cannot inherit its line's colour. */}
              {["plain", "done", "selected"].map((state) => (
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

          {placedTasks.map((task) => {
            const point = boardLayout[task.id];
            return (
              <div
                key={task.id}
                ref={measureCard}
                data-task-id={task.id}
                className={`task-entity task-entity--${task.status}${
                  isClosed(task) ? " task-entity--done" : ""
                }${selectedTaskId === task.id ? " task-entity--selected" : ""}${
                  drag?.taskId === task.id ? " task-entity--dragging" : ""
                }`}
                style={{ left: point.x, top: point.y, width: MAP_CARD_WIDTH }}
                onPointerDown={beginDrag(task, false)}
                onClickCapture={onClickCapture}
              >
                <div className="task-entity__head">
                  <TaskStatusIcon status={task.status} />
                  <button
                    type="button"
                    className="task-entity__title"
                    title="Open details"
                    onClick={(event) => onSelect(task.id, event.currentTarget)}
                  >
                    {task.title}
                  </button>
                  <button
                    type="button"
                    className="task-entity__remove"
                    aria-label={`Send ${task.title} back to the Map sidebar`}
                    title="Back to the Map sidebar"
                    onClick={() => setLayout((prev) => removeFromMap(prev, task.id))}
                  >
                    {xIcon}
                  </button>
                </div>
                <dl className="task-entity__fields">
                  {attributesOf(task).map((attribute) => (
                    <div className="task-entity__field" key={attribute.name}>
                      <dt>{attribute.name}</dt>
                      <dd className={attribute.muted ? "task-entity__value--muted" : ""}>
                        {attribute.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            );
          })}
        </div>

        {placedTasks.length === 0 && !drag && (
          <div className="task-map__hint">
            Drag an open task anywhere here. Connectors run Parent → Child.
          </div>
        )}
      </div>

      <aside
        ref={sidebarRef}
        className={`task-map__tray${drag?.overSidebar ? " task-map__tray--over" : ""}${
          sidebarCollapsed ? " task-map__tray--collapsed" : ""
        }`}
        aria-label="Open tasks waiting to be placed"
      >
        <div className="task-map__tray-head">
          {!sidebarCollapsed && (
            <>
              <span>Open</span>
              <span className="task-map__tray-count">{sidebarTasks.length}</span>
            </>
          )}
          <button
            type="button"
            className="task-map__tray-toggle"
            aria-expanded={!sidebarCollapsed}
            aria-label={sidebarCollapsed ? "Show open tasks" : "Hide open tasks"}
            title={sidebarCollapsed ? "Show open tasks" : "Hide open tasks"}
            onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
          >
            {sidebarCollapsed ? sidebarTasks.length : chevronRightIcon}
          </button>
        </div>
        {!sidebarCollapsed && (
          <>
            {composer}
            {sidebarTasks.length === 0 ? (
              <div className="task-map__tray-empty">
                {tasks.some((task) => WORKING_STATUSES.includes(task.status))
                  ? "Every open task is on the map."
                  : "No open tasks yet."}
              </div>
            ) : (
              <ol className="task-map__tray-list">
                {sidebarTasks.map((task) => (
                  <li key={task.id}>
                    <button
                      type="button"
                      className={`task-map__tray-item${
                        drag?.taskId === task.id
                          ? " task-map__tray-item--dragging"
                          : ""
                      }`}
                      title="Drag onto the map, or click to drop it in view"
                      onPointerDown={beginDrag(task, true)}
                      onClickCapture={onClickCapture}
                      onClick={() =>
                        setLayout((prev) =>
                          placeOnMap(prev, task.id, cascadeSpot(prev, viewportCenterOnBoard())),
                        )
                      }
                    >
                      <TaskStatusIcon status={task.status} />
                      <span className="task-map__tray-title">{task.title}</span>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </aside>

      <div className="task-map__zoom">
        <button
          type="button"
          aria-label="Zoom out"
          title="Zoom out"
          onClick={() => zoomByButton(1 / BUTTON_ZOOM_STEP)}
        >
          −
        </button>
        <button
          type="button"
          className="task-map__zoom-level"
          title="Reset zoom"
          onClick={() => zoomByButton(1 / view.zoom)}
        >
          {Math.round(view.zoom * 100)}%
        </button>
        <button
          type="button"
          aria-label="Zoom in"
          title="Zoom in"
          onClick={() => zoomByButton(BUTTON_ZOOM_STEP)}
        >
          +
        </button>
      </div>

      {drag && draggedTask && !drag.point && (
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
