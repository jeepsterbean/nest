import type { Metric, Phase, Pulse, Task } from "../../../lib/types";
import type { RawLogEvent } from "../../lib/timeline";
import { BrainDumpEntry } from "./BrainDumpEntry";
import { MetricCheckInDetail } from "./MetricCheckInDetail";
import { PhaseEventDetail } from "./PhaseEventDetail";

export const LOG_TYPE_LABEL: Record<RawLogEvent["kind"], string> = {
  metrics: "Metric",
  dump: "Brain dump",
  phase: "Phase",
  "work-start": "Started",
  "work-stop": "Stopped",
};

function taskTitle(tasks: Task[], taskId: number) {
  return tasks.find((task) => task.id === taskId)?.title ?? `Task ${taskId}`;
}

export function LogEventDetail({
  event,
  phases,
  metrics,
  pulses,
  tasks,
  expandedDumpIds,
  onDeleteCheckIn,
  onToggleDump,
}: {
  event: RawLogEvent;
  phases: Phase[];
  metrics: Metric[];
  pulses: Pulse[];
  tasks: Task[];
  expandedDumpIds: Set<number>;
  onDeleteCheckIn: (id: number) => void;
  onToggleDump: (id: number) => void;
}) {
  switch (event.kind) {
    case "metrics":
      return (
        <div className="logs-table__detail logs-table__detail--metrics">
          <MetricCheckInDetail
            checkIn={event.checkIn}
            metrics={metrics}
            pulses={pulses}
            onDelete={onDeleteCheckIn}
          />
        </div>
      );
    case "dump":
      return (
        <div className="logs-table__detail logs-table__detail--dump">
          <BrainDumpEntry
            dump={event.dump}
            expanded={expandedDumpIds.has(event.dump.id)}
            onToggle={() => onToggleDump(event.dump.id)}
          />
        </div>
      );
    case "phase":
      return (
        <div className="logs-table__detail logs-table__detail--phase">
          <PhaseEventDetail
            phaseId={event.checkIn.phaseId}
            phaseLabel={event.checkIn.phaseLabel}
            phases={phases}
          />
        </div>
      );
    case "work-start":
    case "work-stop":
      return (
        <div className="logs-table__detail logs-table__detail--work">
          {taskTitle(tasks, event.stretch.taskId)}
        </div>
      );
  }
}
