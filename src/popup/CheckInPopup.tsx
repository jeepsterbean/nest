import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { closeCheckInPopup, logClientEvent } from "../lib/commands";
import CheckInForm from "./CheckInForm";
import "./CheckInPopup.css";

const BLUR_DISMISS_GRACE_MS = 2_000;
const isMetricsSummon = () => window.location.hash.includes("step=metrics");

function CheckInPopup() {
  // Bumped on every summon so the form starts at the right step and reloads latest data.
  const [summonKey, setSummonKey] = useState(0);
  const [initialStep, setInitialStep] = useState<"inputs" | "metrics">(() =>
    isMetricsSummon() ? "metrics" : "inputs",
  );
  const lastSummonedAtRef = useRef(Date.now());
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const resolvedRef = useRef(false);

  const focusBodyStart = () => {
    requestAnimationFrame(() => {
      const first = bodyRef.current?.querySelector<HTMLElement>(
        '[tabindex="0"], button:not([disabled]):not([tabindex="-1"]), input:not([disabled]), textarea:not([disabled])',
      );
      first?.focus();
    });
  };

  const resetSummon = () => {
    resolvedRef.current = false;
    setInitialStep(isMetricsSummon() ? "metrics" : "inputs");
    lastSummonedAtRef.current = Date.now();
    setSummonKey((key) => key + 1);
    focusBodyStart();
  };

  const dismiss = useCallback(async () => {
    if (resolvedRef.current) return;
    resolvedRef.current = true;
    try {
      await closeCheckInPopup(true);
    } catch (error) {
      resolvedRef.current = false;
      await logClientEvent(
        `check_in_dismiss_failed error=${String(error)}`,
      ).catch(() => undefined);
    }
  }, []);

  const complete = useCallback(async (minutes: number | null) => {
    if (resolvedRef.current) return;
    resolvedRef.current = true;
    try {
      await closeCheckInPopup(false, minutes);
    } catch (error) {
      resolvedRef.current = false;
      throw error;
    }
  }, []);

  // Escape dismisses a due check-in onto the five-minute fallback cadence.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        void dismiss();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [dismiss]);

  useEffect(() => {
    const onHashChange = () => {
      resetSummon();
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
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    const popup = getCurrentWebviewWindow();
    popup
      .onFocusChanged(({ payload: focused }) => {
        if (
          !focused &&
          Date.now() - lastSummonedAtRef.current >
            BLUR_DISMISS_GRACE_MS
        ) {
          void dismiss();
        }
      })
      .then((u) => {
        if (cancelled) u();
        else unlisten = u;
      });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [dismiss]);

  return (
    <div className="checkin">
      <div ref={bodyRef} className="checkin__body" key={summonKey}>
        <CheckInForm
          initialStep={initialStep}
          onDismiss={dismiss}
          onComplete={complete}
        />
      </div>
    </div>
  );
}

export default CheckInPopup;
