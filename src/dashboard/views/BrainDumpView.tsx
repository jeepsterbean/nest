import { BrainDumpHistory } from "./BrainDumpHistory";

export function BrainDumpView() {
  return (
    <section className="dash-section dash-section--brain-dump">
      <div className="brain-dump-section__pane">
        <BrainDumpHistory />
      </div>
    </section>
  );
}
