import { CORE_PANES, type CorePane, type CorePaneControls } from "../lib/corePane";
import { useTileIcons } from "../hooks/useTileIcons";
import { writeTileIcon } from "../lib/tileIcons";
import { IconPickerButton, NestIcon } from "./PulseIcon";

/** Matches the Logs kind colors so a pane reads the same everywhere. */
const PANE_TONE_CLASS: Record<CorePane, string> = {
  brainDump: "section-nav__button--brain-dump",
  tasks: "section-nav__button--tasks",
  metrics: "section-nav__button--metrics",
  phases: "section-nav__button--phases",
};

export function CorePaneSidebar({ pane, onSelectPane }: CorePaneControls) {
  const icons = useTileIcons();

  return (
    <aside className="section-sidebar">
      <h2 className="section-sidebar__title" id="section-sidebar-title">
        Core
      </h2>
      <nav className="section-nav" aria-labelledby="section-sidebar-title">
        {CORE_PANES.map((item) => {
          const buttonClass = `section-nav__button ${PANE_TONE_CLASS[item.key]}`;
          const label = <span className="section-nav__label">{item.label}</span>;
          if (pane === item.key) {
            return (
              <IconPickerButton
                key={item.key}
                controlClassName="section-nav__picker"
                triggerClassName={`${buttonClass} section-nav__button--active`}
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
