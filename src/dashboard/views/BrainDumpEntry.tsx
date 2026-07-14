import { useEffect, useRef, useState } from "react";
import { updateBrainDumpTitle } from "../../lib/commands";
import type { BrainDump } from "../../lib/types";
import { pencilIcon } from "../components/icons";
import { useDashboardData } from "../context/DashboardDataContext";
import { formatDateTime } from "../lib/time";

// A collapsible brain-dump card. `className` is the literal CSS prefix used to
// build every child class, so it must stay one of the known variants. Shared by
// the Overview (overview-dump) and Journal (event-dump) views.
export function BrainDumpEntry({
  dump,
  className,
  expanded,
  onToggle,
}: {
  dump: BrainDump;
  className: "overview-dump" | "event-dump";
  expanded: boolean;
  onToggle: () => void;
}) {
  const { mutate } = useDashboardData();
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(dump.title ?? "");
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const title = dump.title?.trim() || formatDateTime(dump.createdAt);

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
    <div className={className}>
      <div className={`${className}__head`}>
        {editingTitle ? (
          <div className={`${className}__title-editor`}>
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
            className={`${className}__toggle`}
            aria-expanded={expanded}
            onClick={onToggle}
          >
            <span className={`${className}__chevron`} aria-hidden="true">
              {expanded ? "▾" : "▸"}
            </span>
            <span className={`${className}__title`}>{title}</span>
            {dump.title?.trim() ? (
              <time className={`${className}__time`}>
                {formatDateTime(dump.createdAt)}
              </time>
            ) : null}
          </button>
        )}
        <button
          type="button"
          className={`${className}__edit-title`}
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
      {expanded && <p className={`${className}__text`}>{dump.text}</p>}
    </div>
  );
}
