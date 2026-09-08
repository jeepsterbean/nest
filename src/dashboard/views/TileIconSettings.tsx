import { useEffect, useState } from "react";
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
  const tileLabel = TILE_LABELS[tileId];
  const icon = icons[tileId];

  useEffect(() => {
    if (!pickerOpen) return;
    const closePicker = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!target?.closest(".phase-settings__controls")) {
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
          <div className="phase-settings__controls">
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
