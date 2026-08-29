import { useEffect, useState, type CSSProperties } from "react";
import { setPhaseColor, setPhaseIcon } from "../../lib/commands";
import { MetricColorPicker } from "../components/MetricColorPicker";
import { IconPicker, NestIcon, nestIconLabel } from "../components/PulseIcon";
import { useDashboardData } from "../context/DashboardDataContext";

type OpenPicker = { phaseId: number; kind: "icon" | "color" };

export function PhasesView() {
  const { phases, mutate } = useDashboardData();
  const [openPicker, setOpenPicker] = useState<OpenPicker | null>(null);
  const activePhases = phases.filter((phase) => phase.inactiveSince === null);

  useEffect(() => {
    if (openPicker === null) return;
    const closePicker = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!target?.closest(".phase-settings__controls")) {
        setOpenPicker(null);
      }
    };
    document.addEventListener("pointerdown", closePicker);
    return () => document.removeEventListener("pointerdown", closePicker);
  }, [openPicker]);

  const togglePicker = (phaseId: number, kind: OpenPicker["kind"]) => {
    setOpenPicker((current) =>
      current?.phaseId === phaseId && current.kind === kind
        ? null
        : { phaseId, kind },
    );
  };

  return (
    <div className="settings-pane settings-pane--phases phase-settings">
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
              <div className="phase-settings__icon-control">
                <button
                  type="button"
                  className="phase-settings__control"
                  aria-label={`Choose icon for ${phase.name}`}
                  aria-expanded={
                    openPicker?.phaseId === phase.id &&
                    openPicker.kind === "icon"
                  }
                  title={nestIconLabel(phase.icon)}
                  onClick={() => togglePicker(phase.id, "icon")}
                >
                  <NestIcon name={phase.icon} />
                </button>
                {openPicker?.phaseId === phase.id &&
                openPicker.kind === "icon" ? (
                  <IconPicker
                    value={phase.icon}
                    label={`Icon for ${phase.name}`}
                    onChange={(icon) =>
                      void mutate(() => setPhaseIcon(phase.id, icon))
                    }
                  />
                ) : null}
              </div>
              <div className="phase-settings__color-control">
                <button
                  type="button"
                  className="phase-settings__control phase-settings__control--color"
                  aria-label={`Choose color for ${phase.name}`}
                  aria-expanded={
                    openPicker?.phaseId === phase.id &&
                    openPicker.kind === "color"
                  }
                  title={phase.color ?? "No color"}
                  onClick={() => togglePicker(phase.id, "color")}
                >
                  <NestIcon name="palette" />
                </button>
                {openPicker?.phaseId === phase.id &&
                openPicker.kind === "color" ? (
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
  );
}
