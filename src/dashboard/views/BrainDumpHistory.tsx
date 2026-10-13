import { useMemo, useState, type KeyboardEvent, type MouseEvent } from "react";
import { updateBrainDumpTags } from "../../lib/commands";
import type { BrainDump } from "../../lib/types";
import { trimBrainDumpDraft } from "../../lib/brainDumpDraft";
import { BrainDumpTags } from "../components/BrainDumpTags";
import { BrainDumpFilters } from "../components/BrainDumpFilters";
import { BrainDumpSurface } from "../components/BrainDumpSurface";
import { floatingDraftIcon } from "../components/icons";
import {
  SavedBrainDump,
  SavedBrainDumpPopover,
  type SavedBrainDumpPosition,
} from "../components/SavedBrainDump";
import { useDashboardData } from "../context/DashboardDataContext";
import { useFloatingBrainDumpsContext } from "../context/FloatingBrainDumpsContext";
import { filterBrainDumpHistory } from "../lib/brainDumpHistory";
import { dayLabel, formatTime, startOfDayMs } from "../lib/time";
import { selectedDayMs as resolveSelectedDayMs, singleDayPicker, stepSelectedDay } from "../lib/dateNavigation";
import { useBrainDumpComposer } from "../hooks/useBrainDumpComposer";
import { useCurrentTime } from "../hooks/useCurrentTime";
import { useBrainDumpsForDay } from "../hooks/useBrainDumpsForDay";

function PeelToStickyButton({
  className,
  disabled = false,
  onClick,
}: {
  className?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={className}
      aria-label="Make brain dump a floating draft"
      title="Make floating draft"
      disabled={disabled}
      onClick={onClick}
    >
      {floatingDraftIcon}
    </button>
  );
}

function BrainDumpTodayComposer() {
  const { tags } = useDashboardData();
  const composer = useBrainDumpComposer();
  const nowMs = useCurrentTime();
  const nowSec = Math.floor(nowMs / 1000);

  return (
    <div className="brain-dump-history__item brain-dump-history__item--composer">
      <BrainDumpSurface
        layout="panel"
        className="brain-dump-surface--anchored"
        text={composer.draft.text}
        tagIds={composer.draft.tagIds}
        tags={tags}
        textareaLabel="Brain dump"
        headerStart={
          <time
            className="brain-dump-history-controls__submitted"
            dateTime={new Date(nowMs).toISOString()}
            aria-label="Current time"
          >
            {formatTime(nowSec)}
          </time>
        }
        headerEnd={
          <div className="brain-dump-history-controls">
            <PeelToStickyButton
              disabled={!trimBrainDumpDraft(composer.draft)}
              onClick={composer.peelToFloating}
            />
          </div>
        }
        onTextChange={composer.setText}
        onTagsChange={composer.setTagIds}
        dismissPopupsOnOutsideInteraction
        onKeyDown={(event) => composer.handleShortcutKeyDown(event)}
      />
    </div>
  );
}

export function BrainDumpHistory({ sectionSidebar, visible }: {
  sectionSidebar: HTMLElement | null;
  visible: boolean;
}) {
  const { tags, mutate } = useDashboardData();
  const { forkToFloating } = useFloatingBrainDumpsContext();
  const [anchorMs, setAnchorMs] = useState<number | null>(null);
  const [tagId, setTagId] = useState("");
  const [openedDump, setOpenedDump] = useState<{
    dump: BrainDump;
    position: SavedBrainDumpPosition;
  } | null>(null);
  const nowMs = useCurrentTime();
  const selectedDayMs = resolveSelectedDayMs(anchorMs, nowMs);
  const todayMs = startOfDayMs(nowMs / 1000);
  const isToday = selectedDayMs === todayMs;
  const { dumps: brainDumps, loaded } = useBrainDumpsForDay(selectedDayMs, nowMs);
  const dayDumps = useMemo(
    () => filterBrainDumpHistory(brainDumps, selectedDayMs, ""),
    [brainDumps, selectedDayMs],
  );
  const dumps = useMemo(
    () => filterBrainDumpHistory(dayDumps, selectedDayMs, tagId),
    [dayDumps, selectedDayMs, tagId],
  );
  const selectedLabel = dayLabel(selectedDayMs / 1000, nowMs);
  const showGrid = isToday || dumps.length > 0;
  const showEmpty = dumps.length === 0 && (!isToday || Boolean(tagId) || !loaded);

  const openDump = (dump: BrainDump, event: MouseEvent<HTMLElement>) => {
    setOpenedDump({ dump, position: { x: event.clientX, y: event.clientY } });
  };

  const openDumpFromKeyboard = (dump: BrainDump, event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    setOpenedDump({ dump, position: { x: rect.right, y: rect.top + rect.height / 2 } });
  };

  return (
    <div className="brain-dump-history">
      <BrainDumpFilters
        sectionSidebar={sectionSidebar}
        visible={visible}
        brainDumps={dayDumps}
        loaded={loaded}
        dayLabel={selectedLabel}
        onPreviousDay={() => setAnchorMs((current) => stepSelectedDay(current, -1, nowMs))}
        onNextDay={() => setAnchorMs((current) => stepSelectedDay(current, 1, nowMs))}
        canGoNext={selectedDayMs < todayMs}
        onToday={() => setAnchorMs(null)}
        dayPicker={singleDayPicker(selectedDayMs, nowMs, setAnchorMs)}
        tagId={tagId}
        onTagChange={setTagId}
      />
      {showGrid && (
        <section className="brain-dump-history__day" aria-label={selectedLabel}>
          <div className="brain-dump-history__grid">
            {isToday ? <BrainDumpTodayComposer /> : null}
            {dumps.map((dump, index) => (
              <div
                key={dump.id}
                className={`brain-dump-history__item${
                  isToday && index < 3 ? " brain-dump-history__item--wide" : ""
                }`}
              >
                <PeelToStickyButton
                  className="event-dump__edit-title brain-dump-history__peel"
                  onClick={() =>
                    forkToFloating({
                      text: dump.text,
                      tagIds: dump.tags.map((tag) => tag.id),
                    })
                  }
                />
                <div
                  className="brain-dump-history__open"
                  role="button"
                  tabIndex={0}
                  aria-label="Open saved brain dump"
                  onClick={(event) => openDump(dump, event)}
                  onKeyDown={(event) => openDumpFromKeyboard(dump, event)}
                >
                  <SavedBrainDump dump={dump} preview />
                </div>
                <BrainDumpTags
                  tags={tags}
                  selectedIds={dump.tags.map((tag) => tag.id)}
                  selectedOnly
                  onChange={(tagIds) => void mutate(() => updateBrainDumpTags(dump.id, tagIds))}
                />
              </div>
            ))}
          </div>
        </section>
      )}
      {openedDump && (
        <SavedBrainDumpPopover
          dump={openedDump.dump}
          open
          position={openedDump.position}
          onClose={() => setOpenedDump(null)}
        />
      )}
      {showEmpty && <p className="empty-state" role="status">
        {loaded ? "No brain dumps on this day with these tags." : "Loading brain dumps…"}
      </p>}
    </div>
  );
}
