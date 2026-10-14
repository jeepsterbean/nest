import { BrainDumpHistory } from "./BrainDumpHistory";

export function BrainDumpView({ sectionSidebar, visible }: {
  sectionSidebar: HTMLElement | null;
  visible: boolean;
}) {
  return (
    <section className="dash-section dash-section--brain-dump">
      <div className="brain-dump-section__pane">
        <BrainDumpHistory sectionSidebar={sectionSidebar} visible={visible} />
      </div>
    </section>
  );
}
