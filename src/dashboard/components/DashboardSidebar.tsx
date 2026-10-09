import { useCallback, useId, useRef, useState } from "react";
import { useDismiss } from "../hooks/useDismiss";
import { useTileIcons } from "../hooks/useTileIcons";
import { writeTileIcon, type ConfigurableIcon } from "../lib/tileIcons";
import { BackgroundView } from "../views/BackgroundView";
import { IconPickerButton, NestIcon } from "./PulseIcon";

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

  return (
    <aside className="dash-sidebar">
      <nav className="dash-nav" aria-label="Dashboard sections">
        {VIEWS.map((item) => {
          const label = (
            <span className="dash-nav__label">{item.label}</span>
          );
          // First click selects the Section. The selected icon opens the picker.
          if (view === item.key) {
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
              className="dash-nav__btn"
              aria-label={item.label}
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
      <BackgroundControl />
    </aside>
  );
}

/** Background is a preference, not a Section, so it opens beside the rail
 *  instead of replacing the content area. The panel follows the button in
 *  DOM order, so Tab moves from the button straight into its controls. */
export function BackgroundControl() {
  const [open, setOpen] = useState(false);
  const controlRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelId = useId();

  const close = useCallback((reason: "outside" | "escape") => {
    setOpen(false);
    // An outside press already moved focus where the person meant it to go.
    if (reason === "escape") buttonRef.current?.focus();
  }, []);
  useDismiss(controlRef, open, close);

  return (
    <div className="dash-background" ref={controlRef}>
      <button
        ref={buttonRef}
        type="button"
        className={`dash-nav__btn${open ? " dash-nav__btn--active" : ""}`}
        aria-label="Background"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="dash-nav__icon">
          <NestIcon name="palette" />
        </span>
        {!open && <span className="dash-nav__label">Background</span>}
      </button>
      {open && (
        <div
          id={panelId}
          className="dash-background__panel"
          role="dialog"
          aria-label="Background"
        >
          <BackgroundView />
        </div>
      )}
    </div>
  );
}
