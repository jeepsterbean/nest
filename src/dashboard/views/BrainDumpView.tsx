import { useState } from "react";
import { ViewToggle } from "../components/ViewToggle";
import {
  BRAIN_DUMP_PANES,
  readBrainDumpPane,
  writeBrainDumpPane,
  type BrainDumpPane,
} from "../lib/brainDumpPane";
import { BrainDumpHistory } from "./BrainDumpHistory";
import { TagsView } from "./TagsView";

export function BrainDumpView() {
  const [pane, setPane] = useState<BrainDumpPane>(readBrainDumpPane);

  const selectPane = (key: BrainDumpPane) => {
    writeBrainDumpPane(key);
    setPane(key);
  };

  return (
    <section className="dash-section dash-section--brain-dump">
      <header className="dash-section__head">
        <div className="dash-toolbar">
          <ViewToggle
            value={pane}
            options={BRAIN_DUMP_PANES}
            label="Brain dump pane"
            onChange={selectPane}
          />
        </div>
      </header>
      {/* Keep panes mounted so History filters and an unsent Tag name survive switches. */}
      <div className="brain-dump-section__pane" hidden={pane !== "history"}>
        <BrainDumpHistory />
      </div>
      <div className="brain-dump-section__pane" hidden={pane !== "tags"}>
        <TagsView />
      </div>
    </section>
  );
}
