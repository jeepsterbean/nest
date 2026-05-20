import { useEffect, useRef, useState, type ComponentType } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { listen } from "@tauri-apps/api/event";
import FocusCheckInPopup from "./FocusCheckInPopup";
import Popup from "./Popup";
import WorkPopup from "./WorkPopup";
import "./CheckInPopup.css";

type Mode = {
  id: string;
  label: string;
  Body: ComponentType;
};

// Ordered left → right. The first entry is the default shown on every summon.
// Add new modes here; `a` / `d` cycle through them (wrapping both ways).
const MODES: Mode[] = [
  { id: "metric", label: "Check-in", Body: Popup },
  { id: "work", label: "Work", Body: WorkPopup },
  { id: "focus", label: "Focus", Body: FocusCheckInPopup },
];

const modeIndexById = (id: string) => Math.max(0, MODES.findIndex((m) => m.id === id));

function CheckInPopup() {
  const [modeIndex, setModeIndex] = useState(0);
  // Bumped on every summon so the active mode remounts and starts clean.
  const [summonKey, setSummonKey] = useState(0);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  const focusActiveTab = () => {
    requestAnimationFrame(() => tabRefs.current[modeIndex]?.focus());
  };

  const focusBodyStart = () => {
    requestAnimationFrame(() => {
      const first = bodyRef.current?.querySelector<HTMLElement>(
        '[tabindex="0"], button:not([disabled]):not([tabindex="-1"]), input:not([disabled]), textarea:not([disabled])',
      );
      first?.focus();
    });
  };

  // Escape hides the popup.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        getCurrentWebviewWindow().hide();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (document.activeElement?.getAttribute("role") === "tab") {
      focusActiveTab();
    }
  }, [modeIndex]);

  // Automatic focus check-ins switch directly to the Focus mode before the
  // popup is shown by the backend timer.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen("focus-check-in-due", () => {
      setModeIndex(modeIndexById("focus"));
      setSummonKey((k) => k + 1);
      focusActiveTab();
    }).then((u) => {
      unlisten = u;
    });
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  // Blur dismisses the popup. Each fresh summon remounts the active body (via
  // summonKey) so its form starts clean.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    const popup = getCurrentWebviewWindow();
    popup
      .onFocusChanged(({ payload: focused }) => {
        if (focused) {
          setSummonKey((k) => k + 1);
          focusActiveTab();
        } else {
          popup.hide();
        }
      })
      .then((u) => {
        unlisten = u;
      });
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const active = MODES[modeIndex];
  const ActiveBody = active.Body;

  return (
    <div className="checkin">
      <nav
        className="checkin__tabs"
        role="tablist"
        aria-label="Check-in mode"
        onKeyDown={(e) => {
          const key = e.key.toLowerCase();
          const n = MODES.length;
          if (key === "arrowleft" || key === "a") {
            e.preventDefault();
            setModeIndex((i) => (i - 1 + n) % n);
          } else if (key === "arrowright" || key === "d") {
            e.preventDefault();
            setModeIndex((i) => (i + 1) % n);
          } else if (key === "arrowdown" || key === "s") {
            e.preventDefault();
            focusBodyStart();
          }
        }}
      >
        {MODES.map((m, i) => (
          <button
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            key={m.id}
            type="button"
            role="tab"
            aria-selected={i === modeIndex}
            className={`checkin__tab${i === modeIndex ? " checkin__tab--active" : ""}`}
            onClick={() => setModeIndex(i)}
            tabIndex={i === modeIndex ? 0 : -1}
          >
            {m.label}
          </button>
        ))}
      </nav>
      <div ref={bodyRef} className="checkin__body" key={`${active.id}-${summonKey}`}>
        <ActiveBody />
      </div>
    </div>
  );
}

export default CheckInPopup;
