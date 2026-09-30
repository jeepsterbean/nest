import { IconPickerButton } from "../components/PulseIcon";
import { useTileIcons } from "../hooks/useTileIcons";
import { TILE_LABELS, type TileId } from "../lib/overviewGrid";
import { writeTileIcon } from "../lib/tileIcons";

export function TileIconSettings({
  tileId,
  embedded = false,
}: {
  tileId: Exclude<TileId, "lastHour">;
  embedded?: boolean;
}) {
  const icons = useTileIcons();
  const tileLabel = TILE_LABELS[tileId];
  const icon = icons[tileId];

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
            <IconPickerButton
              icon={icon}
              label={tileLabel}
              onChange={(nextIcon) => writeTileIcon(tileId, nextIcon)}
            />
          </div>
          <strong>{tileLabel}</strong>
        </li>
      </ul>
    </div>
  );
}
