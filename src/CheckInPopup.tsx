import { useEffect, useState, type ComponentType } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
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
];

function CheckInPopup() {
  const [modeIndex, setModeIndex] = useState(0);
  // Bumped on every summon so the active mode remounts and starts clean.
  const [summonKey, setSummonKey] = useState(0);

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

  // `a` / `d` cycle modes (left / right), wrapping in both directions.
  // Suppressed while a text field is focused so the keys type normally there.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const t = e.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) {
        return;
      }
      const n = MODES.length;
      if (e.key === "a" || e.key === "A") {
        e.preventDefault();
        setModeIndex((i) => (i - 1 + n) % n);
      } else if (e.key === "d" || e.key === "D") {
        e.preventDefault();
        setModeIndex((i) => (i + 1) % n);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Blur dismisses the popup. Each fresh summon resets to the default mode and
  // remounts the active body (via summonKey) so its form starts clean.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    const popup = getCurrentWebviewWindow();
    popup
      .onFocusChanged(({ payload: focused }) => {
        if (focused) {
          setModeIndex(0);
          setSummonKey((k) => k + 1);
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
      <nav className="checkin__tabs" role="tablist" aria-label="Check-in mode">
        {MODES.map((m, i) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={i === modeIndex}
            className={`checkin__tab${i === modeIndex ? " checkin__tab--active" : ""}`}
            onClick={() => setModeIndex(i)}
            tabIndex={-1}
          >
            {m.label}
          </button>
        ))}
      </nav>
      <div className="checkin__body" key={`${active.id}-${summonKey}`}>
        <ActiveBody />
      </div>
    </div>
  );
}

export default CheckInPopup;
