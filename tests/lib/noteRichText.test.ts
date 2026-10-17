import { describe, expect, it } from "vitest";
import {
  noteEditorHtmlToStorage,
  noteHtmlToPlainText,
  noteStorageToEditorHtml,
  isRichNoteHtml,
} from "../../src/lib/noteRichText";

describe("note rich text storage", () => {
  it("treats unmarked legacy content as body text", () => {
    const legacy = "Use <draft> wording";

    expect(isRichNoteHtml(legacy)).toBe(false);
    expect(noteStorageToEditorHtml(legacy)).toBe(
      "<p>Use &lt;draft&gt; wording</p>",
    );
    expect(noteHtmlToPlainText(legacy)).toBe(legacy);
  });

  it("keeps every saved list marker in plain-text exports", () => {
    const stored = noteEditorHtmlToStorage(
      "<ul><li><p>Milk</p></li><li><p>Eggs</p></li></ul>",
    );
    const checklist = noteEditorHtmlToStorage(
      '<ul data-type="taskList"><li data-checked="true" data-type="taskItem"><div><p>Milk</p></div></li><li data-checked="false" data-type="taskItem"><div><p>Eggs</p></div></li></ul>',
    );

    expect(isRichNoteHtml(stored)).toBe(true);
    expect(noteHtmlToPlainText(stored)).toBe("• Milk\n• Eggs");
    expect(noteHtmlToPlainText(checklist)).toBe("[x] Milk\n[ ] Eggs");
  });
});
