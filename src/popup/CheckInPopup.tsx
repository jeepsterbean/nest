import { useEffect, useRef, useState } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import CheckInForm from "./CheckInForm";
import "./CheckInPopup.css";

const BLUR_DISMISS_GRACE_MS = 750;

function CheckInPopup() {
  // Bumped on every summon so the form starts at step 1 and reloads latest data.
  const [summonKey, setSummonKey] = useState(0);
  const lastSummonedAtRef = useRef(Date.now());
  const bodyRef = useRef<HTMLDivElement | null>(null);

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
    const onHashChange = () => {
      lastSummonedAtRef.current = Date.now();
      setSummonKey((k) => k + 1);
      focusBodyStart();
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
          focusBodyStart();
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

  return (
    <div className="checkin">
      <div ref={bodyRef} className="checkin__body" key={summonKey}>
        <CheckInForm />
      </div>
    </div>
  );
}

export default CheckInPopup;
