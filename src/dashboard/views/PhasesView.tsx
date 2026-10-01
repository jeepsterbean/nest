import { useEffect, useRef, useState, type CSSProperties } from "react";
import { setPhaseColor, setPhaseIcon } from "../../lib/commands";
import { CorePaneToggle } from "../components/CorePaneToggle";
import { MetricColorPicker } from "../components/MetricColorPicker";
import { IconPickerButton, NestIcon } from "../components/PulseIcon";
import { useDashboardData } from "../context/DashboardDataContext";
import { useTileIcons } from "../hooks/useTileIcons";
import type { CorePaneControls } from "../lib/corePane";
import { writeTileIcon } from "../lib/tileIcons";

export function PhasesView({ pane, onSelectPane }: CorePaneControls) {
  const { phases, mutate } = useDashboardData();
  const icons = useTileIcons();
  const [colorPickerPhaseId, setColorPickerPhaseId] = useState<number | null>(
    null,
  );
  // Held by the color control that owns the open picker, so a press on its
  // row's icon trigger or another row's controls closes it.
  const openColorControlRef = useRef<HTMLDivElement | null>(null);
  const activePhases = phases.filter((phase) => phase.inactiveSince === null);

  useEffect(() => {
    if (colorPickerPhaseId === null) return;
    const closePicker = (event: PointerEvent) => {
      if (!openColorControlRef.current?.contains(event.target as Node)) {
        setColorPickerPhaseId(null);
      }
    };
    document.addEventListener("pointerdown", closePicker);
    return () => document.removeEventListener("pointerdown", closePicker);
  }, [colorPickerPhaseId]);

  return (
    <section className="dash-section dash-section--phases">
      <header className="dash-section__head">
        <CorePaneToggle pane={pane} onSelectPane={onSelectPane} />
        <IconPickerButton
          className="dash-section__tile-icon"
          icon={icons.phases}
          label="Phases"
          onChange={(nextIcon) => writeTileIcon("phases", nextIcon)}
        />
      </header>
      <div className="dash-section__body">
        <div className="phase-settings">
          <ul className="phase-settings__list">
            {activePhases.map((phase) => (
              <li
                key={phase.id}
                className={`phase-settings__row${
                  phase.color ? " phase-settings__row--colored" : ""
                }`}
                style={
                  phase.color
                    ? ({ "--phase-color": phase.color } as CSSProperties)
                    : undefined
                }
              >
                <div className="phase-settings__controls">
                  <IconPickerButton
                    icon={phase.icon}
                    label={phase.name}
                    onChange={(icon) =>
                      void mutate(() => setPhaseIcon(phase.id, icon))
                    }
                  />
                  <div
                    className="phase-settings__color-control"
                    ref={
                      colorPickerPhaseId === phase.id
                        ? openColorControlRef
                        : null
                    }
                  >
                    <button
                      type="button"
                      className="phase-settings__control phase-settings__control--color"
                      aria-label={`Choose color for ${phase.name}`}
                      aria-expanded={colorPickerPhaseId === phase.id}
                      title={phase.color ?? "No color"}
                      onClick={() =>
                        setColorPickerPhaseId((current) =>
                          current === phase.id ? null : phase.id,
                        )
                      }
                    >
                      <NestIcon name="palette" />
                    </button>
                    {colorPickerPhaseId === phase.id ? (
                      <MetricColorPicker
                        value={phase.color}
                        label={`Color for ${phase.name}`}
                        emptyLabel="No color"
                        onChange={(color) =>
                          void mutate(() => setPhaseColor(phase.id, color))
                        }
                      />
                    ) : null}
                  </div>
                </div>
                <strong>{phase.name}</strong>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
