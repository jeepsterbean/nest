import { useMemo, useState, type KeyboardEvent, type MouseEvent } from "react";
import { updateBrainDumpTags } from "../../lib/commands";
import { BrainDumpTags } from "../components/BrainDumpTags";
import { MenuSelect } from "../components/MenuSelect";
import {
  SavedBrainDump,
  SavedBrainDumpPopover,
  type SavedBrainDumpPosition,
} from "../components/SavedBrainDump";
import { ViewToggle } from "../components/ViewToggle";
import { useDashboardData } from "../context/DashboardDataContext";
import { filterBrainDumpHistory, groupBrainDumpsByDay } from "../lib/brainDumpHistory";
import { useCurrentTime } from "../hooks/useCurrentTime";

export function BrainDumpHistory() {
  const { brainDumps, tags, loaded, mutate } = useDashboardData();
  const [days, setDays] = useState("7");
  const [tagId, setTagId] = useState("");
  const [openedDump, setOpenedDump] = useState<{
    dump: (typeof brainDumps)[number];
    position: SavedBrainDumpPosition;
  } | null>(null);
  const nowMs = useCurrentTime();
  const dumps = useMemo(
    () => filterBrainDumpHistory(brainDumps, Number(days), tagId, Date.now()),
    [brainDumps, days, tagId, nowMs],
  );
  const dumpDays = useMemo(() => groupBrainDumpsByDay(dumps, nowMs), [dumps, nowMs]);

  const openDump = (dump: (typeof brainDumps)[number], event: MouseEvent<HTMLElement>) => {
    setOpenedDump({ dump, position: { x: event.clientX, y: event.clientY } });
  };

  const openDumpFromKeyboard = (dump: (typeof brainDumps)[number], event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    setOpenedDump({ dump, position: { x: rect.right, y: rect.top + rect.height / 2 } });
  };

  return (
    <div className="brain-dump-history">
      <div className="brain-dump-history__filters">
        <ViewToggle
          value={days}
          options={[{ key: "1", label: "1d" }, { key: "3", label: "3d" }, { key: "7", label: "7d" }]}
          label="Past brain dumps range"
          onChange={setDays}
        />
        <MenuSelect
          value={tagId}
          options={[{ value: "", label: "All tags" }, ...tags.map((tag) => ({ value: String(tag.id), label: tag.name }))]}
          placeholder="All tags"
          ariaLabel="Filter brain dumps by tag"
          onChange={setTagId}
        />
      </div>
      {dumpDays.map((day) => (
        <section key={day.dayMs} className="brain-dump-history__day" aria-label={day.label}>
          <h3 className="brain-dump-history__day-label">{day.label}</h3>
          <div className="brain-dump-history__grid">
            {day.dumps.map((dump) => (
              <div key={dump.id} className="brain-dump-history__item">
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
      ))}
      {openedDump && (
        <SavedBrainDumpPopover
          dump={openedDump.dump}
          open
          position={openedDump.position}
          onClose={() => setOpenedDump(null)}
        />
      )}
      {dumps.length === 0 && <p className="empty-state" role="status">
        {loaded ? "No brain dumps in this range with these tags." : "Loading brain dumps…"}
      </p>}
    </div>
  );
}
