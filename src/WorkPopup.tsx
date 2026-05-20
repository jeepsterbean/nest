import { useEffect, useRef, useState } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { submitWorkCheckIn } from "./commands";
import "./WorkPopup.css";

type Step = "ask" | "blocker";

function WorkPopup() {
  const [step, setStep] = useState<Step>("ask");
  const [blocker, setBlocker] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const yesRef = useRef<HTMLButtonElement | null>(null);
  const blockerRef = useRef<HTMLTextAreaElement | null>(null);

  // Keep focus with the form after the user advances past the first step.
  useEffect(() => {
    if (step === "blocker") blockerRef.current?.focus();
  }, [step]);

  const submit = async (working: boolean, blockerText: string | null) => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitWorkCheckIn(working, blockerText);
      await getCurrentWebviewWindow().hide();
    } catch (e) {
      setError(String(e));
      setSubmitting(false);
    }
  };

  const onYes = () => submit(true, null);
  const onNo = () => setStep("blocker");

  const onBlockerSubmit = () => {
    const trimmed = blocker.trim();
    if (!trimmed) return;
    submit(false, trimmed);
  };

  return (
    <div className="work-popup">
      {step === "ask" ? (
        <>
          <p className="work-popup__question">Are you working?</p>
          <div
            className="work-popup__choices"
            onKeyDown={(e) => {
              const key = e.key.toLowerCase();
              if (key === "y" || key === "arrowleft" || key === "a") {
                e.preventDefault();
                e.stopPropagation();
                onYes();
              } else if (key === "n" || key === "arrowright" || key === "d") {
                e.preventDefault();
                e.stopPropagation();
                onNo();
              }
            }}
          >
            <button
              ref={yesRef}
              type="button"
              className="work-popup__btn work-popup__btn--yes"
              onClick={onYes}
              disabled={submitting}
            >
              Yes
            </button>
            <button
              type="button"
              className="work-popup__btn work-popup__btn--no"
              onClick={onNo}
              disabled={submitting}
            >
              No
            </button>
          </div>
        </>
      ) : (
        <form
          className="work-popup__blocker"
          onSubmit={(e) => {
            e.preventDefault();
            onBlockerSubmit();
          }}
        >
          <label className="work-popup__question" htmlFor="work-blocker">
            What is stopping you?
          </label>
          <textarea
            id="work-blocker"
            ref={blockerRef}
            className="work-popup__input"
            value={blocker}
            onChange={(e) => setBlocker(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onBlockerSubmit();
              }
            }}
            rows={2}
            placeholder="(Enter to submit, Shift+Enter for newline)"
          />
          <button
            type="submit"
            className="work-popup__submit"
            disabled={!blocker.trim() || submitting}
          >
            {submitting ? "Saving…" : "Submit"}
          </button>
        </form>
      )}
      {error && <div className="work-popup__error">{error}</div>}
    </div>
  );
}

export default WorkPopup;
