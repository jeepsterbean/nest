import type { ReactNode } from "react";
import type { Metric, Phase, Task } from "../../../lib/types";
import type { RawLogEvent } from "../../lib/timeline";
import { BrainDumpEntry } from "./BrainDumpEntry";
import { MetricCheckInDetail } from "./MetricCheckInDetail";
import { PhaseEventDetail } from "./PhaseEventDetail";
import { taskTitle } from "../../lib/logs";

/** Event body beside the timeline mark, which already carries the event's icon. */
export function LogEventDetail({
  event,
  phases,
  metrics,
  tasks,
  expandedDumpIds,
  onDeleteCheckIn,
  onToggleDump,
}: {
  event: RawLogEvent;
  phases: Phase[];
  metrics: Metric[];
  tasks: Task[];
  expandedDumpIds: Set<number>;
  onDeleteCheckIn: (id: number) => void;
  onToggleDump: (id: number) => void;
}): ReactNode {
  switch (event.kind) {
    case "metrics":
      return (
        <div className="log-detail log-detail--metrics">
          <MetricCheckInDetail
            checkIn={event.checkIn}
            metrics={metrics}
            onDelete={onDeleteCheckIn}
          />
        </div>
      );
    case "dump":
      return (
        <div className="log-detail log-detail--dump">
          <BrainDumpEntry
            dump={event.dump}
            expanded={expandedDumpIds.has(event.dump.id)}
            onToggle={() => onToggleDump(event.dump.id)}
          />
        </div>
      );
    case "phase":
      return (
        <div className="log-detail log-detail--phase">
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
        <div className="log-detail log-detail--work">
          {taskTitle(tasks, event.stretch.taskId)}
        </div>
      );
  }
}
