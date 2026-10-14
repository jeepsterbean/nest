import { useAppSettings } from "../hooks/useAppSettings";
import { useTileIcons } from "../hooks/useTileIcons";
import { IS_DEMO } from "../lib/demoMode";
import { SECTIONS, type Section } from "../lib/sections";
import { writeTileIcon } from "../lib/tileIcons";
import { IconPickerButton, NestIcon } from "./PulseIcon";
import { SettingsControl } from "./SettingsOverlay";

export function DashboardSidebar({
  section,
  onSelectSection,
}: {
  section: Section;
  onSelectSection: (section: Section) => void;
}) {
  const tileIcons = useTileIcons();
  const chooseIcons = useAppSettings().iconSelection && !IS_DEMO;

  return (
    <aside className="dash-sidebar">
      <nav className="dash-nav" aria-label="Dashboard sections">
        {SECTIONS.map((item) => {
          const label = (
            <span className="dash-nav__label">{item.label}</span>
          );
          // First click selects the Section. The selected icon opens the picker
          // when Settings allows icon selection.
          if (section === item.key && chooseIcons) {
            return (
              <IconPickerButton
                key={item.key}
                controlClassName="dash-nav__picker"
                triggerClassName="dash-nav__btn dash-nav__btn--active"
                icon={tileIcons[item.key]}
                label={item.label}
                title=""
                ariaLabel={`${item.label}, choose icon`}
                ariaCurrent="page"
                onChange={(nextIcon) => writeTileIcon(item.key, nextIcon)}
              >
                {label}
              </IconPickerButton>
            );
          }
          return (
            <button
              key={item.key}
              type="button"
              className={`dash-nav__btn${section === item.key ? " dash-nav__btn--active" : ""}`}
              aria-label={item.label}
              aria-current={section === item.key ? "page" : undefined}
              onClick={() => onSelectSection(item.key)}
            >
              <span className="dash-nav__icon">
                <NestIcon name={tileIcons[item.key]} />
              </span>
              {label}
            </button>
          );
        })}
      </nav>
      {!IS_DEMO && <SettingsControl />}
    </aside>
  );
}
