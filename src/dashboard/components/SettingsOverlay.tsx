import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAppSettings } from "../hooks/useAppSettings";
import { useDismiss } from "../hooks/useDismiss";
import { writeAppSettings } from "../lib/appSettings";
import { BackgroundView } from "../views/BackgroundView";
import { xIcon } from "./icons";
import { ViewToggle } from "./ViewToggle";
import { NestIcon } from "./PulseIcon";

const SETTINGS_PAGES = [
  { key: "background", label: "Background" },
  { key: "map", label: "Map" },
  { key: "workStretch", label: "Work stretch" },
  { key: "icons", label: "Icons" },
] as const;

type SettingsPage = (typeof SETTINGS_PAGES)[number]["key"];

const ON_OFF = [
  { key: "off", label: "Off" },
  { key: "on", label: "On" },
] as const;

function SettingsChoice({
  label,
  controlLabel,
  on,
  onChange,
}: {
  label: string;
  controlLabel: string;
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <div className="settings-choice">
      <span className="settings-choice__label">{label}</span>
      <ViewToggle
        value={on ? "on" : "off"}
        options={ON_OFF}
        label={controlLabel}
        onChange={(key) => onChange(key === "on")}
      />
    </div>
  );
}

export function SettingsDialog({
  id,
  page,
  onPage,
  onClose,
}: {
  id?: string;
  page: SettingsPage;
  onPage: (page: SettingsPage) => void;
  onClose: () => void;
}) {
  const settings = useAppSettings();
  const titleId = useId();
  const heading = SETTINGS_PAGES.find((item) => item.key === page)?.label ?? "Settings";
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const pressBeganOnScrimRef = useRef(false);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  // The scrim counts as inside, so this only handles Escape. A scrim press
  // closes on its click instead: closing on the press would remove the overlay
  // mid-click and hand the click to the dashboard control underneath.
  useDismiss(overlayRef, true, () => {
    onClose();
  });

  return (
    <div
      ref={overlayRef}
      className="settings-overlay"
      id={id}
      onPointerDown={(event) => {
        pressBeganOnScrimRef.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        // A drag that starts in the dialog and ends on the scrim also clicks here.
        if (event.target === event.currentTarget && pressBeganOnScrimRef.current) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <nav className="settings-nav" aria-label="Settings sections">
          <h2 className="settings-nav__title" id={titleId}>Settings</h2>
          {SETTINGS_PAGES.map((item) => (
            <button
              key={item.key}
              type="button"
              className="settings-nav__item"
              aria-current={page === item.key ? "page" : undefined}
              onClick={() => onPage(item.key)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="settings-dialog__main">
          <div className="settings-dialog__bar">
            <button
              type="button"
              className="settings-dialog__close"
              aria-label="Close settings"
              onClick={onClose}
            >
              {xIcon}
            </button>
          </div>
          <div className="settings-dialog__page">
            <h3 className="settings-dialog__heading">{heading}</h3>
            {page === "background" && <BackgroundView />}
            {page === "map" && (
              <SettingsChoice
                label="Show in Tasks"
                controlLabel="Show Map in Tasks"
                on={settings.showTaskMap}
                onChange={(on) => writeAppSettings({ showTaskMap: on })}
              />
            )}
            {page === "workStretch" && (
              <SettingsChoice
                label="Show in Calendar"
                controlLabel="Show Work stretch in Calendar"
                on={settings.showWorkStretch}
                onChange={(on) => writeAppSettings({ showWorkStretch: on })}
              />
            )}
            {page === "icons" && (
              <SettingsChoice
                label="Sidebar"
                controlLabel="Choose Sidebar icons"
                on={settings.iconSelection}
                onChange={(on) => writeAppSettings({ iconSelection: on })}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Settings is a preference, not a Section. The overlay covers the dashboard
 *  and leaves the rest of the window out of the tab order. */
export function SettingsControl() {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<SettingsPage>("background");
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const inertedRef = useRef<HTMLElement[]>([]);
  const panelId = useId();

  const releaseInert = () => {
    for (const child of inertedRef.current) child.removeAttribute("inert");
    inertedRef.current = [];
  };

  const close = () => {
    releaseInert();
    setOpen(false);
    buttonRef.current?.focus();
  };

  useEffect(() => {
    if (!open || !portalRoot) return;
    const inerted: HTMLElement[] = [];
    for (const child of portalRoot.children) {
      if (!(child instanceof HTMLElement)) continue;
      if (child.classList.contains("settings-overlay")) continue;
      if (child.hasAttribute("inert")) continue;
      child.setAttribute("inert", "");
      inerted.push(child);
    }
    inertedRef.current = inerted;
    return releaseInert;
  }, [open, portalRoot]);

  return (
    <div className="dash-settings">
      <button
        ref={buttonRef}
        type="button"
        className={`dash-nav__btn${open ? " dash-nav__btn--active" : ""}`}
        aria-label="Settings"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          const root = buttonRef.current?.closest(".dashboard");
          setPortalRoot(root instanceof HTMLElement ? root : document.body);
          setOpen(true);
        }}
      >
        <span className="dash-nav__icon">
          <NestIcon name="settings" />
        </span>
        <span className="dash-nav__label">Settings</span>
      </button>
      {open && portalRoot && createPortal(
        <SettingsDialog id={panelId} page={page} onPage={setPage} onClose={close} />,
        portalRoot,
      )}
    </div>
  );
}
