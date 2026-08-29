import type { Metric, Phase, Pulse, Task } from "../../lib/types";
import { formatDateTime } from "../lib/time";
import type { RawLogEvent } from "../lib/timeline";
import { LOG_TYPE_LABEL, LogEventDetail } from "../components/logs/LogEventDetail";

export { LOG_TYPE_LABEL, LogEventDetail };

export function LogsRawTable({
  events,
  phases,
  metrics,
  pulses,
  tasks,
  expandedDumpIds,
  onDeleteCheckIn,
  onToggleDump,
}: {
  events: RawLogEvent[];
  phases: Phase[];
  metrics: Metric[];
  pulses: Pulse[];
  tasks: Task[];
  expandedDumpIds: Set<number>;
  onDeleteCheckIn: (id: number) => void;
  onToggleDump: (id: number) => void;
}) {
  return (
    <div className="logs-table-wrap">
      <table className="logs-table">
        <thead>
          <tr>
            <th className="logs-table__col logs-table__col--when">When</th>
            <th className="logs-table__col logs-table__col--type">Type</th>
            <th className="logs-table__col logs-table__col--detail">Detail</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => {
            const key =
              event.kind === "metrics"
                ? `metrics-${event.checkIn.id}`
                : event.kind === "dump"
                  ? `dump-${event.dump.id}`
                  : event.kind === "phase"
                    ? `phase-${event.checkIn.id}`
                    : `${event.kind}-${event.stretch.id}`;
            return (
              <tr key={key} className={`logs-table__row logs-table__row--${event.kind}`}>
                <td className="logs-table__col logs-table__col--when">
                  <time dateTime={new Date(event.at * 1000).toISOString()}>
                    {formatDateTime(event.at)}
                  </time>
                </td>
                <td className="logs-table__col logs-table__col--type">
                  {LOG_TYPE_LABEL[event.kind]}
                </td>
                <td className="logs-table__col logs-table__col--detail">
                  <LogEventDetail
                    event={event}
                    phases={phases}
                    metrics={metrics}
                    pulses={pulses}
                    tasks={tasks}
                    expandedDumpIds={expandedDumpIds}
                    onDeleteCheckIn={onDeleteCheckIn}
                    onToggleDump={onToggleDump}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
