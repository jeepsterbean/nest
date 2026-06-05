import { useEffect, useRef, useState, type ComponentType } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
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

const modeIndexById = (id: string | null) => Math.max(0, MODES.findIndex((m) => m.id === id));

const modeIdFromHash = () => window.location.hash.split("/")[2] ?? null;

const hashForMode = (id: string) => (id === "metric" ? "#/popup" : `#/popup/${id}`);
const BLUR_DISMISS_GRACE_MS = 750;

function CheckInPopup() {
  const [modeIndex, setModeIndex] = useState(() => modeIndexById(modeIdFromHash()));
  // Bumped on every summon so the active mode remounts and starts clean.
  const [summonKey, setSummonKey] = useState(0);
  const modeIndexRef = useRef(modeIndex);
  const lastSummonedAtRef = useRef(Date.now());
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  const focusActiveTab = (index = modeIndexRef.current) => {
    requestAnimationFrame(() => tabRefs.current[index]?.focus());
  };

  const focusBodyStart = () => {
    requestAnimationFrame(() => {
      const first = bodyRef.current?.querySelector<HTMLElement>(
        '[tabindex="0"], button:not([disabled]):not([tabindex="-1"]), input:not([disabled]), textarea:not([disabled])',
      );
      first?.focus();
    });
  };

  useEffect(() => {
    modeIndexRef.current = modeIndex;
  }, [modeIndex]);

  const selectMode = (index: number) => {
    const next = MODES[index];
    if (!next) return;
    setModeIndex(index);
    if (window.location.hash !== hashForMode(next.id)) {
      window.location.hash = hashForMode(next.id);
    }
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
      focusActiveTab(modeIndex);
    }
  }, [modeIndex]);

  useEffect(() => {
    const onHashChange = () => {
      const nextIndex = modeIndexById(modeIdFromHash());
      lastSummonedAtRef.current = Date.now();
      setModeIndex(nextIndex);
      setSummonKey((k) => k + 1);
      focusActiveTab(nextIndex);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // Blur dismisses the popup. Each fresh summon remounts the active body (via
  // summonKey) so its form starts clean. In macOS fullscreen Spaces, a
  // non-activating NSPanel can briefly report focus loss immediately after it is
  // ordered front; ignore that bounce so the popup does not hide itself before
  // the user can see it.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    const popup = getCurrentWebviewWindow();
    popup
      .onFocusChanged(({ payload: focused }) => {
        if (focused) {
          lastSummonedAtRef.current = Date.now();
          setSummonKey((k) => k + 1);
          focusActiveTab();
        } else if (Date.now() - lastSummonedAtRef.current > BLUR_DISMISS_GRACE_MS) {
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
            selectMode((modeIndexRef.current - 1 + n) % n);
          } else if (key === "arrowright" || key === "d") {
            e.preventDefault();
            selectMode((modeIndexRef.current + 1) % n);
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
            onClick={() => selectMode(i)}
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
