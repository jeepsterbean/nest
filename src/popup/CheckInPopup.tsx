import { useCallback, useEffect, useRef, useState } from "react";
import { emit } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { logClientEvent, scheduleNextCheckIn } from "../lib/commands";
import CheckInForm from "./CheckInForm";
import "./CheckInPopup.css";

const BLUR_DISMISS_GRACE_MS = 750;
const DISMISS_INTERVAL_MINUTES = 5;
const isTimerSummon = () => window.location.hash.includes("source=timer");
const isMetricsSummon = () => window.location.hash.includes("step=metrics");

function CheckInPopup() {
  // Bumped on every summon so the form starts at the right step and reloads latest data.
  const [summonKey, setSummonKey] = useState(0);
  const [timerTriggered, setTimerTriggered] = useState(isTimerSummon);
  const [initialStep, setInitialStep] = useState<"inputs" | "metrics">(() =>
    isMetricsSummon() ? "metrics" : "inputs",
  );
  const lastSummonedAtRef = useRef(Date.now());
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const timerTriggeredRef = useRef(timerTriggered);
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
    const fromTimer = isTimerSummon();
    timerTriggeredRef.current = fromTimer;
    resolvedRef.current = false;
    setTimerTriggered(fromTimer);
    setInitialStep(isMetricsSummon() ? "metrics" : "inputs");
    lastSummonedAtRef.current = Date.now();
    setSummonKey((key) => key + 1);
    focusBodyStart();
  };

  const dismiss = useCallback(async () => {
    if (resolvedRef.current) return;
    resolvedRef.current = true;
    try {
      if (timerTriggeredRef.current) {
        await scheduleNextCheckIn(DISMISS_INTERVAL_MINUTES);
        await emit("check-in-submitted");
      }
    } catch (error) {
      await logClientEvent(
        `check_in_dismiss_schedule_failed error=${String(error)}`,
      ).catch(() => undefined);
    } finally {
      await getCurrentWebviewWindow().hide();
    }
  }, []);

  const timerStarted = useCallback(() => {
    timerTriggeredRef.current = false;
  }, []);

  const complete = useCallback(async () => {
    if (resolvedRef.current) return;
    resolvedRef.current = true;
    await emit("check-in-submitted").catch(() => undefined);
    await getCurrentWebviewWindow().hide();
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
        if (focused) {
          resetSummon();
        } else if (
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
          timerTriggered={timerTriggered}
          onDismiss={dismiss}
          onTimerStarted={timerStarted}
          onComplete={complete}
        />
      </div>
    </div>
  );
}

export default CheckInPopup;
