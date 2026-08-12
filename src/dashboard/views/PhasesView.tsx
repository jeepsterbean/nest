import { useMemo, useState, type FormEvent } from "react";
import { createPhase, renamePhase, setPhaseActive } from "../../lib/commands";
import type { Phase } from "../../lib/types";
import { Switch } from "../components/Switch";
import { useDashboardData } from "../context/DashboardDataContext";
import { useInlineRename } from "../hooks/useInlineRename";

export function PhasesView() {
  const { phases, latestPhase, loaded, mutate } = useDashboardData();
  const [newPhaseName, setNewPhaseName] = useState("");
  const rename = useInlineRename({
    rename: renamePhase,
    isUnchanged: (id, next) => {
      const current = phases.find((p) => p.id === id);
      return current != null && current.name === next;
    },
    mutate,
  });

  const sortedPhases = useMemo(
    () =>
      [...phases].sort(
        (a, b) =>
          Number(a.inactiveSince !== null) - Number(b.inactiveSince !== null) ||
          a.createdAt - b.createdAt ||
          a.id - b.id,
      ),
    [phases],
  );

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    const name = newPhaseName.trim();
    if (!name) return;
    if (await mutate(() => createPhase(name))) setNewPhaseName("");
  };

  const onToggleActive = (p: Phase) =>
    void mutate(() => setPhaseActive(p.id, p.inactiveSince !== null));

  return (
    <section className="dash-section dash-section--phases">
      <header className="dash-section__head">
        <div className="dash-section__title">
          <h2>Phases</h2>
        </div>
        <form className="add-form" onSubmit={onCreate}>
          <input
            type="text"
            placeholder="New phase…"
            aria-label="New phase name"
            value={newPhaseName}
            onChange={(e) => setNewPhaseName(e.target.value)}
          />
          <button type="submit" disabled={!newPhaseName.trim()}>
            Add
          </button>
        </form>
      </header>
      {loaded && phases.length === 0 ? (
        <div className="dash-empty">
          <strong>No phases yet</strong>
          <span>Add one above to name the season you're in.</span>
        </div>
      ) : (
        <ul className="phase-list">
          {sortedPhases.map((p) => {
            const active = p.inactiveSince === null;
            const isCurrent = active && latestPhase?.phaseId === p.id;
            const classes = [
              "phase-card",
              active ? "" : "phase-card--inactive",
              isCurrent ? "phase-card--current" : "",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <li key={p.id} className={classes}>
                <span className="phase-card__dot" aria-hidden="true" />
                {rename.editingId === p.id ? (
                  <input
                    type="text"
                    className="rename-input"
                    value={rename.draft}
                    autoFocus
                    onChange={(e) => rename.setDraft(e.target.value)}
                    onBlur={rename.commit}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        rename.commit();
                      }
                      if (e.key === "Escape") rename.cancel();
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className="phase-card__name"
                    onClick={() => rename.start(p.id, p.name)}
                    title="Click to rename"
                  >
                    {p.name}
                  </button>
                )}
                {isCurrent && <span className="phase-card__now">Now</span>}
                <Switch
                  checked={active}
                  onChange={() => onToggleActive(p)}
                  label={`${p.name} active`}
                />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
