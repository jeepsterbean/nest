import { describe, expect, it } from "vitest";
import {
  brainDumpEditorHtmlToStorage,
  brainDumpHtmlToPlainText,
  brainDumpStorageToEditorHtml,
  isRichBrainDumpHtml,
} from "../../src/lib/brainDumpRichText";

describe("brain dump rich text storage", () => {
  it("treats unmarked legacy content as body text", () => {
    const legacy = "Use <draft> wording";

    expect(isRichBrainDumpHtml(legacy)).toBe(false);
    expect(brainDumpStorageToEditorHtml(legacy)).toBe(
      "<p>Use &lt;draft&gt; wording</p>",
    );
    expect(brainDumpHtmlToPlainText(legacy)).toBe(legacy);
  });

  it("keeps every saved list marker in plain-text exports", () => {
    const stored = brainDumpEditorHtmlToStorage(
      "<ul><li><p>Milk</p></li><li><p>Eggs</p></li></ul>",
    );
    const checklist = brainDumpEditorHtmlToStorage(
      '<ul data-type="taskList"><li data-checked="true" data-type="taskItem"><div><p>Milk</p></div></li><li data-checked="false" data-type="taskItem"><div><p>Eggs</p></div></li></ul>',
    );

    expect(isRichBrainDumpHtml(stored)).toBe(true);
    expect(brainDumpHtmlToPlainText(stored)).toBe("• Milk\n• Eggs");
    expect(brainDumpHtmlToPlainText(checklist)).toBe("[x] Milk\n[ ] Eggs");
  });
});
