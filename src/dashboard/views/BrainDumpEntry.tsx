import { useEffect, useRef, useState } from "react";
import { updateBrainDumpTitle } from "../../lib/commands";
import type { BrainDump } from "../../lib/types";
import { pencilIcon } from "../components/icons";
import { useDashboardData } from "../context/DashboardDataContext";

export function BrainDumpEntry({
  dump,
  expanded,
  onToggle,
}: {
  dump: BrainDump;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { mutate } = useDashboardData();
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(dump.title ?? "");
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const named = dump.title?.trim();
  const title = named || dump.text.trim().split("\n")[0] || "Brain dump";

  useEffect(() => {
    if (!editingTitle) setTitleDraft(dump.title ?? "");
  }, [dump.title, editingTitle]);

  useEffect(() => {
    if (editingTitle) titleInputRef.current?.select();
  }, [editingTitle]);

  const commitTitle = () => {
    if (!editingTitle) return;
    const next = titleDraft.trim();
    setEditingTitle(false);
    if (next === (dump.title?.trim() ?? "")) return;
    void mutate(() => updateBrainDumpTitle(dump.id, next || null));
  };

  return (
    <div className="event-dump">
      <div className="event-dump__head">
        {editingTitle ? (
          <div className="event-dump__title-editor">
            <input
              ref={titleInputRef}
              type="text"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitTitle();
                }
                if (e.key === "Escape") {
                  setTitleDraft(dump.title ?? "");
                  setEditingTitle(false);
                }
              }}
              aria-label="Brain dump title"
            />
          </div>
        ) : (
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
        )}
        <button
          type="button"
          className="event-dump__edit-title"
          onClick={() => setEditingTitle(true)}
          aria-label={
            dump.title?.trim()
              ? "Edit brain dump title"
              : "Add brain dump title"
          }
          title={dump.title?.trim() ? "Edit title" : "Add title"}
        >
          {pencilIcon}
        </button>
      </div>
      {expanded && <p className="event-dump__text">{dump.text}</p>}
    </div>
  );
}
