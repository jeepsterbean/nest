import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { emit } from "@tauri-apps/api/event";
import { pulseActivity } from "../lib/activityPulse";
import {
  createTask,
  getTimerState,
  latestPhaseCheckIn,
  listMetrics,
  listPhases,
  listPulses,
  listTasks,
  listTags,
  reorderTasks,
  startTimer,
  setTaskStatus,
  setTaskWorking,
  showDashboard,
  stopAllWorkingNow,
  submitNote,
  submitMetricCheckIn,
} from "../lib/commands";
import { subscribeTauriEvent } from "../lib/tauriListen";
import type {
  TimerState,
  Metric,
  MetricRatingInput,
  Phase,
  PhaseCheckIn,
  Pulse,
  Task,
  Tag,
} from "../lib/types";
import { phaseName, phaseTone } from "../dashboard/lib/period";
import { AmbientVisualizer } from "../dashboard/components/AmbientVisualizer";
import { useBackgroundStyle } from "../dashboard/hooks/useBackgroundStyle";
import { useBackgroundTuning } from "../dashboard/hooks/useBackgroundTuning";
import { useCurrentTime } from "../dashboard/hooks/useCurrentTime";
import { formatTime } from "../dashboard/lib/time";
import { useTileIcons } from "../dashboard/hooks/useTileIcons";
import type { TileIcons } from "../dashboard/lib/tileIcons";
import {
  groupTasksByStatus,
  pinnedIdOrder,
  recentlyClosedTasks,
} from "../dashboard/lib/tasks";
import { CARD_CONTROLS, useListSort } from "../dashboard/hooks/useListSort";
import {
  isNoteSubmitShortcut,
  trimNoteDraft,
  useNoteDraft,
  useRecentNoteHistory,
} from "../lib/noteDraft";
import { setContentEditableCaretToEnd } from "../lib/noteRichText";
import { readHiddenPulseIds } from "../lib/pulseVisibility";
import { isTaskLocked } from "../lib/taskLock";
import { WorkingToggle } from "../dashboard/task/TaskWorkingControl";
import { NestIcon } from "../dashboard/components/PulseIcon";
import { useComposerTagProps } from "../dashboard/components/NoteTags";
import { NoteHistoryControls } from "../dashboard/components/NoteHistoryControls";
import { MetricCheckIn } from "../dashboard/components/MetricCheckIn";
import { NoteSurface } from "../dashboard/components/NoteSurface";
import { shouldDismissOnPointerDown } from "./overlay";
import { PopupTimerBar } from "./PopupTimerBar";
import {
  appendTaskOnce,
  placeChildAfterParent,
  replaceTask,
} from "./taskReconciliation";
import { isPopupWindowDragTarget, startPopupWindowDrag } from "./windowDrag";
import "./PopupContent.css";
import "../dashboard/styles/shared-controls.css";

/** Stable identity so the composer's tag memo holds before tags load. */
const EMPTY_TAGS: Tag[] = [];

// Drop targets for a status group with no tasks in it. Negative so they can never
// collide with a task id.
const EMPTY_ACTIVE_ROW = -1;
const EMPTY_UP_NEXT_ROW = -2;

type LoadState = {
  metrics: Metric[];
  pulses: Pulse[];
  tasks: Task[];
  timer: TimerState;
  tags: Tag[];
  phases: Phase[];
  latestPhase: PhaseCheckIn | null;
};

function PlayIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="m7 5 7.5 5L7 15Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path
        d="M16.2 6.1 8.4 14 4 9.6"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.2"
      />
    </svg>
  );
}

function QueueIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path
        d="M6 6.5 10 10l4-3.5M6 11.5 10 15l4-3.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function RestoreIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path
        d="M7.5 5.5H3.5v4M4 9.2A6.2 6.2 0 1 0 5.6 6.1"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function CancelledMark() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path
        d="M6 6l8 8M14 6l-8 8"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function ExpandIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path
        d="M8 3H3v5m9-5h5v5M8 17H3v-5m9 5h5v-5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

export type PopupPanelId = "notes" | "now";

/** Sidebar order, which is also the left-to-right order of the panels. */
export const POPUP_PANELS = [
  { id: "notes", label: "Notes", shortcutKey: "1", tileIcon: "notes" },
  { id: "now", label: "Tasks and metrics", shortcutKey: "2", tileIcon: "tasks" },
] as const satisfies ReadonlyArray<{
  id: PopupPanelId;
  label: string;
  shortcutKey: string;
  tileIcon: keyof TileIcons;
}>;

const POPUP_PANELS_KEY = "nest:popup-panels";
const POPUP_TAB_KEY = "nest:popup-tab";

type PopupPanelStorage = Pick<Storage, "getItem" | "setItem">;

const readStored = (key: string, storage: PopupPanelStorage) => {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
};

/** Visible panels as last saved; missing or unavailable storage reads as null. */
export const readPopupPanels = (storage: PopupPanelStorage = localStorage) =>
  readStored(POPUP_PANELS_KEY, storage);

/** The superseded single-tab preference, read once so it can be migrated. */
export const readLastPopupTab = (storage: PopupPanelStorage = localStorage) =>
  readStored(POPUP_TAB_KEY, storage);

/** Persist the combination across summons. Showing nothing is a real choice. */
export function writePopupPanels(
  visible: readonly PopupPanelId[],
  storage: PopupPanelStorage = localStorage,
) {
  try {
    storage.setItem(POPUP_PANELS_KEY, visible.join(","));
  } catch {
    // Keep callers working when browser storage is unavailable.
  }
}

// Notes was the "dump" panel while it was called Brain dump.
const renamedPanelId = (id: string) => (id === "dump" ? "notes" : id);

const parsePopupPanels = (stored: string) => {
  const saved = new Set(stored.split(",").map(renamedPanelId));
  return POPUP_PANELS.filter((panel) => saved.has(panel.id)).map(
    (panel) => panel.id,
  );
};

/** Restore the saved combination, else migrate the tab it replaced. */
export function initialPopupPanels(
  stored: string | null,
  lastTab: string | null,
): PopupPanelId[] {
  if (stored !== null) {
    const saved = parsePopupPanels(stored);
    // An empty string is "every panel hidden"; other unreadable text is not.
    if (saved.length > 0 || stored.trim() === "") return saved;
    // The retired Chat assistant panel may be the only one saved.
    if (stored.split(",").includes("assistant")) return ["notes"];
  }
  if (lastTab === "overview") return POPUP_PANELS.map((panel) => panel.id);
  const lastPanel = lastTab === null ? null : renamedPanelId(lastTab);
  return [POPUP_PANELS.find((panel) => panel.id === lastPanel)?.id ?? "notes"];
}

/** Show or hide one panel, keeping the rest in sidebar order. */
export function togglePopupPanel(
  visible: readonly PopupPanelId[],
  id: PopupPanelId,
): PopupPanelId[] {
  if (visible.includes(id)) return visible.filter((panel) => panel !== id);
  return POPUP_PANELS.filter(
    (panel) => panel.id === id || visible.includes(panel.id),
  ).map((panel) => panel.id);
}

/** ⌘1 / ⌘2 toggle one panel; a held key repeats, which must not. */
export function popupPanelShortcut(
  event: Pick<
    KeyboardEvent,
    "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey" | "repeat" | "isComposing"
  >,
): PopupPanelId | null {
  if (
    event.isComposing ||
    event.repeat ||
    !event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    event.shiftKey
  ) {
    return null;
  }
  return POPUP_PANELS.find((panel) => panel.shortcutKey === event.key)?.id ?? null;
}

function PopupHeader({
  timer,
  nowMs,
  timerButtonRef,
  onSelectInterval,
  onOpenDashboard,
}: {
  timer: TimerState;
  nowMs: number;
  timerButtonRef: RefObject<HTMLButtonElement | null>;
  onSelectInterval: (minutes: number) => Promise<void>;
  onOpenDashboard: () => void;
}) {
  return (
    <header
      className="popup-header"
      onPointerDown={(event) => {
        if (event.button !== 0 || !isPopupWindowDragTarget(event.target)) {
          return;
        }
        startPopupWindowDrag();
      }}
    >
      <PopupTimerBar
        timer={timer}
        nowMs={nowMs}
        timerButtonRef={timerButtonRef}
        onSelectInterval={onSelectInterval}
      />
      <button
        type="button"
        className="popup-dashboard-link"
        aria-label="Open dashboard"
        title="Open dashboard"
        onClick={onOpenDashboard}
      >
        <ExpandIcon />
      </button>
    </header>
  );
}

/** Sidebar of independent panel toggles; several can be pressed at once. */
export function PopupPanelToggles({
  visible,
  icons,
  toggleRefs,
  onToggle,
}: {
  visible: readonly PopupPanelId[];
  icons: TileIcons;
  toggleRefs: Record<PopupPanelId, RefObject<HTMLButtonElement | null>>;
  onToggle: (id: PopupPanelId) => void;
}) {
  return (
    <nav className="popup-tabs" aria-label="Popup panels">
      {POPUP_PANELS.map(({ id, label, shortcutKey, tileIcon }) => (
        <button
          key={id}
          ref={toggleRefs[id]}
          type="button"
          className="popup-tabs__tab"
          aria-label={label}
          aria-pressed={visible.includes(id)}
          aria-keyshortcuts={`Meta+${shortcutKey}`}
          title={`${label} (⌘${shortcutKey})`}
          onClick={() => onToggle(id)}
        >
          <NestIcon name={icons[tileIcon]} />
        </button>
      ))}
    </nav>
  );
}

/**
 * Owns the note draft so a keystroke re-renders only this section.
 * Held by the popup shell it used to live in, every character re-rendered the
 * task board, pulse buttons and timer as well.
 */
function PopupNote({
  tags,
  editorRef,
  busy,
  onBusyChange,
  onError,
}: {
  tags: Tag[];
  editorRef: RefObject<HTMLElement | null>;
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
  onError: (error: string | null) => void;
}) {
  const [draft, setDraft] = useNoteDraft();
  const nowMs = useCurrentTime();
  const draftRevision = `${draft.text}\n${draft.tagIds.join(",")}`;
  const history = useRecentNoteHistory(draft.text, onError, draftRevision);
  const tagProps = useComposerTagProps(tags, draft.tagIds, history.viewingNote);
  const handleTagsChange = useCallback(
    (tagIds: number[]) => setDraft((current) => ({ ...current, tagIds })),
    [setDraft],
  );

  const submitDraft = async () => {
    if (busy || !trimNoteDraft(draft)) return;
    onBusyChange(true);
    onError(null);
    try {
      await submitNote(draft.text, draft.tagIds);
      setDraft({ text: "", tagIds: [] });
      await history.refresh();
      await emit("data-changed");
    } catch (e) {
      onError(String(e));
    } finally {
      onBusyChange(false);
    }
  };

  return (
    <NoteSurface
      className="note-surface--popup"
      text={history.text}
      tagIds={tagProps.selectedIds}
      tags={tagProps.tags}
      readOnly={history.viewingHistory}
      tagsDisabled={history.viewingHistory}
      headerStart={
        <time
          className="note-history-controls__submitted"
          dateTime={new Date(nowMs).toISOString()}
          aria-label="Current time"
        >
          {formatTime(Math.floor(nowMs / 1000))}
        </time>
      }
      textareaLabel={
        history.viewingHistory ? "Saved note, read only" : "Notes"
      }
      headerEnd={
        <NoteHistoryControls
          canViewPrevious={history.canViewPrevious}
          canViewNext={history.canViewNext}
          onPrevious={history.showPrevious}
          onNext={history.showNext}
          submittedAt={history.viewingNote?.createdAt}
        />
      }
      onTextChange={(text) => setDraft((current) => ({ ...current, text }))}
      onTagsChange={handleTagsChange}
      dismissPopupsOnOutsideInteraction
      onKeyDown={(event) => {
        if (
          !history.viewingHistory &&
          isNoteSubmitShortcut({
            key: event.key,
            metaKey: event.metaKey,
            ctrlKey: event.ctrlKey,
            isComposing: event.nativeEvent.isComposing,
          })
        ) {
          event.preventDefault();
          void submitDraft();
        }
      }}
      editorRef={editorRef}
    />
  );
}

function PopupContent({
  onDismiss,
  onComplete,
}: {
  onDismiss: () => Promise<void>;
  onComplete: (save: () => Promise<void>) => Promise<void>;
}) {
  const [loaded, setLoaded] = useState<LoadState | null>(null);
  const backgroundStyle = useBackgroundStyle();
  const backgroundTuning = useBackgroundTuning();
  const [taskTitle, setTaskTitle] = useState("");
  const [addingTask, setAddingTask] = useState(false);
  const [childParentId, setChildParentId] = useState<number | null>(null);
  const [childTitle, setChildTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  // Per-summon remount: the combination comes from the saved preference, the
  // same for a manual summon and a Timer-triggered one.
  const [visiblePanels, setVisiblePanels] = useState<PopupPanelId[]>(() =>
    initialPopupPanels(readPopupPanels(), readLastPopupTab()),
  );
  // A fresh object per show, so re-showing the same panel focuses it again.
  const [panelToFocus, setPanelToFocus] = useState<{ id: PopupPanelId } | null>(
    () => (visiblePanels[0] ? { id: visiblePanels[0] } : null),
  );
  const icons = useTileIcons();
  const taskInputRef = useRef<HTMLInputElement | null>(null);
  const noteRef = useRef<HTMLElement | null>(null);
  const panelRefs: Record<PopupPanelId, RefObject<HTMLElement | null>> = {
    notes: useRef<HTMLElement | null>(null),
    now: useRef<HTMLElement | null>(null),
  };
  const toggleRefs: Record<PopupPanelId, RefObject<HTMLButtonElement | null>> = {
    notes: useRef<HTMLButtonElement | null>(null),
    now: useRef<HTMLButtonElement | null>(null),
  };
  const selectedPulseButtonRef = useRef<HTMLButtonElement | null>(null);
  const timerButtonRef = useRef<HTMLButtonElement | null>(null);
  const taskListRef = useRef<HTMLDivElement | null>(null);
  const taskScrollThumbRef = useRef<HTMLDivElement | null>(null);
  const liveTasksRef = useRef<HTMLDivElement | null>(null);
  const stickToLiveRef = useRef(true);
  const actionInProgressRef = useRef(false);
  const refreshHeldRef = useRef(false);
  const refreshRequest = useRef(0);

  useEffect(() => {
    const togglePanelFromKeyboard = (event: KeyboardEvent) => {
      const panel = popupPanelShortcut(event);
      if (!panel) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      togglePanel(panel);
    };
    // Capture phase, so a control that swallows its own keydown (the editor,
    // the task composer) cannot eat a panel shortcut.
    window.addEventListener("keydown", togglePanelFromKeyboard, true);
    return () =>
      window.removeEventListener("keydown", togglePanelFromKeyboard, true);
  }, [visiblePanels]);

  const togglePanel = (id: PopupPanelId) => {
    const showing = !visiblePanels.includes(id);
    // Hiding the panel holding focus would strand it on a display:none node;
    // hiding any other panel leaves focus where it is.
    if (!showing && panelRefs[id].current?.contains(document.activeElement)) {
      toggleRefs[id].current?.focus();
    }
    const next = togglePopupPanel(visiblePanels, id);
    setVisiblePanels(next);
    writePopupPanels(next);
    setPanelToFocus(showing ? { id } : null);
  };

  const isLoaded = loaded !== null;
  const hiddenPulseIds = readHiddenPulseIds();
  const visiblePulses =
    loaded?.pulses.filter((pulse) => !hiddenPulseIds.has(pulse.id)) ?? [];
  const tasksByStatus = groupTasksByStatus(loaded?.tasks ?? []);
  const activeTasks = tasksByStatus.active;
  const upNextTasks = tasksByStatus.up_next;
  // Working tasks lead the popup as hero rows; everything else recedes into
  // the plain status groups below, so the popup answers "what am I doing" at a
  // glance instead of making that item look like every other row.
  const workingTasks = activeTasks.filter((task) => task.workingNow);
  const notWorkingActiveTasks = activeTasks.filter((task) => !task.workingNow);
  // Nobody's working: nudge the row that would start one, active first.
  const nudgeTaskId =
    workingTasks.length === 0
      ? ((notWorkingActiveTasks[0] ?? upNextTasks[0])?.id ?? null)
      : null;
  const recentClosed = recentlyClosedTasks(loaded?.tasks ?? [], nowMs);
  const recentClosedKey = recentClosed.map((task) => task.id).join(",");
  // One drag list spanning both status groups: dropping on a row of the
  // other is what moves a task between Active and Up next. An empty group
  // still offers its placeholder as a drop target.
  // Hero rows (working tasks) aren't a drag source or target, so once the
  // other active rows run out, Active still needs a rendered placeholder id —
  // otherwise nothing in the DOM carries EMPTY_ACTIVE_ROW to drop onto.
  const activeGroupIds = notWorkingActiveTasks.length
    ? activeTasks.map((task) => task.id)
    : [...workingTasks.map((task) => task.id), EMPTY_ACTIVE_ROW];
  const boardRowIds = [
    ...activeGroupIds,
    ...(upNextTasks.length
      ? upNextTasks.map((task) => task.id)
      : [EMPTY_UP_NEXT_ROW]),
  ];
  const boardSort = useListSort(
    "popup-task",
    boardRowIds,
    (ids, draggedId, targetId) => void dropTask(ids, draggedId, targetId),
    CARD_CONTROLS,
  );

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      listMetrics(),
      listPulses(),
      listTasks(),
      getTimerState(),
      listTags(),
      listPhases(true),
      latestPhaseCheckIn(),
    ])
      .then(
        ([
          metrics,
          pulses,
          tasks,
          timer,
          tags,
          phases,
          latestPhase,
        ]) => {
          if (cancelled) return;
          setLoaded({
            metrics,
            pulses,
            tasks,
            timer,
            tags,
            phases,
            latestPhase,
          });
          setError(null);
        },
      )
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Every task command announces its own change, and popup actions chain
   * several commands. Refreshing between them would paint the half-finished
   * order or status, so a refresh waits until the action ends, and a snapshot
   * read before or during an action is never applied over its result.
   */
  const refreshLive = useCallback(() => {
    if (actionInProgressRef.current) {
      refreshHeldRef.current = true;
      return;
    }
    refreshHeldRef.current = false;
    const request = ++refreshRequest.current;
    void Promise.all([
      listTasks(),
      getTimerState(),
      listTags(),
      latestPhaseCheckIn(),
    ]).then(([tasks, timer, tags, latestPhase]) => {
      if (request !== refreshRequest.current) return;
      if (actionInProgressRef.current) {
        refreshHeldRef.current = true;
        return;
      }
      setLoaded((current) =>
        current
          ? { ...current, tasks, timer, tags, latestPhase }
          : current,
      );
    });
  }, []);

  useEffect(() => {
    actionInProgressRef.current = submitting;
    if (!submitting && refreshHeldRef.current) refreshLive();
  }, [submitting, refreshLive]);

  useEffect(() => {
    const stops = ["phase-changed", "data-changed"].map((event) =>
      subscribeTauriEvent(event, refreshLive),
    );
    return () => stops.forEach((stop) => stop());
  }, [refreshLive]);

  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!isLoaded || !panelToFocus) return;
    let cancelled = false;
    let frames = 0;
    const focusShownPanel = () => {
      if (cancelled) return;
      if (panelToFocus.id === "now") {
        // Focus inside the Metrics panel is what routes the 1–5 shortcuts.
        (selectedPulseButtonRef.current ?? timerButtonRef.current)?.focus();
        return;
      }
      const note = noteRef.current;
      if (!note) {
        // TipTap mounts a frame later (`immediatelyRender: false`), so Notes
        // retries until the editor DOM exists.
        if (frames++ < 30) requestAnimationFrame(focusShownPanel);
        return;
      }
      note.focus();
      setContentEditableCaretToEnd(note);
    };
    requestAnimationFrame(focusShownPanel);
    return () => {
      cancelled = true;
    };
  }, [isLoaded, panelToFocus]);

  const syncTaskListThumb = () => {
    const list = taskListRef.current;
    const thumb = taskScrollThumbRef.current;
    if (!list || !thumb) return;
    const { scrollTop, scrollHeight, clientHeight } = list;
    const overflow = scrollHeight - clientHeight;
    if (overflow <= 1) {
      thumb.style.opacity = "0";
      return;
    }
    const size = Math.max(20, (clientHeight * clientHeight) / scrollHeight);
    thumb.style.opacity = "1";
    thumb.style.height = `${size}px`;
    thumb.style.transform = `translateY(${(scrollTop / overflow) * (clientHeight - size)}px)`;
  };

  useLayoutEffect(() => {
    if (stickToLiveRef.current) {
      const list = taskListRef.current;
      const live = liveTasksRef.current;
      if (list && live) list.scrollTop = live.offsetTop;
    }
    syncTaskListThumb();
  }, [isLoaded, recentClosedKey, loaded?.tasks]);

  useEffect(() => {
    const list = taskListRef.current;
    if (!list) return;
    const observer = new ResizeObserver(() => syncTaskListThumb());
    observer.observe(list);
    return () => observer.disconnect();
  }, [isLoaded]);

  const openDashboard = async () => {
    await showDashboard();
    await onDismiss();
  };

  const applyTimer = async (minutes: number) => {
    setError(null);
    try {
      const timer = await startTimer(minutes);
      setLoaded((current) => (current ? { ...current, timer } : current));
      setNowMs(Date.now());
    } catch (e) {
      setError(String(e));
      throw e;
    }
    try {
      await emit("data-changed");
    } catch (e) {
      setError(String(e));
    }
  };

  const updateTaskStatus = async (
    task: Task,
    status: "active" | "up_next" | "completed",
  ) => {
    if (!loaded || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const updated = await setTaskStatus(task, status);
      setLoaded((current) =>
        current
          ? { ...current, tasks: replaceTask(current.tasks, updated) }
          : current,
      );
      if (status === "completed") pulseActivity();
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const updateTaskWorking = async (task: Task, working: boolean) => {
    if (!loaded || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const updated = await setTaskWorking(task.id, working);
      setLoaded((current) =>
        current
          ? { ...current, tasks: replaceTask(current.tasks, updated) }
          : current,
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  /** Up next's play button is one move: into Active, already working. */
  const startUpNextTask = async (task: Task) => {
    if (!loaded || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await setTaskStatus(task, "active");
      const updated = await setTaskWorking(task.id, true);
      setLoaded((current) =>
        current
          ? {
              ...current,
              tasks: current.tasks.map((candidate) =>
                candidate.id === task.id ? updated : candidate,
              ),
            }
          : current,
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const dropTask = async (
    ids: number[],
    draggedId: number,
    targetId: number,
  ) => {
    if (!loaded || submitting) return;
    const dragged = loaded.tasks.find((task) => task.id === draggedId);
    if (!dragged) return;
    const targetStatus =
      targetId === EMPTY_ACTIVE_ROW
        ? "active"
        : targetId === EMPTY_UP_NEXT_ROW
          ? "up_next"
          : (loaded.tasks.find((task) => task.id === targetId)?.status ??
            dragged.status);
    setSubmitting(true);
    setError(null);
    try {
      // Pin against the moved task, never the pre-drop snapshot: leaving
      // Active clears working now, and a stale pin would hoist the task to
      // the top of the order it just left.
      const moved =
        targetStatus === dragged.status
          ? null
          : await setTaskStatus(dragged, targetStatus);
      await reorderTasks(
        pinnedIdOrder(
          ids,
          moved
            ? loaded.tasks.map((task) => (task.id === moved.id ? moved : task))
            : loaded.tasks,
        ),
      );
      const tasks = await listTasks();
      setLoaded((current) =>
        current ? { ...current, tasks } : current,
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const restAllWorking = async () => {
    if (!loaded || submitting) return;
    if (!loaded.tasks.some((task) => task.workingNow)) return;
    setSubmitting(true);
    setError(null);
    try {
      const updates = await stopAllWorkingNow();
      const byId = new Map(updates.map((task) => [task.id, task]));
      setLoaded((current) =>
        current
          ? {
              ...current,
              tasks: current.tasks.map((task) => byId.get(task.id) ?? task),
            }
          : current,
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const addTask = async (start = false) => {
    const title = taskTitle.trim();
    if (!loaded || submitting || !title) return;
    setSubmitting(true);
    setError(null);
    try {
      let task = await createTask(title, "", "active");
      // Reconcile as soon as create commits so a later start/stretch failure
      // cannot hide the row and leave a retryable draft (duplicate tasks).
      setLoaded((current) =>
        current
          ? { ...current, tasks: appendTaskOnce(current.tasks, task) }
          : current,
      );
      setTaskTitle("");
      setAddingTask(false);

      if (start) {
        try {
          task = await setTaskWorking(task.id, true);
          setLoaded((current) =>
            current
              ? {
                  ...current,
                  tasks: current.tasks.map((item) =>
                    item.id === task.id ? task : item,
                  ),
                }
              : current,
          );
        } catch (e) {
          setError(String(e));
        }
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const openChildComposer = (parent: Task) => {
    if (submitting) return;
    setChildParentId(parent.id);
    setChildTitle("");
  };

  const closeChildComposer = () => {
    setChildParentId(null);
    setChildTitle("");
  };

  /**
   * A child shares only its Parent's status at creation; Worked time and later
   * status changes stay independent. ⌘↵ starts it only under an Active Parent,
   * because Working now needs Active and promoting the child would break the
   * same-status rule.
   */
  const addChildTask = async (parent: Task, start: boolean) => {
    const title = childTitle.trim();
    if (!loaded || submitting || !title) return;
    setSubmitting(true);
    setError(null);
    try {
      let child = await createTask(
        title,
        "",
        parent.status,
        [parent.id],
      );
      // Status groups render in array order, so splicing after the Parent shows the
      // child directly below it before the order is persisted.
      setLoaded((current) =>
        current
          ? {
              ...current,
              tasks: placeChildAfterParent(current.tasks, parent.id, child),
            }
          : current,
      );
      closeChildComposer();

      // Done orders by close time, so only Active and Up next keep a manual order.
      if (parent.status === "active" || parent.status === "up_next") {
        const tasks = placeChildAfterParent(await listTasks(), parent.id, child);
        await reorderTasks(
          groupTasksByStatus(tasks)[parent.status].map((task) => task.id),
        );
      }

      if (start && parent.status === "active") {
        child = await setTaskWorking(child.id, true);
        setLoaded((current) =>
          current
            ? {
                ...current,
                tasks: current.tasks.map((task) =>
                  task.id === child.id ? child : task,
                ),
              }
            : current,
        );
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const saveMetrics = async (
    pulse: Pulse,
    ratingsInput: MetricRatingInput[],
  ) => {
    if (ratingsInput.length === 0) return;
    await submitMetricCheckIn(pulse.id, ratingsInput);
    pulseActivity();
    await emit("data-changed");
  };

  const completePopup = async (
    pulse: Pulse,
    ratingsInput: MetricRatingInput[],
  ) => {
    if (!loaded || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onComplete(async () => {
        await saveMetrics(pulse, ratingsInput);
      });
    } catch (e) {
      setError(String(e));
      setSubmitting(false);
      throw e;
    }
  };

  if (!loaded) {
    return (
      <div className="popup-workspace popup-workspace--loading">
        {error ? (
          <div className="popup-workspace__error" role="alert">
            {error}
          </div>
        ) : (
          "Loading..."
        )}
      </div>
    );
  }

  const currentPhaseName = loaded.latestPhase
    ? phaseName(
        loaded.latestPhase.phaseId,
        loaded.phases,
        loaded.latestPhase.phaseLabel,
      )
    : null;
  const isDoing = currentPhaseName
    ? phaseTone(currentPhaseName) === "doing"
    : false;

  const workingCount = workingTasks.length;
  const childComposerProps = (parent: Task) => ({
    onDoubleClick: (event: { target: EventTarget }) => {
      if ((event.target as Element).closest(CARD_CONTROLS)) return;
      openChildComposer(parent);
    },
  });
  const renderChildComposer = (parent: Task) =>
    childParentId === parent.id && (
      <div className="now-task__child-composer">
        <input
          autoFocus
          tabIndex={-1}
          aria-label={`New child of ${parent.title}`}
          autoComplete="off"
          disabled={submitting}
          placeholder="Name the subtask…"
          value={childTitle}
          onChange={(event) => setChildTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void addChildTask(parent, event.metaKey || event.ctrlKey);
            } else if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              closeChildComposer();
            }
          }}
        />
      </div>
    );
  // Working tasks lead as hero rows: the one thing the popup wants you to
  // see first, so it reads at a glance instead of blending into the list.
  const renderHeroRow = (task: Task) => (
    <li className="now-hero" key={task.id} {...childComposerProps(task)}>
      <div className="now-hero__lead">
        <WorkingToggle
          task={task}
          playPause
          nowMs={nowMs}
          tabIndex={-1}
          disabled={submitting}
          onToggle={(working) => updateTaskWorking(task, working)}
        />
      </div>
      <div className="now-hero__body">
        <span className="now-hero__title">{task.title}</span>
      </div>
      <div className="now-task__actions">
        <button
          type="button"
          tabIndex={-1}
          aria-label={`Move ${task.title} to Up next`}
          title="Up next"
          onClick={() => updateTaskStatus(task, "up_next")}
          disabled={submitting}
        >
          <QueueIcon />
        </button>
        <button
          type="button"
          tabIndex={-1}
          aria-label={`Complete ${task.title}`}
          title="Complete"
          onClick={() => updateTaskStatus(task, "completed")}
          disabled={submitting}
        >
          <CheckIcon />
        </button>
      </div>
      {renderChildComposer(task)}
    </li>
  );
  // Rows outside the hero list share one layout: lead play control, title, trailing status
  // actions. Closed history is a quieter restore row, not in the drag list.
  const renderTaskRow = (task: Task) => (
    <li
      className={`now-task${
        task.id === nudgeTaskId ? " now-task--nudge" : ""
      }${boardSort.draggingId === task.id ? " is-dragging" : ""}${
        boardSort.overId === task.id ? " is-drop-target" : ""
      }`}
      key={task.id}
      {...boardSort.rowProps(task.id)}
      {...childComposerProps(task)}
    >
      <div className="now-task__actions now-task__lead">
        {task.status === "active" ? (
          <WorkingToggle
            task={task}
            playPause
            nowMs={nowMs}
            tabIndex={-1}
            disabled={submitting}
            onToggle={(working) => updateTaskWorking(task, working)}
          />
        ) : (
          <button
            type="button"
            tabIndex={-1}
            className="working-toggle working-toggle--play-pause"
            aria-label={`Start working on ${task.title}`}
            title="Move to Active and start working"
            disabled={submitting}
            onClick={() => void startUpNextTask(task)}
          >
            <PlayIcon />
          </button>
        )}
      </div>
      <span className="now-task__title">{task.title}</span>
      <div className="now-task__actions">
        {task.status === "active" && (
          <button
            type="button"
            tabIndex={-1}
            aria-label={`Move ${task.title} to Up next`}
            title="Up next"
            onClick={() => updateTaskStatus(task, "up_next")}
            disabled={submitting}
          >
            <QueueIcon />
          </button>
        )}
        <button
          type="button"
          tabIndex={-1}
          aria-label={`Complete ${task.title}`}
          title="Complete"
          onClick={() => updateTaskStatus(task, "completed")}
          disabled={submitting}
        >
          <CheckIcon />
        </button>
      </div>
      {renderChildComposer(task)}
    </li>
  );
  const renderClosedRow = (task: Task) => (
    <li
      className={`now-task now-task--${task.status}`}
      key={task.id}
      {...childComposerProps(task)}
    >
      <div className="now-task__mark now-task__lead" aria-hidden="true">
        {task.status === "completed" ? <CheckIcon /> : <CancelledMark />}
      </div>
      <span className="now-task__title">{task.title}</span>
      <div className="now-task__actions">
        {/* The last hour reaches back across midnight, where a Done row can
            already be locked. */}
        {!isTaskLocked(task, nowMs) && (
          <button
            type="button"
            tabIndex={-1}
            aria-label={`Return ${task.title} to Active`}
            title="Return to Active"
            onClick={() => updateTaskStatus(task, "active")}
            disabled={submitting}
          >
            <RestoreIcon />
          </button>
        )}
      </div>
      {renderChildComposer(task)}
    </li>
  );
  const taskView = (
    <section className="now-card" aria-label="Tasks">
      {workingTasks.length > 0 && (
        <ul className="now-hero-list">{workingTasks.map(renderHeroRow)}</ul>
      )}
      <div className="now-card__scroller">
        <div
          className="now-card__tasks"
          ref={taskListRef}
          onScroll={() => {
            const list = taskListRef.current;
            const live = liveTasksRef.current;
            if (list && live) {
              stickToLiveRef.current = list.scrollTop >= live.offsetTop - 2;
            }
            syncTaskListThumb();
          }}
        >
          {recentClosed.length > 0 && (
            <section
              className="now-group now-group--closed"
              aria-labelledby="popup-done-tasks"
            >
              <header className="now-group__head">
                <h2 id="popup-done-tasks">Done</h2>
                <span>{recentClosed.length}</span>
              </header>
              <ul className="now-list">{recentClosed.map(renderClosedRow)}</ul>
            </section>
          )}
          <div className="now-card__live" ref={liveTasksRef}>
            <section className="now-group" aria-labelledby="popup-active-tasks">
              <header className="now-group__head">
                <h2 id="popup-active-tasks">Active</h2>
                <span>{activeTasks.length}</span>
                {workingCount > 0 && (
                  <button
                    type="button"
                    tabIndex={-1}
                    className="now-group__rest"
                    aria-label={`Rest — stop ${workingCount} working ${workingCount === 1 ? "task" : "tasks"}`}
                    title="Rest — stop all working tasks"
                    disabled={submitting}
                    onClick={() => void restAllWorking()}
                  >
                    <NestIcon name="moon" />
                  </button>
                )}
                <button
                  type="button"
                  tabIndex={-1}
                  className="now-group__add"
                  aria-label="Add active task"
                  aria-expanded={addingTask}
                  title="Add active task"
                  onClick={() => {
                    setAddingTask((open) => !open);
                    if (!addingTask) {
                      requestAnimationFrame(() =>
                        taskInputRef.current?.focus(),
                      );
                    }
                  }}
                >
                  +
                </button>
              </header>
              {addingTask && (
                <div className="now-task now-task--composer">
                  <input
                    ref={taskInputRef}
                    tabIndex={-1}
                    aria-label="New active task"
                    autoComplete="off"
                    disabled={submitting}
                    placeholder="Add an active task…"
                    value={taskTitle}
                    onChange={(event) => setTaskTitle(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void addTask(event.metaKey || event.ctrlKey);
                      } else if (event.key === "Escape") {
                        event.preventDefault();
                        event.stopPropagation();
                        setAddingTask(false);
                      }
                    }}
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label="Create task"
                    title="Create task"
                    disabled={submitting || !taskTitle.trim()}
                    onClick={() => void addTask()}
                  >
                    +
                  </button>
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label="Create and start task"
                    title="Create and start (⌘↵)"
                    disabled={submitting || !taskTitle.trim()}
                    onClick={() => void addTask(true)}
                  >
                    <PlayIcon />
                  </button>
                </div>
              )}
              {notWorkingActiveTasks.length === 0 ? (
                <p
                  className={`now-card__empty${
                    boardSort.overId === EMPTY_ACTIVE_ROW
                      ? " is-drop-target"
                      : ""
                  }`}
                  {...boardSort.rowProps(EMPTY_ACTIVE_ROW)}
                >
                  {workingTasks.length > 0
                    ? "Nothing else active right now."
                    : "Nothing active right now."}
                </p>
              ) : (
                <ul className="now-list">
                  {notWorkingActiveTasks.map(renderTaskRow)}
                </ul>
              )}
            </section>
            <section
              className="now-group now-group--up-next"
              aria-labelledby="popup-up-next-tasks"
            >
              <header className="now-group__head">
                <h2 id="popup-up-next-tasks">Up next</h2>
                <span>{upNextTasks.length}</span>
              </header>
              {upNextTasks.length === 0 ? (
                <p
                  className={`now-card__empty${
                    boardSort.overId === EMPTY_UP_NEXT_ROW
                      ? " is-drop-target"
                      : ""
                  }`}
                  {...boardSort.rowProps(EMPTY_UP_NEXT_ROW)}
                >
                  Nothing queued up next.
                </p>
              ) : (
                <ul className="now-list">{upNextTasks.map(renderTaskRow)}</ul>
              )}
            </section>
          </div>
        </div>
        <div
          className="now-card__scroll-thumb"
          ref={taskScrollThumbRef}
          aria-hidden="true"
        />
      </div>
    </section>
  );

  return (
    <div
      className="popup-workspace"
      // Toggle strip, then one equal column per visible panel. `repeat(0, …)`
      // is invalid CSS, so the strip stands alone when nothing is showing.
      style={{
        gridTemplateColumns: visiblePanels.length
          ? `48px repeat(${visiblePanels.length}, minmax(0, 1fr))`
          : "48px",
      }}
      onPointerDownCapture={(event) => {
        if (
          shouldDismissOnPointerDown(
            addingTask,
            event.target,
            ".now-task--composer, .now-group__add",
          )
        ) {
          setAddingTask(false);
        }
        if (
          shouldDismissOnPointerDown(
            childParentId !== null,
            event.target,
            ".now-task__child-composer",
          )
        ) {
          closeChildComposer();
        }
      }}
    >
      <PopupHeader
        timer={loaded.timer}
        nowMs={nowMs}
        timerButtonRef={timerButtonRef}
        onSelectInterval={applyTimer}
        onOpenDashboard={() => void openDashboard()}
      />

      <PopupPanelToggles
        visible={visiblePanels}
        icons={icons}
        toggleRefs={toggleRefs}
        onToggle={togglePanel}
      />

      {/* Tasks and Notes stay mounted so their drafts survive hiding. */}
      <section
        ref={panelRefs.notes}
        className="popup-pane popup-note"
        aria-label="Notes"
        hidden={!visiblePanels.includes("notes")}
      >
        <PopupNote
          tags={loaded?.tags ?? EMPTY_TAGS}
          editorRef={noteRef}
          busy={submitting}
          onBusyChange={setSubmitting}
          onError={setError}
        />
      </section>

      <main
        ref={panelRefs.now}
        className="popup-pane popup-tasks"
        hidden={!visiblePanels.includes("now")}
      >
        <AmbientVisualizer
          active={isDoing}
          style={backgroundStyle}
          tuning={backgroundTuning}
        />
        <MetricCheckIn
          metrics={loaded.metrics}
          pulses={visiblePulses}
          submitting={submitting}
          emptyCopy={
            loaded.pulses.length
              ? "No pulses are shown in the popup. Turn one on in Metrics."
              : "Create a pulse in the Metrics dashboard."
          }
          onComplete={completePopup}
          selectedPulseButtonRef={selectedPulseButtonRef}
        />

        {taskView}
      </main>

      {error && (
        <div className="popup-workspace__error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}

export default PopupContent;
