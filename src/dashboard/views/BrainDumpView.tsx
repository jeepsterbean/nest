import { useState } from "react";
import { CorePaneToggle } from "../components/CorePaneToggle";
import { IconPickerButton } from "../components/PulseIcon";
import { ViewToggle } from "../components/ViewToggle";
import { useTileIcons } from "../hooks/useTileIcons";
import {
  BRAIN_DUMP_PANES,
  readBrainDumpPane,
  writeBrainDumpPane,
  type BrainDumpPane,
} from "../lib/brainDumpPane";
import { TILE_LABELS } from "../lib/overviewGrid";
import type { CorePaneControls } from "../lib/corePane";
import { writeTileIcon } from "../lib/tileIcons";
import { BrainDumpHistory } from "./BrainDumpHistory";
import { TagsView } from "./TagsView";

export function BrainDumpView({ pane: corePane, onSelectPane }: CorePaneControls) {
  const [pane, setPane] = useState<BrainDumpPane>(readBrainDumpPane);
  const icons = useTileIcons();

  const selectPane = (key: BrainDumpPane) => {
    writeBrainDumpPane(key);
    setPane(key);
  };

  return (
    <section className="dash-section dash-section--brain-dump">
      <header className="dash-section__head">
        <div className="dash-toolbar">
          <CorePaneToggle pane={corePane} onSelectPane={onSelectPane} />
          <ViewToggle
            value={pane}
            options={BRAIN_DUMP_PANES}
            label="Brain dump pane"
            onChange={selectPane}
          />
        </div>
        <IconPickerButton
          className="dash-section__tile-icon"
          icon={icons.brainDump}
          label={`${TILE_LABELS.brainDump} tile`}
          onChange={(nextIcon) => writeTileIcon("brainDump", nextIcon)}
        />
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
