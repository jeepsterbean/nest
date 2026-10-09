import type { CorePaneControls } from "../lib/corePane";
import { BrainDumpView } from "./BrainDumpView";
import { MetricsView } from "./MetricsView";
import { PhasesView } from "./PhasesView";
import { TasksView } from "./TasksView";

/** One Section for Brain dump, Tasks, Metrics, and Phases. Panes stay mounted
 *  so filters, selection, and unsent names survive switches. */
export function CoreView({ pane }: Pick<CorePaneControls, "pane">) {
  return (
    <>
      <div className="core-slot" hidden={pane !== "brainDump"}>
        <BrainDumpView />
      </div>
      <div className="core-slot" hidden={pane !== "tasks"}>
        <TasksView pane={pane} />
      </div>
      <div className="core-slot" hidden={pane !== "metrics"}>
        <MetricsView />
      </div>
      <div className="core-slot" hidden={pane !== "phases"}>
        <PhasesView />
      </div>
    </>
  );
}
