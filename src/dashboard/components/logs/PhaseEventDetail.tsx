import type { CSSProperties } from "react";
import type { Phase } from "../../../lib/types";
import { phaseColor, phaseName, phaseTone } from "../../lib/period";

/** Phase name; the timeline mark carries the Phase icon. */
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
    <span
      className={`event__phase event__phase--${phaseTone(name)}${
        color ? " event__phase--colored" : ""
      }`}
      style={
        color ? ({ "--phase-color": color } as CSSProperties) : undefined
      }
    >
      {name}
    </span>
  );
}
