import type { Phase } from "../../../lib/types";
import { NestIcon } from "../PulseIcon";
import { phaseIconName, phaseName, phaseTone } from "../../lib/period";

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
  return (
    <>
      <span className="event__icon" title={`${name} phase`} role="img" aria-label={`${name} phase`}>
        <NestIcon name={phaseIconName(name)} />
      </span>
      <span className={`event__phase event__phase--${phaseTone(name)}`}>
        {name}
      </span>
    </>
  );
}
