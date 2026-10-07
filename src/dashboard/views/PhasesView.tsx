import type { CSSProperties } from "react";
import { NestIcon } from "../components/PulseIcon";
import { useDashboardData } from "../context/DashboardDataContext";
import { phaseMeaning, phasesInGuideOrder } from "../lib/phaseGuide";

export function PhasesView() {
  const { phases, latestPhase } = useDashboardData();
  const activePhases = phasesInGuideOrder(
    phases.filter((phase) => phase.inactiveSince === null),
  );
  const currentPhaseId = latestPhase?.phaseId ?? null;

  return (
    <section className="dash-section dash-section--phases">
      <div className="dash-section__body">
        <div className="phase-guide">
          <p className="phase-guide__intro">
            Nest reads your Phase from what the Mac is doing, never from
            anything you enter, and saves a checkpoint each time it changes.
          </p>
          <ol className="phase-list">
            {activePhases.map((phase) => {
              const meaning = phaseMeaning(phase.name);
              return (
                <li
                  key={phase.id}
                  className="phase-row"
                  data-current={
                    phase.id === currentPhaseId ? "true" : undefined
                  }
                  style={
                    phase.color
                      ? ({ "--phase-color": phase.color } as CSSProperties)
                      : undefined
                  }
                >
                  <span className="phase-row__icon">
                    <NestIcon name={phase.icon} />
                  </span>
                  <span className="phase-row__name">{phase.name}</span>
                  {meaning ? (
                    <p className="phase-row__meaning">{meaning}</p>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}
