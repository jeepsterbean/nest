import { CORE_PANES, type CorePane, type CorePaneControls } from "../lib/corePane";
import { useTileIcons } from "../hooks/useTileIcons";
import { writeTileIcon } from "../lib/tileIcons";
import { IconPickerButton, NestIcon } from "./PulseIcon";

/** Matches the Logs kind colors so a pane reads the same everywhere. */
const PANE_TONE_CLASS: Record<CorePane, string> = {
  brainDump: "core-nav__button--brain-dump",
  tasks: "core-nav__button--tasks",
  metrics: "core-nav__button--metrics",
  phases: "core-nav__button--phases",
};

export function CorePaneSidebar({ pane, onSelectPane }: CorePaneControls) {
  const icons = useTileIcons();

  return (
    <aside className="core-sidebar">
      <h2 className="core-sidebar__title" id="core-sidebar-title">
        Core
      </h2>
      <nav className="core-nav" aria-labelledby="core-sidebar-title">
        {CORE_PANES.map((item) => {
          const buttonClass = `core-nav__button ${PANE_TONE_CLASS[item.key]}`;
          const label = <span className="core-nav__label">{item.label}</span>;
          if (pane === item.key) {
            return (
              <IconPickerButton
                key={item.key}
                controlClassName="core-nav__picker"
                triggerClassName={`${buttonClass} core-nav__button--active`}
                icon={icons[item.key]}
                label={item.label}
                title={`${item.label} · click to change icon`}
                ariaLabel={`${item.label}, choose icon`}
                ariaCurrent="page"
                onChange={(icon) => writeTileIcon(item.key, icon)}
              >
                {label}
              </IconPickerButton>
            );
          }
          return (
            <button
              key={item.key}
              type="button"
              className={buttonClass}
              aria-label={item.label}
              title={item.label}
              onClick={() => onSelectPane(item.key)}
            >
              <NestIcon name={icons[item.key]} />
              {label}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
