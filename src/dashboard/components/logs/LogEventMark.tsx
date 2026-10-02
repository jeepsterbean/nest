import type { Phase, Pulse, Task } from "../../../lib/types";
import { NestIcon } from "../PulseIcon";
import { phaseIcon, phaseName } from "../../lib/period";
import { taskStatusEventLabel, taskTitle } from "../../lib/logs";
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
    case "dump":
      return "Brain dump";
    case "phase":
      return `${phaseName(event.checkIn.phaseId, phases, event.checkIn.phaseLabel)} phase`;
    case "task-status":
      return `${taskStatusEventLabel(event.statusEvent)} — ${taskTitle(tasks, event.statusEvent.taskId)}`;
    case "work-start":
      return `Started working on ${taskTitle(tasks, event.stretch.taskId)}`;
    case "work-stop":
      return `Stopped working on ${taskTitle(tasks, event.stretch.taskId)}`;
  }
}

/** The icon standing in for an event's name on Logs timelines. */
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
    case "dump":
      return <NestIcon name="notes" />;
    case "phase":
      return (
        <NestIcon
          name={phaseIcon(event.checkIn.phaseId, phases, event.checkIn.phaseLabel)}
        />
      );
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
