import type {
  KeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  RefObject,
} from "react";
import type { Tag } from "../../lib/types";
import { BrainDumpTags } from "./BrainDumpTags";

export function BrainDumpSurface({
  text,
  tagIds,
  tags,
  tagsDisabled = false,
  readOnly = false,
  showTags = true,
  layout = "default",
  textareaLabel,
  className = "",
  headerStart,
  headerEnd,
  onTextChange,
  onTagsChange,
  onKeyDown,
  onFocus,
  textareaRef,
  onHeaderPointerDown,
}: {
  text: string;
  tagIds: number[];
  tags: Tag[];
  tagsDisabled?: boolean;
  readOnly?: boolean;
  showTags?: boolean;
  layout?: "default" | "overview";
  textareaLabel: string;
  className?: string;
  headerStart?: ReactNode;
  headerEnd?: ReactNode;
  onTextChange?: (text: string) => void;
  onTagsChange?: (tagIds: number[]) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onFocus?: () => void;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
  onHeaderPointerDown?: (event: ReactPointerEvent<HTMLElement>) => void;
}) {
  const hasHeader = headerStart || headerEnd;
  const usesOverviewChrome = layout === "overview";

  return (
    <div
      className={`brain-dump-surface${
        usesOverviewChrome ? " brain-dump-surface--overview" : ""
      }${className ? ` ${className}` : ""}`}
    >
      {hasHeader && (
        <header
          className={`${
            usesOverviewChrome ? "overview-panel__head" : "brain-dump-surface__head"
          }${
            onHeaderPointerDown
              ? usesOverviewChrome
                ? " overview-panel__head--draggable"
                : " brain-dump-surface__head--draggable"
              : ""
          }`}
          onPointerDown={onHeaderPointerDown}
        >
          <div
            className={
              usesOverviewChrome
                ? "overview-panel__head-start"
                : "brain-dump-surface__head-start"
            }
          >
            {headerStart}
          </div>
          <div
            className={
              usesOverviewChrome
                ? "overview-panel__head-end"
                : "brain-dump-surface__head-end"
            }
          >
            {headerEnd}
          </div>
        </header>
      )}
      <div
        className={
          usesOverviewChrome
            ? "overview-panel__scroll brain-dump-surface__scroll"
            : "brain-dump-surface__scroll"
        }
      >
        <textarea
          ref={textareaRef}
          className="brain-dump-surface__input"
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          value={text}
          readOnly={readOnly}
          aria-label={textareaLabel}
          onChange={(event) => onTextChange?.(event.target.value)}
          onKeyDown={onKeyDown}
          onFocus={onFocus}
        />
        {showTags && onTagsChange && (
          <BrainDumpTags
            tags={tags}
            selectedIds={tagIds}
            disabled={tagsDisabled || readOnly}
            onChange={onTagsChange}
          />
        )}
      </div>
    </div>
  );
}
