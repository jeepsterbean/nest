import { useEffect, useRef } from "react";
import { IconPickerButton } from "../components/PulseIcon";
import { xIcon } from "../components/icons";
import { useTileIcons } from "../hooks/useTileIcons";
import { OVERVIEW_SETTINGS_ID, TILE_LABELS } from "../lib/overviewGrid";
import { writeTileIcon, type ConfigurableOverviewIcon } from "../lib/tileIcons";

// Feature tiles take their icon from their own Section (Tasks, Logs,
// Brain dump, Settings → Metrics); only icons with no other home live here.
const OVERVIEW_OWNED_ICONS = [
  "overview",
  "controlPanel",
] as const satisfies readonly ConfigurableOverviewIcon[];

/** Overlay over the tile board so opening it never reflows the grid. */
export function OverviewSettings({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLElement | null>(null);
  const icons = useTileIcons();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!target || panelRef.current?.contains(target)) return;
      // The Greetings board toggle handles its own click; closing here too
      // would reopen the panel on the same press.
      if (target.closest(`[aria-controls="${OVERVIEW_SETTINGS_ID}"]`)) return;
      onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) onClose();
    };
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <aside
      id={OVERVIEW_SETTINGS_ID}
      ref={panelRef}
      className="overview-settings"
      aria-label="Overview settings"
    >
      <div className="overview-settings__head">
        <strong>Configure Overview</strong>
        <button
          type="button"
          className="overview-tile__action"
          aria-label="Close Overview settings"
          onClick={onClose}
        >
          {xIcon}
        </button>
      </div>
      <ul className="phase-settings__list">
        {OVERVIEW_OWNED_ICONS.map((slot) => {
          const label = slot === "overview" ? "Overview" : TILE_LABELS[slot];
          return (
            <li key={slot} className="phase-settings__row">
              <div className="phase-settings__controls">
                <IconPickerButton
                  icon={icons[slot]}
                  label={label}
                  onChange={(icon) => writeTileIcon(slot, icon)}
                />
              </div>
              <strong>{label}</strong>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
