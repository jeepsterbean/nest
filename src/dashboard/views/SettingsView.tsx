import { useState } from "react";
import { ViewToggle } from "../components/ViewToggle";
import {
  readSettingsPane,
  SETTINGS_PANES,
  writeSettingsPane,
  type SettingsPane,
} from "../lib/settings";
import { BackgroundView } from "./BackgroundView";
import { RemindersView } from "./RemindersView";
import { AssistantSettings } from "./AssistantSettings";

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
      {/* Keep panes mounted so Assistant drafts survive switches. */}
      <div className="settings-slot" hidden={pane !== "assistant"}>
        <AssistantSettings />
      </div>
      <div className="settings-slot" hidden={pane !== "reminders"}>
        <RemindersView />
      </div>
      <div className="settings-slot" hidden={pane !== "background"}>
        <BackgroundView />
      </div>
    </section>
  );
}
