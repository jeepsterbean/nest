import { useMemo, useState, type KeyboardEvent, type MouseEvent } from "react";
import { MenuSelect } from "../components/MenuSelect";
import {
  SavedBrainDump,
  SavedBrainDumpPopover,
  type SavedBrainDumpPosition,
} from "../components/SavedBrainDump";
import { ViewToggle } from "../components/ViewToggle";
import { useDashboardData } from "../context/DashboardDataContext";
import { filterBrainDumpHistory } from "../lib/brainDumpHistory";
import { useCurrentTime } from "../hooks/useCurrentTime";
import { TileIconSettings } from "./TileIconSettings";

export function BrainDumpSettings() {
  const { brainDumps, tags, loaded } = useDashboardData();
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
    <div className="settings-pane">
      <TileIconSettings tileId="brainDump" embedded />
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
      <div className="brain-dump-history__grid" aria-label="Past brain dumps">
        {dumps.map((dump) => (
          <div
            key={dump.id}
            role="button"
            tabIndex={0}
            aria-label="Open saved brain dump"
            onClick={(event) => openDump(dump, event)}
            onKeyDown={(event) => openDumpFromKeyboard(dump, event)}
          >
            <SavedBrainDump dump={dump} />
          </div>
        ))}
      </div>
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
