import { useEffect, useRef, useState } from "react";
import { IconPicker, NestIcon, nestIconLabel } from "../components/PulseIcon";
import { useTileIcons } from "../hooks/useTileIcons";
import { TILE_LABELS, type TileId } from "../lib/overviewGrid";
import { writeTileIcon } from "../lib/tileIcons";

export function TileIconSettings({
  tileId,
  embedded = false,
}: {
  tileId: TileId;
  embedded?: boolean;
}) {
  const icons = useTileIcons();
  const [pickerOpen, setPickerOpen] = useState(false);
  const controlsRef = useRef<HTMLDivElement | null>(null);
  const tileLabel = TILE_LABELS[tileId];
  const icon = icons[tileId];

  useEffect(() => {
    if (!pickerOpen) return;
    const closePicker = (event: PointerEvent) => {
      // Scoped to this instance's own controls: Settings keeps every pane
      // mounted, so several TileIconSettings share the class selector and each
      // would read another pane's controls as its own inside.
      if (!controlsRef.current?.contains(event.target as Node)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener("pointerdown", closePicker);
    return () => document.removeEventListener("pointerdown", closePicker);
  }, [pickerOpen]);

  return (
    <div
      className={
        embedded
          ? "tile-settings tile-settings--embedded phase-settings"
          : "settings-pane tile-settings phase-settings"
      }
    >
      <ul className="phase-settings__list">
        <li className="phase-settings__row">
          <div className="phase-settings__controls" ref={controlsRef}>
            <div className="phase-settings__icon-control">
              <button
                type="button"
                className="phase-settings__control"
                aria-label={`Choose icon for ${tileLabel}`}
                aria-expanded={pickerOpen}
                title={nestIconLabel(icon)}
                onClick={() => setPickerOpen((open) => !open)}
              >
                <NestIcon name={icon} />
              </button>
              {pickerOpen ? (
                <IconPicker
                  value={icon}
                  label={`Icon for ${tileLabel}`}
                  onChange={(nextIcon) => {
                    writeTileIcon(tileId, nextIcon);
                    setPickerOpen(false);
                  }}
                />
              ) : null}
            </div>
          </div>
          <strong>{tileLabel}</strong>
        </li>
      </ul>
    </div>
  );
}
