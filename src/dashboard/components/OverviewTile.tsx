import {
  Fragment,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { EyeOff, Maximize2, Minus } from "lucide-react";
import { NestIcon } from "./PulseIcon";
import {
  COLS,
  ROWS,
  pointerDeltaToCells,
  type TileLayout,
  type TileRect,
  type TileRules,
  previewMoveTile,
  previewResizeTile,
} from "../lib/overviewGrid";
import { startPointerDrag } from "../lib/pointerDrag";

type Preview = {
  kind: "move" | "resize";
  originRect: TileRect;
  rect: TileRect;
  layout: TileLayout[];
  dxPx: number;
  dyPx: number;
  valid: boolean;
};

type InlineHeaderProps = {
  icon: ReactNode;
  action: ReactNode;
  onHeaderPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  dragTitle: string;
};

export const gridArea = ({ x, y, w, h }: TileRect) =>
  `${y + 1} / ${x + 1} / span ${h} / span ${w}`;

export function OverviewTile({
  tile,
  layout,
  rules,
  gridRef,
  stacked,
  onPreviewLayoutChange,
  onCommitLayout,
  onCancelPreview,
  onResize,
  onMinimise,
  onExpand,
  onHide,
  bodyDraggable = false,
  label,
  icon,
  onOpenSection,
  renderInlineHeader,
  children,
}: {
  tile: TileLayout;
  layout: TileLayout[];
  rules: TileRules;
  gridRef: RefObject<HTMLDivElement | null>;
  stacked: boolean;
  onPreviewLayoutChange: (layout: TileLayout[] | null) => void;
  onCommitLayout: (layout: TileLayout[]) => void;
  onCancelPreview: () => void;
  onResize: (dw: number, dh: number) => void;
  onMinimise: () => void;
  onExpand: () => void;
  onHide?: () => void;
  bodyDraggable?: boolean;
  label: string;
  icon: string;
  /** When set, the tile icon becomes the way into the tile's full Section. */
  onOpenSection?: { label: string; open: () => void };
  renderInlineHeader?: (props: InlineHeaderProps) => ReactNode;
  children: ReactNode;
}) {
  const [preview, setPreview] = useState<Preview | null>(null);

  const onHeaderPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (stacked || event.button !== 0) return;
    if ((event.target as HTMLElement).closest("button")) return;
    const gridRect = gridRef.current?.getBoundingClientRect();
    if (!gridRect?.width || !gridRect.height) return;
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const baseLayout = layout.map((candidate) => ({ ...candidate }));
    let latest: Preview | null = null;

    startPointerDrag(event, {
      onStart: () => undefined,
      onMove: (move) => {
        const dxPx = move.clientX - startX;
        const dyPx = move.clientY - startY;
        const { dx, dy } = pointerDeltaToCells(dxPx, dyPx, gridRect);
        const solvedLayout = previewMoveTile(baseLayout, tile.id, dx, dy);
        const rect =
          solvedLayout?.find((candidate) => candidate.id === tile.id) ?? {
            ...tile,
            x: tile.x + dx,
            y: tile.y + dy,
          };
        latest = {
          kind: "move",
          originRect: tile,
          rect,
          layout: solvedLayout ?? baseLayout,
          dxPx,
          dyPx,
          valid: solvedLayout !== null,
        };
        onPreviewLayoutChange(solvedLayout);
        setPreview(latest);
      },
      onEnd: (_end, dragged) => {
        if (dragged && latest?.valid) {
          onCommitLayout(latest.layout);
        }
        onPreviewLayoutChange(null);
        setPreview(null);
      },
      onCancel: () => {
        onCancelPreview();
        setPreview(null);
      },
    });
  };

  const onResizePointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (stacked || event.button !== 0) return;
    const gridRect = gridRef.current?.getBoundingClientRect();
    if (!gridRect?.width || !gridRect.height) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const baseLayout = layout.map((candidate) => ({ ...candidate }));
    let latest: Preview | null = null;

    startPointerDrag(event, {
      startImmediately: true,
      onStart: () => undefined,
      onMove: (move) => {
        const dxPx = move.clientX - startX;
        const dyPx = move.clientY - startY;
        const { dx, dy } = pointerDeltaToCells(dxPx, dyPx, gridRect);
        const rect = {
          ...tile,
          w: Math.min(
            Math.max(tile.w + dx, rules.minW ?? 1),
            COLS - tile.x,
          ),
          h: Math.min(
            Math.max(tile.h + dy, rules.minH ?? 1),
            ROWS - tile.y,
          ),
        };
        const solvedLayout = previewResizeTile(
          baseLayout,
          tile.id,
          rect.w - tile.w,
          rect.h - tile.h,
        );
        latest = {
          kind: "resize",
          originRect: tile,
          rect:
            solvedLayout?.find((candidate) => candidate.id === tile.id) ?? rect,
          layout: solvedLayout ?? baseLayout,
          dxPx: 0,
          dyPx: 0,
          valid: solvedLayout !== null,
        };
        onPreviewLayoutChange(solvedLayout);
        setPreview(latest);
      },
      onEnd: () => {
        if (latest?.valid) {
          onCommitLayout(latest.layout);
        }
        onPreviewLayoutChange(null);
        setPreview(null);
      },
      onCancel: () => {
        onCancelPreview();
        setPreview(null);
      },
    });
  };

  const className = [
    "overview-tile",
    tile.minimised ? "overview-tile--minimised" : "",
    tile.id === "brainDump" ? "overview-tile--dump" : "",
    preview?.kind === "move" ? "is-dragging" : "",
    preview?.kind === "resize" ? "is-resizing" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const style: CSSProperties = {
    gridArea: gridArea(
      preview?.kind === "move" ? preview.originRect : tile,
    ),
    transform:
      preview?.kind === "move"
        ? `translate(${preview.dxPx}px, ${preview.dyPx}px)`
        : undefined,
  };
  const ghostRect = preview
    ? {
        ...preview.rect,
        x: Math.min(Math.max(preview.rect.x, 0), COLS - preview.rect.w),
        y: Math.min(Math.max(preview.rect.y, 0), ROWS - preview.rect.h),
      }
    : null;
  const minimiseButton = rules.minimisable ? (
    <button
      type="button"
      className="overview-tile__action"
      aria-label={`${tile.minimised ? "Expand" : "Minimise"} ${label}`}
      title={tile.minimised ? "Expand" : "Minimise"}
      onClick={tile.minimised ? onExpand : onMinimise}
    >
      {tile.minimised ? <Maximize2 /> : <Minus />}
    </button>
  ) : null;
  const hideButton = onHide ? (
    <button
      type="button"
      className="overview-tile__action"
      aria-label={`Hide ${label}`}
      title={`Hide ${label}`}
      onClick={onHide}
    >
      <EyeOff />
    </button>
  ) : null;
  const actionButtons =
    minimiseButton || hideButton ? (
      <>
        {hideButton}
        {minimiseButton}
      </>
    ) : null;
  const tileIcon = onOpenSection ? (
    <button
      type="button"
      className="overview-tile__icon overview-tile__icon--link"
      aria-label={onOpenSection.label}
      title={onOpenSection.label}
      onClick={onOpenSection.open}
    >
      <NestIcon name={icon} />
    </button>
  ) : (
    <span className="overview-tile__icon" title={label}>
      <NestIcon name={icon} />
    </span>
  );

  return (
    <Fragment>
      {preview && ghostRect && (
        <div
          className={`overview-tile__ghost${
            preview.valid ? "" : " is-invalid"
          }`}
          style={{ gridArea: gridArea(ghostRect) }}
          aria-hidden="true"
        />
      )}
      <section
        className={className}
        style={style}
        data-tile={tile.id}
        aria-label={label}
      >
        {renderInlineHeader ? null : (
          <header
            className="overview-tile__head"
            title={`Drag ${label}`}
            onPointerDown={onHeaderPointerDown}
          >
            {tileIcon}
            {actionButtons}
          </header>
        )}
        <div
          className={`overview-tile__body${
            bodyDraggable ? " overview-tile__body--draggable" : ""
          }`}
          title={bodyDraggable ? `Drag ${label}` : undefined}
          onPointerDown={bodyDraggable ? onHeaderPointerDown : undefined}
        >
          {renderInlineHeader
            ? renderInlineHeader({
                icon: tileIcon,
                action: actionButtons,
                onHeaderPointerDown,
                dragTitle: `Drag ${label}`,
              })
            : children}
        </div>
        {rules.resizable && !tile.minimised && (
          <button
            type="button"
            className="overview-tile__resize"
            aria-label={`Resize ${label}`}
            title={`Resize ${label}`}
            onPointerDown={onResizePointerDown}
            onKeyDown={(event) => {
              const delta = {
                ArrowLeft: [-1, 0],
                ArrowRight: [1, 0],
                ArrowUp: [0, -1],
                ArrowDown: [0, 1],
              }[event.key];
              if (!delta) return;
              event.preventDefault();
              onResize(delta[0], delta[1]);
            }}
          />
        )}
      </section>
    </Fragment>
  );
}
