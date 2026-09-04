import type { CSSProperties } from "react";
import type { Phase } from "../../../lib/types";
import { NestIcon } from "../PulseIcon";
import { phaseColor, phaseIcon, phaseName, phaseTone } from "../../lib/period";

/** Phase icon and label — shared by Logs timeline and table. */
export function PhaseEventDetail({
  phaseId,
  phaseLabel,
  phases,
}: {
  phaseId: number | null;
  phaseLabel: string | null;
  phases: Phase[];
}) {
  const name = phaseName(phaseId, phases, phaseLabel);
  const color = phaseColor(phaseId, phases);
  return (
    <>
      <span
        className="event__icon"
        title={`${name} phase`}
        role="img"
        aria-label={`${name} phase`}
        style={
          color ? ({ color } as CSSProperties) : undefined
        }
      >
        <NestIcon name={phaseIcon(phaseId, phases, phaseLabel)} />
      </span>
      <span
        className={`event__phase event__phase--${phaseTone(name)}${
          color ? " event__phase--colored" : ""
        }`}
        style={
          color
            ? ({ "--phase-color": color } as CSSProperties)
            : undefined
        }
      >
        {name}
      </span>
    </>
  );
}
