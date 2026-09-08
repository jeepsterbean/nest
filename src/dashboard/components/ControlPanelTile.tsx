import { useRef, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { NestIcon } from "./PulseIcon";
import { startPointerDrag } from "../lib/pointerDrag";
import {
  COLS,
  ROWS,
  TILE_LABELS,
  canShowTile,
  pointerToCell,
  restoredTileSize,
  showTile,
  type TileId,
  type TileLayout,
  type TileRect,
} from "../lib/overviewGrid";

type DropPreview = { rect: TileRect; valid: boolean } | null;

export function ControlPanelTile({
  hiddenIds,
  icons,
  layout,
  gridRef,
  stacked,
  onShow,
  onDropPreview,
}: {
  hiddenIds: TileId[];
  icons: Record<TileId, string>;
  layout: TileLayout[];
  gridRef: RefObject<HTMLDivElement | null>;
  stacked: boolean;
  onShow: (id: TileId, at?: Pick<TileRect, "x" | "y">) => void;
  onDropPreview: (preview: DropPreview) => void;
}) {
  const justDragged = useRef<TileId | null>(null);

  const onChipPointerDown =
    (id: TileId, disabled: boolean) =>
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (stacked || disabled || event.button !== 0) return;
      const gridRect = gridRef.current?.getBoundingClientRect();
      if (!gridRect?.width || !gridRect.height) return;
      const size = restoredTileSize(id);
      let latest: DropPreview = null;

      startPointerDrag(event, {
        onStart: () => undefined,
        onMove: (move) => {
          const cell = pointerToCell(move.clientX, move.clientY, gridRect);
          const rect = {
            x: Math.min(cell.x, COLS - size.w),
            y: Math.min(cell.y, ROWS - size.h),
            w: size.w,
            h: size.h,
          };
          latest = {
            rect,
            valid: showTile(layout, id, { x: rect.x, y: rect.y }) !== layout,
          };
          onDropPreview(latest);
        },
        onEnd: (_end, dragged) => {
          if (dragged) {
            justDragged.current = id;
          }
          if (dragged && latest?.valid) {
            onShow(id, { x: latest.rect.x, y: latest.rect.y });
          }
          onDropPreview(null);
        },
        onCancel: () => onDropPreview(null),
      });
    };

  return (
    <div className="control-panel">
      {hiddenIds.length ? (
        hiddenIds.map((id) => {
          const disabled = !canShowTile(layout, id);
          return (
            <button
              key={id}
              type="button"
              className="control-panel__chip"
              disabled={disabled}
              title={disabled ? "No room on the board" : `Restore ${TILE_LABELS[id]}`}
              onClick={() => {
                if (justDragged.current === id) {
                  justDragged.current = null;
                  return;
                }
                onShow(id);
              }}
              onPointerDown={onChipPointerDown(id, disabled)}
            >
              <NestIcon name={icons[id]} />
              <span>{TILE_LABELS[id]}</span>
            </button>
          );
        })
      ) : (
        <p className="control-panel__empty">
          Hidden tiles rest here. Click to restore, or drag onto the board.
        </p>
      )}
    </div>
  );
}
