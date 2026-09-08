import { Editor, Extension } from "@tiptap/core";
import { Details, DetailsContent, DetailsSummary } from "@tiptap/extension-details";
import {
  TaskItem,
  TaskList,
} from "@tiptap/extension-list";
export const BRAIN_DUMP_FONT_SIZE_OPTIONS = [
  { value: "12.6px", label: "Body" },
  { value: "18px", label: "H2" },
  { value: "24px", label: "H1" },
] as const;
export const BRAIN_DUMP_DEFAULT_FONT_SIZE = "12.6px";

const BRAIN_DUMP_RICH_TEXT_PREFIX = "<!--nest-rich-text:v1-->";
const BRAIN_DUMP_ALLOWED_FONT_SIZES = BRAIN_DUMP_FONT_SIZE_OPTIONS.map(
  (option) => option.value,
);
const BRAIN_DUMP_ROW_NODE_TYPES = new Set(["paragraph", "detailsSummary"]);
/** Every tag the editor schema can serialize. Anything else is stray markup. */
const BRAIN_DUMP_ALLOWED_TAGS = new Set([
  "P", "BR", "STRONG", "B", "EM", "I", "U", "S",
  "UL", "OL", "LI", "DIV", "SPAN", "LABEL", "INPUT",
  "DETAILS", "SUMMARY",
]);
const BRAIN_DUMP_DROPPED_TAGS = new Set([
  "SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "TEMPLATE",
]);

export type BrainDumpListVariant = "toggle" | "task" | "bullet" | "ordered";

function normalizeBrainDumpFontSize(value: string | null | undefined) {
  if (!value) return null;
  const numeric = Number.parseFloat(value);
  if (!Number.isFinite(numeric)) return null;
  let best = BRAIN_DUMP_ALLOWED_FONT_SIZES[0] ?? BRAIN_DUMP_DEFAULT_FONT_SIZE;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const option of BRAIN_DUMP_ALLOWED_FONT_SIZES) {
    const distance = Math.abs(Number.parseFloat(option) - numeric);
    if (distance < bestDistance) {
      best = option;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Body is the surface's CSS default, so it is stored as the absence of a size.
 * Emitting it as an inline style instead would make the editor's own HTML
 * disagree with the normalized storage form, and every keystroke would then
 * replace the whole document under the caret.
 */
function explicitBrainDumpFontSize(value: string | null | undefined) {
  const normalized = normalizeBrainDumpFontSize(value);
  return normalized === BRAIN_DUMP_DEFAULT_FONT_SIZE ? null : normalized;
}

function isBrainDumpRowSelectionSingle(editor: Editor) {
  const { selection } = editor.state;
  return selection.$from.sameParent(selection.$to);
}

function selectedBrainDumpRowRanges(editor: Editor) {
  const ranges = new Map<number, { pos: number; type: string; attrs: Record<string, unknown> }>();
  editor.state.doc.nodesBetween(editor.state.selection.from, editor.state.selection.to, (node, pos) => {
    if (!BRAIN_DUMP_ROW_NODE_TYPES.has(node.type.name)) return;
    ranges.set(pos, { pos, type: node.type.name, attrs: node.attrs });
  });
  if (ranges.size > 0) return Array.from(ranges.values());
  const parent = editor.state.selection.$from.parent;
  if (!BRAIN_DUMP_ROW_NODE_TYPES.has(parent.type.name)) return [];
  return [
    {
      pos: editor.state.selection.$from.before(),
      type: parent.type.name,
      attrs: parent.attrs,
    },
  ];
}

function setBrainDumpRowFontSize(editor: Editor, fontSize: string | null) {
  const normalized = fontSize ? explicitBrainDumpFontSize(fontSize) : null;
  const rows = selectedBrainDumpRowRanges(editor);
  if (rows.length === 0) return false;
  const { state } = editor;
  let tr = state.tr;
  let changed = false;
  for (const row of rows) {
    const nextAttrs =
      normalized == null ? { ...row.attrs, fontSize: null } : { ...row.attrs, fontSize: normalized };
    tr = tr.setNodeMarkup(row.pos, undefined, nextAttrs);
    changed = true;
  }
  if (!changed) return false;
  editor.view.dispatch(tr);
  editor.commands.focus();
  return true;
}

export function selectedBrainDumpFontSize(editor: Editor | null | undefined) {
  if (!editor) return BRAIN_DUMP_DEFAULT_FONT_SIZE;
  const parent = editor.state.selection.$from.parent;
  if (!BRAIN_DUMP_ROW_NODE_TYPES.has(parent.type.name)) return BRAIN_DUMP_DEFAULT_FONT_SIZE;
  return normalizeBrainDumpFontSize(parent.attrs.fontSize) ?? BRAIN_DUMP_DEFAULT_FONT_SIZE;
}

export function applyBrainDumpFontSize(
  editor: Editor,
  fontSize: string = BRAIN_DUMP_DEFAULT_FONT_SIZE,
) {
  return setBrainDumpRowFontSize(editor, fontSize);
}

export function resetBrainDumpFontSize(editor: Editor) {
  return setBrainDumpRowFontSize(editor, null);
}

function applyToggleList(editor: Editor) {
  if (editor.isActive("details")) {
    editor.chain().focus().unsetDetails().run();
    return;
  }
  const { selection } = editor.state;
  if (!isBrainDumpRowSelectionSingle(editor)) return;
  const block = selection.$from.parent;
  if (!block.isTextblock || block.type.name !== "paragraph") return;
  const from = selection.$from.before();
  const to = from + block.nodeSize;
  const summaryContent = block.toJSON().content;
  editor
    .chain()
    .insertContentAt(
      { from, to },
      {
        type: "details",
        attrs: { open: true },
        content: [
          {
            type: "detailsSummary",
            content: summaryContent,
          },
          {
            type: "detailsContent",
            content: [{ type: "paragraph" }],
          },
        ],
      },
    )
    .setTextSelection(from + 2)
    .focus()
    .run();
}

export function applyBrainDumpListVariant(
  editor: Editor,
  variant: BrainDumpListVariant,
) {
  if (variant === "toggle") {
    applyToggleList(editor);
    return;
  }
  const chain = editor.chain().focus();
  if (variant === "task") chain.toggleTaskList();
  else if (variant === "bullet") chain.toggleBulletList();
  else chain.toggleOrderedList();
  chain.run();
}

export const brainDumpEditorExtensions = [
  TaskList,
  TaskItem.configure({
    a11y: {
      checkboxLabel: (node, checked) =>
        `${checked ? "Completed" : "Open"} to-do item: ${node.textContent || "empty item"}`,
    },
  }),
  Details.configure({
    persist: true,
    HTMLAttributes: { class: "brain-dump-details" },
    openClassName: "is-open",
    renderToggleButton: ({ element, isOpen, node }) => {
      element.className = "brain-dump-details__toggle";
      element.textContent = isOpen ? "v" : ">";
      element.setAttribute(
        "aria-label",
        isOpen
          ? `Collapse toggle list: ${node.textContent || "toggle"}`
          : `Expand toggle list: ${node.textContent || "toggle"}`,
      );
      element.setAttribute("title", isOpen ? "Collapse toggle list" : "Expand toggle list");
    },
  }),
  DetailsSummary.configure({
    HTMLAttributes: { class: "brain-dump-details__summary" },
  }),
  DetailsContent.configure({
    HTMLAttributes: { class: "brain-dump-details__content" },
  }),
  Extension.create({
    name: "brainDumpBlockFontSize",
    addGlobalAttributes() {
      return [
        {
          types: ["paragraph", "detailsSummary"],
          attributes: {
            fontSize: {
              default: null,
              parseHTML: (element) =>
                explicitBrainDumpFontSize((element as HTMLElement).style.fontSize),
              renderHTML: (attributes) => {
                const fontSize = explicitBrainDumpFontSize(attributes.fontSize);
                return fontSize ? { style: `font-size: ${fontSize}` } : {};
              },
            },
          },
        },
      ];
    },
  }),
  Extension.create({
    name: "brainDumpListShortcuts",
    addKeyboardShortcuts() {
      return {
        "Mod-Alt-7": () => {
          applyBrainDumpListVariant(this.editor, "toggle");
          return true;
        },
        "Mod-Alt-8": () => {
          applyBrainDumpListVariant(this.editor, "task");
          return true;
        },
        "Mod-Alt-9": () => {
          applyBrainDumpListVariant(this.editor, "bullet");
          return true;
        },
        "Mod-Alt-0": () => {
          applyBrainDumpListVariant(this.editor, "ordered");
          return true;
        },
      };
    },
  }),
] as const;

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function plainTextToHtml(value: string) {
  const trimmedLines = value.replace(/\r/g, "").split("\n");
  const paragraphs: string[] = [];
  let current: string[] = [];

  for (const line of trimmedLines) {
    if (line.trim() === "") {
      if (current.length > 0) {
        paragraphs.push(`<p>${current.map(escapeHtml).join("<br>")}</p>`);
        current = [];
      }
      continue;
    }
    current.push(line);
  }
  if (current.length > 0) {
    paragraphs.push(`<p>${current.map(escapeHtml).join("<br>")}</p>`);
  }
  return paragraphs.join("") || "<p></p>";
}

function unwrapElement(element: Element) {
  const parent = element.parentNode;
  if (!parent) return;
  while (element.firstChild) parent.insertBefore(element.firstChild, element);
  parent.removeChild(element);
}

/**
 * Stored dump HTML is handed to `dangerouslySetInnerHTML` in the log, so
 * anything the editor schema cannot produce is stripped rather than trusted.
 * Unwrapping (instead of removing) keeps the text of a stray wrapper; the
 * script-like tags carry no text worth keeping and go entirely.
 */
function replaceBrainDumpAttributes(
  element: Element,
  attributes: Record<string, string>,
) {
  for (const name of element.getAttributeNames()) element.removeAttribute(name);
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value);
  }
}

function sanitizeBrainDumpHtmlDocument(doc: Document, disableChecklistItems: boolean) {
  for (const element of Array.from(doc.body.querySelectorAll("*"))) {
    if (BRAIN_DUMP_DROPPED_TAGS.has(element.tagName)) {
      element.remove();
      continue;
    }
    if (!BRAIN_DUMP_ALLOWED_TAGS.has(element.tagName)) {
      unwrapElement(element);
      continue;
    }

    const fontSize = [
      element instanceof HTMLElement ? element.style.fontSize : "",
      ...Array.from(element.querySelectorAll<HTMLElement>("[style*='font-size']")).map(
        (descendant) => descendant.style.fontSize,
      ),
    ]
      .map((candidate) => explicitBrainDumpFontSize(candidate))
      .find((candidate) => candidate != null);
    const isChecklist =
      element.tagName === "UL" && element.getAttribute("data-type") === "taskList";
    const isChecklistItem =
      element.tagName === "LI" &&
      element.getAttribute("data-type") === "taskItem" &&
      element.parentElement?.getAttribute("data-type") === "taskList";
    const checklistItem = element.closest('li[data-type="taskItem"]');
    const isDetailsContent =
      element.tagName === "DIV" && element.getAttribute("data-type") === "detailsContent";
    const orderedStart = Number.parseInt(element.getAttribute("start") ?? "", 10);
    const wasOpen = element.hasAttribute("open");

    switch (element.tagName) {
      case "P":
        replaceBrainDumpAttributes(element, fontSize ? { style: `font-size: ${fontSize}` } : {});
        break;
      case "SUMMARY":
        replaceBrainDumpAttributes(element, {
          class: "brain-dump-details__summary",
          ...(fontSize ? { style: `font-size: ${fontSize}` } : {}),
        });
        break;
      case "DETAILS":
        replaceBrainDumpAttributes(element, {
          class: "brain-dump-details",
          ...(wasOpen ? { open: "" } : {}),
        });
        break;
      case "UL":
        replaceBrainDumpAttributes(element, isChecklist ? { "data-type": "taskList" } : {});
        break;
      case "OL":
        replaceBrainDumpAttributes(
          element,
          Number.isInteger(orderedStart) && orderedStart > 1
            ? { start: String(orderedStart) }
            : {},
        );
        break;
      case "LI":
        replaceBrainDumpAttributes(
          element,
          isChecklistItem
            ? {
                "data-checked": element.getAttribute("data-checked") === "true" ? "true" : "false",
                "data-type": "taskItem",
              }
            : {},
        );
        break;
      case "DIV":
        if (isDetailsContent) {
          replaceBrainDumpAttributes(element, {
            class: "brain-dump-details__content",
            "data-type": "detailsContent",
          });
        } else if (checklistItem) {
          replaceBrainDumpAttributes(element, {});
        } else {
          unwrapElement(element);
        }
        break;
      case "LABEL":
      case "SPAN":
        if (checklistItem) replaceBrainDumpAttributes(element, {});
        else unwrapElement(element);
        break;
      case "INPUT":
        if (!checklistItem) {
          element.remove();
          break;
        }
        replaceBrainDumpAttributes(element, {
          type: "checkbox",
          ...(checklistItem.getAttribute("data-checked") === "true"
            ? { checked: "checked" }
            : {}),
          ...(disableChecklistItems ? { disabled: "disabled" } : {}),
        });
        break;
      default:
        replaceBrainDumpAttributes(element, {});
    }
  }
}

function brainDumpStorageToHtml(value: string, disableChecklistItems: boolean) {
  if (!isRichBrainDumpHtml(value)) return plainTextToHtml(value);
  const html = value.slice(BRAIN_DUMP_RICH_TEXT_PREFIX.length);
  if (typeof DOMParser === "undefined") return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  sanitizeBrainDumpHtmlDocument(doc, disableChecklistItems);
  return doc.body.innerHTML || "<p></p>";
}

function htmlToPlainTextFallback(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<summary[^>]*>/gi, "▸ ")
    .replace(/<\/(p|div|li|ul|ol)>/gi, "\n")
    .replace(/<\/(summary|details)>/gi, "\n")
    .replace(/<li[^>]*data-type=["']taskItem["'][^>]*data-checked=["']true["'][^>]*>/gi, "[x] ")
    .replace(/<li[^>]*data-checked=["']true["'][^>]*data-type=["']taskItem["'][^>]*>/gi, "[x] ")
    .replace(/<li[^>]*data-type=["']taskItem["'][^>]*>/gi, "[ ] ")
    .replace(/<li>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{2,}/g, "\n");
}

export function isRichBrainDumpHtml(value: string) {
  return value.startsWith(BRAIN_DUMP_RICH_TEXT_PREFIX);
}

export function brainDumpEditorHtmlToStorage(value: string) {
  return `${BRAIN_DUMP_RICH_TEXT_PREFIX}${value}`;
}

export function brainDumpStorageToEditorHtml(value: string) {
  return brainDumpStorageToHtml(value, false);
}

export function brainDumpStorageToDisplayHtml(value: string) {
  return brainDumpStorageToHtml(value, true);
}

export function brainDumpHtmlToPlainText(value: string) {
  if (!isRichBrainDumpHtml(value)) return value.replace(/\r/g, "");
  const html = value.slice(BRAIN_DUMP_RICH_TEXT_PREFIX.length);
  if (typeof DOMParser === "undefined") {
    return htmlToPlainTextFallback(html).trim();
  }
  const doc = new DOMParser().parseFromString(html, "text/html");
  const blockTags = new Set(["P", "DIV", "LI", "UL", "OL", "DETAILS", "SUMMARY"]);
  const parts: string[] = [];

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.textContent ?? "");
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    if (node.tagName === "BR") {
      parts.push("\n");
      return;
    }
    if (node.tagName === "SUMMARY") {
      if (parts.length > 0 && parts[parts.length - 1] !== "\n") parts.push("\n");
      parts.push("▸ ");
    }
    const startsListItem = node.tagName === "LI";
    if (startsListItem) {
      if (parts.length > 0 && parts[parts.length - 1] !== "\n") parts.push("\n");
      parts.push(
        node.getAttribute("data-type") === "taskItem"
          ? node.getAttribute("data-checked") === "true"
            ? "[x] "
            : "[ ] "
          : "• ",
      );
    }
    for (const child of Array.from(node.childNodes)) {
      walk(child);
    }
    if (blockTags.has(node.tagName) && parts[parts.length - 1] !== "\n") {
      parts.push("\n");
    }
  };

  for (const child of Array.from(doc.body.childNodes)) {
    walk(child);
  }
  return parts.join("").replace(/\n{3,}/g, "\n\n").trim();
}

export function trimBrainDumpHtml(value: string) {
  return brainDumpHtmlToPlainText(value).trim();
}

export function brainDumpSummary(value: string) {
  const firstLine = brainDumpHtmlToPlainText(value)
    .split("\n")
    .map((line: string) => line.trim())
    .find((line: string) => line.length > 0);
  return firstLine ?? "Brain dump";
}

export function setContentEditableCaretToEnd(element: HTMLElement | null) {
  if (!element || typeof window === "undefined") return;
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

export function brainDumpPlainTextLines(value: string) {
  return brainDumpHtmlToPlainText(value)
    .split("\n")
    .map((line: string) => line.trimEnd())
    .filter(
      (line: string, index: number, lines: string[]) =>
        line.length > 0 || (lines[index - 1] && lines[index - 1].length > 0),
    );
}
