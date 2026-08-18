import { useCallback, useEffect, useRef, useState } from "react";
import { closeCheckInPopup, logClientEvent } from "../lib/commands";
import { subscribeTauriEvent } from "../lib/tauriListen";
import CheckInForm from "./CheckInForm";
import "./CheckInPopup.css";

export async function resolvePopupOnce(
  resolved: { current: boolean },
  action: () => Promise<void>,
) {
  if (resolved.current) return;
  resolved.current = true;
  try {
    await action();
  } catch (error) {
    resolved.current = false;
    throw error;
  }
}

function CheckInPopup() {
  // Bumped on every summon so the form starts on the first pulse with fresh data.
  const [summonKey, setSummonKey] = useState(0);
  const resolvedRef = useRef(false);

  const resetSummon = () => {
    resolvedRef.current = false;
    setSummonKey((key) => key + 1);
  };

  const dismiss = useCallback(async () => {
    try {
      await resolvePopupOnce(resolvedRef, () => closeCheckInPopup(true));
    } catch (error) {
      await logClientEvent(
        `check_in_dismiss_failed error=${String(error)}`,
      ).catch(() => undefined);
    }
  }, []);

  const complete = useCallback(
    async (save: () => Promise<number | null>) => {
      await resolvePopupOnce(resolvedRef, async () => {
        await closeCheckInPopup(false, await save());
      });
    },
    [],
  );

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

  useEffect(() => {
    return subscribeTauriEvent("popup-dismiss-requested", dismiss);
  }, [dismiss]);

  return (
    <div className="checkin">
      <div className="checkin__body" key={summonKey}>
        <CheckInForm onDismiss={dismiss} onComplete={complete} />
      </div>
    </div>
  );
}

export default CheckInPopup;
