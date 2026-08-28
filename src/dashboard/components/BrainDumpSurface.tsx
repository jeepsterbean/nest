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

  return (
    <div className={`brain-dump-surface${className ? ` ${className}` : ""}`}>
      {hasHeader && (
        <header
          className={`brain-dump-surface__head${
            onHeaderPointerDown ? " brain-dump-surface__head--draggable" : ""
          }`}
          onPointerDown={onHeaderPointerDown}
        >
          <div className="brain-dump-surface__head-start">{headerStart}</div>
          <div className="brain-dump-surface__head-end">{headerEnd}</div>
        </header>
      )}
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
  );
}
