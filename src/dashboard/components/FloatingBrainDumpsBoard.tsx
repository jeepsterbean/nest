import { useCallback, useState } from "react";
import {
  useViewportSize,
} from "../../lib/floatingBrainDumps";
import type {
  FloatingBrainDump,
  FloatingStickyColor,
} from "../../lib/floatingBrainDumps";
import type { Tag } from "../../lib/types";
import { FloatingBrainDumpCard } from "./FloatingBrainDumpCard";

export function FloatingBrainDumpsBoard({
  dumps,
  tags,
  onTextChange,
  onTagsChange,
  onColorChange,
  onPositionChange,
  onSizeChange,
  onPromote,
  onRemove,
  onSubmit,
  onBringToFront,
  onViewportResize,
}: {
  dumps: FloatingBrainDump[];
  tags: Tag[];
  onTextChange: (id: string, text: string) => void;
  onTagsChange: (id: string, tagIds: number[]) => void;
  onColorChange: (id: string, color: FloatingStickyColor) => void;
  onPositionChange: (id: string, x: number, y: number) => void;
  onSizeChange: (id: string, width: number, height: number) => void;
  onPromote: (dump: FloatingBrainDump) => void;
  onRemove: (id: string) => void;
  onSubmit: (dump: FloatingBrainDump) => void;
  onBringToFront: (id: string) => void;
  onViewportResize: (width: number, height: number) => void;
}) {
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });

  const handleResize = useCallback(
    (width: number, height: number) => {
      setViewportSize({ width, height });
      onViewportResize(width, height);
    },
    [onViewportResize],
  );

  useViewportSize(handleResize);

  return (
    <div
      className="floating-brain-dumps-board"
      aria-hidden={dumps.length === 0}
    >
      {dumps.map((dump) => (
        <FloatingBrainDumpCard
          key={dump.id}
          dump={dump}
          tags={tags}
          viewportWidth={viewportSize.width}
          viewportHeight={viewportSize.height}
          onTextChange={(text) => onTextChange(dump.id, text)}
          onTagsChange={(tagIds) => onTagsChange(dump.id, tagIds)}
          onColorChange={(color) => onColorChange(dump.id, color)}
          onPositionChange={(x, y) => onPositionChange(dump.id, x, y)}
          onSizeChange={(width, height) => onSizeChange(dump.id, width, height)}
          onPromote={() => onPromote(dump)}
          onRemove={() => onRemove(dump.id)}
          onSubmit={() => onSubmit(dump)}
          onFocus={() => onBringToFront(dump.id)}
        />
      ))}
    </div>
  );
}
