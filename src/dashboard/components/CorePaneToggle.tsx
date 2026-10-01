import { ViewToggle } from "./ViewToggle";
import { CORE_PANES, type CorePaneControls } from "../lib/corePane";

/** Switches the four Core panes. Each pane keeps its own head controls beside this. */
export function CorePaneToggle({ pane, onSelectPane }: CorePaneControls) {
  return (
    <ViewToggle
      value={pane}
      options={CORE_PANES}
      label="Core pane"
      onChange={onSelectPane}
    />
  );
}
