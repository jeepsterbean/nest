import { useDashboardData } from "../context/DashboardDataContext";

export function ErrorBanner() {
  const { error, setError } = useDashboardData();
  if (!error) return null;
  return (
    <div className="dashboard__error" role="alert">
      <span>{error}</span>
      <button
        type="button"
        onClick={() => setError(null)}
        aria-label="Dismiss error"
      >
        ×
      </button>
    </div>
  );
}
