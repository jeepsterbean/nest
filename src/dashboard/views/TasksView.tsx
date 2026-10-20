import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { NestIcon } from "../components/PulseIcon";
import { TaskSavedViewsProvider, useTaskSavedViews } from "../context/TaskSavedViewsContext";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { COLLAPSED_SECTION_SIDEBAR } from "../lib/sections";
import { startPointerDrag } from "../lib/pointerDrag";
import {
  measureTaskLayout, removeTaskPane, resizeTaskSplit, splitTaskPane, taskLayoutMinimum, taskPaneDropAt, taskPaneIds,
  TASK_PANE_DIVIDER, TASK_PANE_LIMIT, type TaskPaneDrop, type TaskPaneEdge, type TaskPaneLayout,
} from "../lib/taskPaneLayout";
import { readTaskPaneWorkspace, TASK_PANE_WORKSPACE_KEY } from "../lib/taskPaneWorkspace";
import { TaskPane } from "../task/TaskPane";

type DragSource = { kind: "view"; viewId: string } | { kind: "pane"; paneId: string };
type DropTarget = { paneId: string; placement: TaskPaneDrop };

export function TasksView(props: { sectionSidebar: HTMLElement | null; visible: boolean }) {
  return <TaskSavedViewsProvider><TaskWorkspace {...props} /></TaskSavedViewsProvider>;
}

function swapTaskPanes(layout: TaskPaneLayout, first: string, second: string): TaskPaneLayout {
  if (layout.kind === "pane") return { ...layout, id: layout.id === first ? second : layout.id === second ? first : layout.id };
  return { ...layout, first: swapTaskPanes(layout.first, first, second), second: swapTaskPanes(layout.second, first, second) };
}

function TaskWorkspace({ sectionSidebar, visible }: { sectionSidebar: HTMLElement | null; visible: boolean }) {
  const { state: saved } = useTaskSavedViews();
  const [workspace, setWorkspace] = useState(() => readTaskPaneWorkspace(saved));
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;
  const collapsedSidebar = useMediaQuery(COLLAPSED_SECTION_SIDEBAR);
  const sidebar = !collapsedSidebar ? sectionSidebar : null;
  const [overlayHost, setOverlayHost] = useState<HTMLDivElement | null>(null);
  const [modalPane, setModalPane] = useState<string | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const viewport = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const session = useRef<(() => void) | null>(null);
  const restoreResizeOrigin = useRef<(() => void) | null>(null);
  // Divider drags change the ratio on every move; the layout is stored once when the drag ends.
  const [resizing, setResizing] = useState(false);
  const suppressClick = useRef(false);
  const [drag, setDrag] = useState<{ source: DragSource; target: DropTarget | null; x: number; y: number } | null>(null);
  const minimum = useMemo(() => taskLayoutMinimum(workspace.layout), [workspace.layout]);
  const width = Math.max(size.width, minimum.width);
  const height = Math.max(size.height, minimum.height);
  const measured = useMemo(() => measureTaskLayout(workspace.layout, { left: 0, top: 0, width, height }), [workspace.layout, width, height]);

  useEffect(() => {
    if (resizing) return;
    try { localStorage.setItem(TASK_PANE_WORKSPACE_KEY, JSON.stringify(workspace)); } catch { /* The workspace remains usable when storage is full. */ }
  }, [workspace, resizing]);
  useEffect(() => {
    setWorkspace(current => {
      const missing = current.panes.some(pane => !saved.views.some(view => view.id === pane.viewId));
      return missing ? { ...current, panes: current.panes.map(pane => ({ ...pane, viewId: saved.views.some(view => view.id === pane.viewId) ? pane.viewId : saved.views[0]!.id })) } : current;
    });
  }, [saved.views]);
  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const measure = () => setSize({ width: element.clientWidth, height: element.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const finishSession = useCallback(() => {
    session.current?.();
    session.current = null;
    restoreResizeOrigin.current = null;
    setResizing(false);
    setDrag(null);
    suppressClick.current = false;
    document.documentElement.classList.remove("task-pane-drag-in-progress");
  }, []);
  useEffect(() => () => { session.current?.(); document.documentElement.classList.remove("task-pane-drag-in-progress"); }, []);
  useEffect(() => { if (!visible) finishSession(); }, [visible, finishSession]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !session.current) return;
      event.preventDefault();
      restoreResizeOrigin.current?.();
      finishSession();
    };
    window.addEventListener("keydown", escape, true);
    return () => window.removeEventListener("keydown", escape, true);
  }, [finishSession]);

  const activate = (id: string) => setWorkspace(current => current.activeId === id ? current : { ...current, activeId: id });
  const changeView = (id: string, viewId: string) => setWorkspace(current => ({ ...current, panes: current.panes.map(pane => pane.id === id ? { ...pane, viewId, loadVersion: (pane.loadVersion ?? 0) + 1 } : pane) }));
  const closePane = (id: string) => {
    setWorkspace(current => {
      const layout = removeTaskPane(current.layout, id);
      if (!layout) return current;
      const panes = current.panes.filter(pane => pane.id !== id);
      return { layout, panes, activeId: current.activeId === id ? panes[0]!.id : current.activeId };
    });
    requestAnimationFrame(() => canvas.current?.querySelector<HTMLElement>(".task-pane.is-active .task-views__trigger")?.focus());
  };
  const splitView = (targetId: string, viewId: string, edge: TaskPaneEdge) => {
    if (workspaceRef.current.panes.length >= TASK_PANE_LIMIT) return;
    const paneId = crypto.randomUUID();
    const splitId = crypto.randomUUID();
    setWorkspace(current => {
      const layout = splitTaskPane(current.layout, targetId, paneId, edge, splitId);
      // A missing target leaves the layout without the new pane, which must not be tracked either.
      if (current.panes.length >= TASK_PANE_LIMIT || !taskPaneIds(layout).includes(paneId)) return current;
      return { layout, panes: [...current.panes, { id: paneId, viewId }], activeId: paneId };
    });
    requestAnimationFrame(() => canvas.current?.querySelector<HTMLElement>(".task-pane.is-active .task-views__trigger")?.focus());
  };
  const targetAt = (event: PointerEvent): DropTarget | null => {
    const element = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-task-pane-id]");
    if (!element || !canvas.current?.contains(element) || !element.dataset.taskPaneId) return null;
    const bounds = element.getBoundingClientRect();
    return { paneId: element.dataset.taskPaneId, placement: taskPaneDropAt(event.clientX - bounds.left, event.clientY - bounds.top, bounds.width, bounds.height) };
  };
  const commitDrop = (source: DragSource, target: DropTarget) => {
    if (source.kind === "view") {
      if (target.placement === "center") changeView(target.paneId, source.viewId);
      else splitView(target.paneId, source.viewId, target.placement);
      if (target.placement === "center") activate(target.paneId);
      return;
    }
    if (source.paneId === target.paneId) return;
    const splitId = crypto.randomUUID();
    setWorkspace(current => {
      if (target.placement === "center") return { ...current, layout: swapTaskPanes(current.layout, source.paneId, target.paneId), activeId: source.paneId };
      const remaining = removeTaskPane(current.layout, source.paneId);
      return remaining ? { ...current, layout: splitTaskPane(remaining, target.paneId, source.paneId, target.placement, splitId), activeId: source.paneId } : current;
    });
  };
  const startViewDrag = (event: ReactPointerEvent<HTMLElement>, source: DragSource) => {
    if (event.button !== 0 || !event.isPrimary || session.current || modalPane) return;
    const cleanup = startPointerDrag(event, {
      onStart: () => {
        suppressClick.current = true;
        document.documentElement.classList.add("task-pane-drag-in-progress");
        setDrag({ source, target: null, x: event.clientX, y: event.clientY });
      },
      onMove: move => setDrag({ source, target: targetAt(move), x: move.clientX, y: move.clientY }),
      onEnd: (up, dragged) => {
        const target = dragged ? targetAt(up) : null;
        if (target) commitDrop(source, target);
        finishSession();
        suppressClick.current = dragged;
        window.setTimeout(() => { suppressClick.current = false; }, 0);
      },
      onCancel: () => { suppressClick.current = false; finishSession(); },
    });
    session.current = cleanup;
  };
  const startResize = (event: ReactPointerEvent<HTMLElement>, divider: (typeof measured.dividers)[number]) => {
    if (event.button !== 0 || !event.isPrimary || session.current || modalPane) return;
    event.preventDefault();
    const bounds = canvas.current?.getBoundingClientRect();
    if (!bounds) return;
    const horizontal = divider.axis === "horizontal";
    const available = (horizontal ? divider.parent.width : divider.parent.height) - TASK_PANE_DIVIDER;
    const origin = workspaceRef.current.layout;
    restoreResizeOrigin.current = () => setWorkspace(current => ({ ...current, layout: origin }));
    setResizing(true);
    session.current = startPointerDrag(event, {
      startImmediately: true,
      onStart: () => undefined,
      onMove: move => {
        const offset = horizontal ? move.clientX - bounds.left - divider.parent.left : move.clientY - bounds.top - divider.parent.top;
        const ratio = Math.max(divider.minRatio, Math.min(divider.maxRatio, offset / available));
        setWorkspace(current => ({ ...current, layout: resizeTaskSplit(current.layout, divider.id, ratio) }));
      },
      onEnd: () => finishSession(),
      onCancel: () => { restoreResizeOrigin.current?.(); finishSession(); },
    });
  };
  const onModalChange = useCallback((id: string, open: boolean) => setModalPane(current => open ? id : current === id ? null : current), []);
  const dropPane = drag?.target ? workspace.panes.find(pane => pane.id === drag.target?.paneId) : null;
  const dropRect = dropPane ? measured.panes.get(dropPane.id) : null;
  const sourceViewId = drag?.source.kind === "view" ? drag.source.viewId : workspace.panes.find(pane => drag?.source.kind === "pane" && pane.id === drag.source.paneId)?.viewId;
  const draggedView = saved.views.find(view => view.id === sourceViewId);
  const dragName = draggedView?.name ?? "view";
  const selfDrop = drag?.source.kind === "pane" && drag.source.paneId === drag.target?.paneId;

  return <section className="dash-section dash-section--tasks task-split-workspace" aria-label="Tasks workspace"
    onClickCapture={event => { if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); } }}>
    <div ref={viewport} className="task-split-viewport" inert={modalPane !== null}>
      <div ref={canvas} className="task-split-canvas" style={{ width, height }}>
        {/* Flat, keyed panes keep drafts and scroll positions when a split changes their neighbors. */}
        {workspace.panes.map(pane => <div key={pane.id} data-task-pane-id={pane.id} className="task-pane-slot" style={measured.panes.get(pane.id)}>
          <TaskPane paneId={pane.id} viewId={pane.viewId} loadVersion={pane.loadVersion ?? 0} onViewChange={id => changeView(pane.id, id)}
            sectionSidebar={sidebar} visible={visible} active={workspace.activeId === pane.id}
            onActivate={() => activate(pane.id)} onViewPointerDown={(event, viewId) => startViewDrag(event, { kind: "view", viewId })}
            onPanePointerDown={event => startViewDrag(event, { kind: "pane", paneId: pane.id })}
            onSplit={(viewId, edge) => splitView(pane.id, viewId, edge)} onClose={workspace.panes.length > 1 ? () => closePane(pane.id) : undefined}
            overlayHost={overlayHost} onModalChange={onModalChange} />
        </div>)}
        {measured.dividers.map(divider => <div key={divider.id} role="separator" tabIndex={0}
          aria-label="Resize task panes" aria-orientation={divider.axis === "horizontal" ? "vertical" : "horizontal"}
          aria-valuemin={Math.round(divider.minRatio * 100)} aria-valuemax={Math.round(divider.maxRatio * 100)} aria-valuenow={Math.round(divider.ratio * 100)}
          className={`task-pane-divider task-pane-divider--${divider.axis}`} style={divider.rect}
          onPointerDown={event => startResize(event, divider)} onDoubleClick={() => setWorkspace(current => ({ ...current, layout: resizeTaskSplit(current.layout, divider.id, 0.5) }))}
          onKeyDown={event => {
            const decrease = divider.axis === "horizontal" ? "ArrowLeft" : "ArrowUp";
            const increase = divider.axis === "horizontal" ? "ArrowRight" : "ArrowDown";
            if (event.key !== decrease && event.key !== increase && event.key !== "Home") return;
            event.preventDefault();
            const next = event.key === "Home" ? 0.5 : divider.ratio + (event.key === decrease ? -0.05 : 0.05);
            setWorkspace(current => ({ ...current, layout: resizeTaskSplit(current.layout, divider.id, Math.max(divider.minRatio, Math.min(divider.maxRatio, next))) }));
          }} />)}
        {drag?.target && dropRect && !selfDrop && <div className={`task-pane-drop task-pane-drop--${drag.target.placement}`}
          style={dropRect}><div>{drag.target.placement === "center" ? drag.source.kind === "pane" ? "Swap panes" : `Show ${dragName}` : `Open ${dragName} here`}</div></div>}
      </div>
    </div>
    {drag?.source.kind === "view" && draggedView && createPortal(
      <div className="task-view-drag-preview" aria-hidden="true" style={{ left: drag.x + 12, top: drag.y + 12 }}>
        <NestIcon name={draggedView.icon}/><span>{draggedView.name}</span>
      </div>,
      sectionSidebar?.closest(".dashboard") ?? viewport.current?.closest(".dashboard") ?? document.body,
    )}
    <div ref={setOverlayHost} className="task-workspace-overlays" />
    <span className="task-pane-announcement" role="status">{drag?.target && !selfDrop ? `Place ${dragName}: ${drag.target.placement}` : ""}</span>
  </section>;
}
