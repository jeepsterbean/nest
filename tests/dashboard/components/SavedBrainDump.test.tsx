import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { SavedBrainDump } from "../../../src/dashboard/components/SavedBrainDump";
import { brainDumpEditorHtmlToStorage } from "../../../src/lib/brainDumpRichText";

it("renders formatted history and tags with unfolded lists and no action controls", () => {
  const html = renderToStaticMarkup(<SavedBrainDump dump={{
    id: 1, createdAt: 1_800_000_000,
    text: brainDumpEditorHtmlToStorage("<details><summary>Thought</summary><div><p><strong>Remember this</strong></p></div></details>"),
    tags: [{ id: 2, name: "Personal" }],
  }} />);
  expect(html).toContain("<strong>Remember this</strong>");
  expect(html).toContain("Personal");
  expect(html).not.toMatch(/<(button|textarea|details|summary)\b|contenteditable/i);
});
