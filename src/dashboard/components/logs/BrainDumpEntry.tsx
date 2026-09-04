import { useState } from "react";
import { updateBrainDumpTags } from "../../../lib/commands";
import type { BrainDump } from "../../../lib/types";
import { floatingDraftIcon, tagsIcon } from "../icons";
import { BrainDumpTags } from "../BrainDumpTags";
import { useDashboardData } from "../../context/DashboardDataContext";
import { useFloatingBrainDumpsContext } from "../../context/FloatingBrainDumpsContext";

export function BrainDumpEntry({
  dump,
  expanded,
  onToggle,
}: {
  dump: BrainDump;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { tags, mutate } = useDashboardData();
  const { forkToFloating } = useFloatingBrainDumpsContext();
  const [editingTags, setEditingTags] = useState(false);
  const [tagDraft, setTagDraft] = useState<number[]>([]);
  const [savingTags, setSavingTags] = useState(false);
  const title = dump.text.trim().split("\n")[0] || "Brain dump";

  const startTagEdit = () => {
    setTagDraft(dump.tags.map((tag) => tag.id));
    setEditingTags(true);
  };

  const saveTags = async () => {
    setSavingTags(true);
    if (await mutate(() => updateBrainDumpTags(dump.id, tagDraft))) {
      setEditingTags(false);
    }
    setSavingTags(false);
  };

  const forkDump = () => {
    forkToFloating({
      text: dump.text,
      tagIds: dump.tags.map((tag) => tag.id),
    });
  };

  return (
    <div className="event-dump">
      <div className="event-dump__head">
        <button
          type="button"
          className="event-dump__toggle"
          aria-expanded={expanded}
          onClick={onToggle}
        >
          <span className="event-dump__chevron" aria-hidden="true">
            {expanded ? "▾" : "▸"}
          </span>
          <span className="event-dump__title">{title}</span>
        </button>
        <button
          type="button"
          className="event-dump__edit-title"
          onClick={forkDump}
          aria-label="Fork brain dump as floating draft"
          title="Fork as floating draft"
        >
          {floatingDraftIcon}
        </button>
        <button
          type="button"
          className="event-dump__edit-title"
          onClick={startTagEdit}
          aria-label="Edit brain dump tags"
          title="Edit tags"
        >
          {tagsIcon}
        </button>
      </div>
      {editingTags ? (
        <div className="event-dump__tag-editor">
          <BrainDumpTags
            tags={tags}
            selectedIds={tagDraft}
            autoOpen
            onChange={setTagDraft}
          />
          <div className="event-dump__tag-actions">
            <button type="button" disabled={savingTags} onClick={() => setEditingTags(false)}>
              Cancel
            </button>
            <button type="button" disabled={savingTags} onClick={() => void saveTags()}>
              Save
            </button>
          </div>
        </div>
      ) : (
        dump.tags.length > 0 && (
          <div className="event-dump__tags" aria-label="Brain dump tags">
            {dump.tags.map((tag) => (
              <span key={tag.id} title={tag.name}>{tag.name}</span>
            ))}
          </div>
        )
      )}
      {expanded && <p className="event-dump__text">{dump.text}</p>}
    </div>
  );
}
