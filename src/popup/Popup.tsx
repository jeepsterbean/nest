import { useCallback, useEffect, useRef, useState } from "react";
import { closePopup, logClientEvent } from "../lib/commands";
import { subscribeTauriEvent } from "../lib/tauriListen";
import PopupContent from "./PopupContent";
import "./Popup.css";

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

function Popup() {
  // Bumped on every summon so the form starts on the first pulse with fresh data.
  const [summonKey, setSummonKey] = useState(0);
  const resolvedRef = useRef(false);

  const resetSummon = () => {
    resolvedRef.current = false;
    setSummonKey((key) => key + 1);
  };

  const dismiss = useCallback(async () => {
    try {
      await resolvePopupOnce(resolvedRef, () => closePopup(true));
    } catch (error) {
      await logClientEvent(
        `popup_dismiss_failed error=${String(error)}`,
      ).catch(() => undefined);
    }
  }, []);

  const complete = useCallback(
    async (save: () => Promise<number | null>) => {
      await resolvePopupOnce(resolvedRef, async () => {
        await closePopup(false, await save());
      });
    },
    [],
  );

  // Escape dismisses a due popup onto the five-minute fallback cadence.
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
    <div className="popup">
      <div className="popup__body" key={summonKey}>
        <PopupContent onDismiss={dismiss} onComplete={complete} />
      </div>
    </div>
  );
}

export default Popup;
