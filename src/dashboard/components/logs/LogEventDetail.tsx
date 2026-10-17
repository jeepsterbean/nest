import type { ReactNode } from "react";
import type { Metric, Phase, Task } from "../../../lib/types";
import type { RawLogEvent } from "../../lib/timeline";
import { NoteEntry } from "./NoteEntry";
import { MetricCheckInDetail } from "./MetricCheckInDetail";
import { PhaseEventDetail } from "./PhaseEventDetail";
import { TaskLogDetail } from "./TaskLogDetail";

/** Event body beside the timeline mark, which already carries the event's icon. */
export function LogEventDetail({
  event,
  phases,
  metrics,
  tasks,
  expandedNoteIds,
  onDeleteCheckIn,
  onToggleNote,
}: {
  event: RawLogEvent;
  phases: Phase[];
  metrics: Metric[];
  tasks: Task[];
  expandedNoteIds: Set<number>;
  onDeleteCheckIn: (id: number) => void;
  onToggleNote: (id: number) => void;
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
    case "note":
      return (
        <div className="log-detail log-detail--note">
          <NoteEntry
            note={event.note}
            expanded={expandedNoteIds.has(event.note.id)}
            onToggle={() => onToggleNote(event.note.id)}
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
    case "task-status":
    case "work-start":
    case "work-stop":
      return <TaskLogDetail event={event} tasks={tasks} />;
  }
}
