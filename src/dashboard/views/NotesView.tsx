import { NoteHistory } from "./NoteHistory";

export function NotesView({ sectionSidebar, visible }: {
  sectionSidebar: HTMLElement | null;
  visible: boolean;
}) {
  return (
    <section className="dash-section dash-section--note">
      <div className="note-section__pane">
        <NoteHistory sectionSidebar={sectionSidebar} visible={visible} />
      </div>
    </section>
  );
}
