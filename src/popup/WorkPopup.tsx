import { useEffect, useRef, useState } from "react";
import {
  getCurrentWebviewWindow,
  WebviewWindow,
} from "@tauri-apps/api/webviewWindow";
import { listPhases, submitPhaseCheckIn } from "../lib/commands";
import type { Phase } from "../lib/types";
import "./WorkPopup.css";

function WorkPopup() {
  const [phases, setPhases] = useState<Phase[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const phaseRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    listPhases(false)
      .then((nextPhases) => {
        setPhases(nextPhases);
        setError(null);
      })
      .catch((e) => setError(String(e)));
  }, []);

  const submit = async (phaseId: number) => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitPhaseCheckIn(phaseId);
      await getCurrentWebviewWindow().hide();
    } catch (e) {
      setError(String(e));
      setSubmitting(false);
    }
  };

  const openDashboard = async () => {
    const dashboard = await WebviewWindow.getByLabel("dashboard");
    if (dashboard) {
      await dashboard.show();
      await dashboard.setFocus();
    }
    await getCurrentWebviewWindow().hide();
  };

  if (phases === null) {
    return <div className="work-popup work-popup--loading">Loading…</div>;
  }

  if (phases.length === 0) {
    return (
      <div className="work-popup work-popup--empty">
        <p className="work-popup__question">No active phases.</p>
        <button
          type="button"
          className="work-popup__submit"
          onClick={openDashboard}
        >
          Open Dashboard
        </button>
        {error && <div className="work-popup__error">{error}</div>}
      </div>
    );
  }

  return (
    <div className="work-popup">
      <p className="work-popup__question">What phase are you in?</p>
      <div
        className="work-popup__choices"
        onKeyDown={(e) => {
          const key = e.key.toLowerCase();
          const activeIndex = phaseRefs.current.findIndex(
            (button) => button === document.activeElement,
          );
          if ((key === "arrowleft" || key === "a") && activeIndex > 0) {
            e.preventDefault();
            phaseRefs.current[activeIndex - 1]?.focus();
          } else if (
            (key === "arrowright" || key === "d") &&
            activeIndex >= 0 &&
            activeIndex < phases.length - 1
          ) {
            e.preventDefault();
            phaseRefs.current[activeIndex + 1]?.focus();
          }
        }}
      >
        {phases.map((phase, index) => (
          <button
            ref={(el) => {
              phaseRefs.current[index] = el;
            }}
            key={phase.id}
            type="button"
            className="work-popup__btn"
            onClick={() => submit(phase.id)}
            disabled={submitting}
          >
            {phase.name}
          </button>
        ))}
      </div>
      {error && <div className="work-popup__error">{error}</div>}
    </div>
  );
}

export default WorkPopup;
