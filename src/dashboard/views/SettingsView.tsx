import { useState } from "react";
import { ViewToggle } from "../components/ViewToggle";
import {
  readSettingsPane,
  SETTINGS_PANES,
  writeSettingsPane,
  type SettingsPane,
} from "../lib/settings";
import { MetricsView } from "./MetricsView";
import { PhasesView } from "./PhasesView";
import { RemindersView } from "./RemindersView";
import { TagsView } from "./TagsView";

export function SettingsView() {
  const [pane, setPane] = useState<SettingsPane>(readSettingsPane);

  const selectPane = (key: SettingsPane) => {
    writeSettingsPane(key);
    setPane(key);
  };

  return (
    <section className="dash-section dash-section--settings">
      <header className="dash-section__head">
        <ViewToggle
          value={pane}
          options={SETTINGS_PANES}
          label="Settings pane"
          onChange={selectPane}
        />
      </header>
      {/* Keep panes mounted so Metrics sub-state survives pane switches. */}
      <div className="settings-slot" hidden={pane !== "metrics"}>
        <MetricsView />
      </div>
      <div className="settings-slot" hidden={pane !== "phases"}>
        <PhasesView />
      </div>
      <div className="settings-slot" hidden={pane !== "tags"}>
        <TagsView />
      </div>
      <div className="settings-slot" hidden={pane !== "reminders"}>
        <RemindersView />
      </div>
    </section>
  );
}
