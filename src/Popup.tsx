import { useEffect, useRef, useState } from "react";
import {
  getCurrentWebviewWindow,
  WebviewWindow,
} from "@tauri-apps/api/webviewWindow";
import { emit } from "@tauri-apps/api/event";
import { listMetrics, submitCheckIn } from "./commands";
import type { Metric, RatingInput, RatingValue } from "./types";
import "./Popup.css";

type RatingState = {
  value: RatingValue | null;
  note: string;
  noteOpen: boolean;
};

const emptyRating = (): RatingState => ({
  value: null,
  note: "",
  noteOpen: false,
});

function Popup() {
  const [metrics, setMetrics] = useState<Metric[] | null>(null);
  const [ratings, setRatings] = useState<Record<number, RatingState>>({});
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rowRefs = useRef<Array<HTMLDivElement | null>>([]);
  const noteRef = useRef<HTMLTextAreaElement | null>(null);

  // Refresh metrics + reset form state. Called on mount and every summon.
  const refresh = async () => {
    try {
      const m = await listMetrics(false);
      setMetrics(m);
      const init: Record<number, RatingState> = {};
      for (const metric of m) init[metric.id] = emptyRating();
      setRatings(init);
      setNote("");
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  };

  // Initial load
  useEffect(() => {
    refresh();
  }, []);

  // Focus the first rating row when metrics list updates
  useEffect(() => {
    if (metrics && metrics.length > 0) {
      rowRefs.current[0]?.focus();
    }
  }, [metrics]);

  const focusAfterRow = (idx: number) => {
    const next = rowRefs.current[idx + 1];
    if (next) next.focus();
    else noteRef.current?.focus();
  };

  // Escape hides the popup
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

  // Blur dismisses the popup; focus (next summon) refreshes state.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    const popup = getCurrentWebviewWindow();
    popup
      .onFocusChanged(({ payload: focused }) => {
        if (focused) refresh();
        else popup.hide();
      })
      .then((u) => {
        unlisten = u;
      });
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const setRating = (metricId: number, value: RatingValue) => {
    setRatings((prev) => ({
      ...prev,
      [metricId]: { ...prev[metricId], value },
    }));
  };

  const setRatingNote = (metricId: number, n: string) => {
    setRatings((prev) => ({
      ...prev,
      [metricId]: { ...prev[metricId], note: n },
    }));
  };

  const toggleNote = (metricId: number) => {
    setRatings((prev) => ({
      ...prev,
      [metricId]: { ...prev[metricId], noteOpen: !prev[metricId].noteOpen },
    }));
  };

  const resetForm = () => {
    setRatings((prev) => {
      const reset: Record<number, RatingState> = {};
      for (const id of Object.keys(prev)) reset[Number(id)] = emptyRating();
      return reset;
    });
    setNote("");
  };

  const hasAnyRating = Object.values(ratings).some((r) => r.value !== null);

  const submit = async () => {
    if (!hasAnyRating || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const ratingsInput: RatingInput[] = Object.entries(ratings)
        .filter(([, r]) => r.value !== null)
        .map(([id, r]) => ({
          metricId: Number(id),
          value: r.value as number,
          note: r.note.trim() || undefined,
        }));
      await submitCheckIn(ratingsInput, note.trim() || null);
      await emit("check-in-submitted");
      resetForm();
      await getCurrentWebviewWindow().hide();
    } catch (e) {
      setError(String(e));
    } finally {
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

  if (metrics === null) {
    return <div className="popup popup--loading">Loading…</div>;
  }

  if (metrics.length === 0) {
    return (
      <div className="popup popup--empty">
        <p className="popup__empty-title">No active metrics.</p>
        <p className="popup__empty-hint">Create one to start tracking.</p>
        <button
          type="button"
          className="popup__submit"
          onClick={openDashboard}
        >
          Open Dashboard
        </button>
      </div>
    );
  }

  return (
    <form
      className="popup"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="popup__metrics">
        {metrics.map((m, idx) => {
          const r = ratings[m.id] ?? emptyRating();
          return (
            <div className="rating-row" key={m.id}>
              <div className="rating-row__head">
                <span className="rating-row__name">{m.name}</span>
                <button
                  type="button"
                  className="rating-row__add-note"
                  onClick={() => toggleNote(m.id)}
                  aria-label={`Add note for ${m.name}`}
                  title="Add note"
                  tabIndex={-1}
                >
                  {r.noteOpen ? "−" : "+"}
                </button>
              </div>
              <div
                ref={(el) => {
                  rowRefs.current[idx] = el;
                }}
                className="rating-row__buttons"
                role="radiogroup"
                aria-label={m.name}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key >= "1" && e.key <= "5") {
                    e.preventDefault();
                    setRating(m.id, Number(e.key) as RatingValue);
                    focusAfterRow(idx);
                  }
                }}
              >
                {([1, 2, 3, 4, 5] as RatingValue[]).map((v) => (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={r.value === v}
                    className={`rating-btn${r.value === v ? " rating-btn--active" : ""}`}
                    onClick={() => setRating(m.id, v)}
                    tabIndex={-1}
                  >
                    {v}
                  </button>
                ))}
              </div>
              {r.noteOpen && (
                <input
                  type="text"
                  className="rating-row__note"
                  placeholder={`Note for ${m.name}…`}
                  value={r.note}
                  onChange={(e) => setRatingNote(m.id, e.target.value)}
                />
              )}
            </div>
          );
        })}
      </div>
      <textarea
        ref={noteRef}
        className="popup__note"
        placeholder="Optional note…  (Enter to submit, Shift+Enter for newline)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        rows={2}
      />
      {error && <div className="popup__error">{error}</div>}
      <button
        type="submit"
        className="popup__submit"
        disabled={!hasAnyRating || submitting}
      >
        {submitting ? "Saving…" : "Submit"}
      </button>
    </form>
  );
}

export default Popup;
