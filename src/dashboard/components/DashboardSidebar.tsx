import { useAppSettings } from "../hooks/useAppSettings";
import { useTileIcons } from "../hooks/useTileIcons";
import { writeTileIcon, type ConfigurableIcon } from "../lib/tileIcons";
import { IconPickerButton, NestIcon } from "./PulseIcon";
import { SettingsControl } from "./SettingsOverlay";

export type DashboardView = "calendar" | "core";

const VIEWS: {
  key: DashboardView;
  label: string;
  icon: ConfigurableIcon;
}[] = [
  { key: "calendar", label: "Calendar", icon: "calendar" },
  { key: "core", label: "Core", icon: "core" },
];

export function DashboardSidebar({
  view,
  onSelectView,
}: {
  view: DashboardView;
  onSelectView: (view: DashboardView) => void;
}) {
  const tileIcons = useTileIcons();
  const chooseIcons = useAppSettings().iconSelection;

  return (
    <aside className="dash-sidebar">
      <nav className="dash-nav" aria-label="Dashboard sections">
        {VIEWS.map((item) => {
          const label = (
            <span className="dash-nav__label">{item.label}</span>
          );
          // First click selects the Section. The selected icon opens the picker
          // when Settings allows icon selection.
          if (view === item.key && chooseIcons) {
            return (
              <IconPickerButton
                key={item.key}
                controlClassName="dash-nav__picker"
                triggerClassName="dash-nav__btn dash-nav__btn--active"
                icon={tileIcons[item.icon]}
                label={item.label}
                title=""
                ariaLabel={`${item.label}, choose icon`}
                ariaCurrent="page"
                onChange={(nextIcon) => writeTileIcon(item.icon, nextIcon)}
              >
                {label}
              </IconPickerButton>
            );
          }
          return (
            <button
              key={item.key}
              type="button"
              className={`dash-nav__btn${view === item.key ? " dash-nav__btn--active" : ""}`}
              aria-label={item.label}
              aria-current={view === item.key ? "page" : undefined}
              onClick={() => onSelectView(item.key)}
            >
              <span className="dash-nav__icon">
                <NestIcon name={tileIcons[item.icon]} />
              </span>
              {label}
            </button>
          );
        })}
      </nav>
      <SettingsControl />
    </aside>
  );
}
