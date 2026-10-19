import type { Phase, Pulse, Task } from "../../../lib/types";
import { NestIcon } from "../PulseIcon";
import { phaseIcon, phaseName } from "../../lib/period";
import { taskStatusEventLabel, taskTitle } from "../../lib/logs";
import { TASK_UPDATE_LABEL, taskUpdateDetail } from "../../lib/taskUpdates";
import type { RawLogEvent } from "../../lib/timeline";
import { useTileIcons } from "../../hooks/useTileIcons";

/** What an event's timeline mark says to hover and to screen readers. */
export function logEventLabel(
  event: RawLogEvent,
  phases: Phase[],
  pulses: Pulse[],
  tasks: Task[],
) {
  switch (event.kind) {
    case "metrics": {
      const pulse =
        event.checkIn.pulseId === null
          ? undefined
          : pulses.find((item) => item.id === event.checkIn.pulseId);
      return pulse?.name ?? event.checkIn.pulseName ?? "Metric check-in";
    }
    case "note":
      return "Note";
    case "phase":
      return `${phaseName(event.checkIn.phaseId, phases, event.checkIn.phaseLabel)} phase`;
    case "task-edit": {
      const detail = taskUpdateDetail(event.editEvent.update);
      return `${taskTitle(tasks, event.editEvent.taskId)} — ${TASK_UPDATE_LABEL[event.editEvent.update.kind]}${detail === null ? "" : ` · ${detail}`}`;
    }
    case "task-status":
      return `${taskStatusEventLabel(event.statusEvent)} — ${taskTitle(tasks, event.statusEvent.taskId)}`;
    case "work-start":
      return `Started working on ${taskTitle(tasks, event.stretch.taskId)}`;
    case "work-stop":
      return `Paused — ${taskTitle(tasks, event.stretch.taskId)}`;
  }
}

/** The icon standing in for an event's name on Timeline rows. */
export function LogEventIcon({
  event,
  phases,
  pulses,
}: {
  event: RawLogEvent;
  phases: Phase[];
  pulses: Pulse[];
}) {
  switch (event.kind) {
    case "metrics": {
      const pulse =
        event.checkIn.pulseId === null
          ? undefined
          : pulses.find((item) => item.id === event.checkIn.pulseId);
      return <NestIcon name={pulse?.icon ?? "activity"} />;
    }
    case "note":
      return <NestIcon name="notes" />;
    case "phase":
      return (
        <NestIcon
          name={phaseIcon(event.checkIn.phaseId, phases, event.checkIn.phaseLabel)}
        />
      );
    case "task-edit":
    case "task-status":
    case "work-start":
    case "work-stop":
      return <TaskLogIcon />;
  }
}

export function TaskLogIcon() {
  const icons = useTileIcons();
  return <NestIcon name={icons.tasks} />;
}
