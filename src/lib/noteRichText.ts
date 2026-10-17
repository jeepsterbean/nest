import { Editor, Extension } from "@tiptap/core";
import { Details, DetailsContent, DetailsSummary } from "@tiptap/extension-details";
import {
  BulletList,
  OrderedList,
  TaskItem,
  TaskList,
} from "@tiptap/extension-list";
import type { EditorState, Transaction } from "@tiptap/pm/state";
export const NOTE_FONT_SIZE_OPTIONS = [
  { value: "12.6px", label: "Body" },
  { value: "18px", label: "H2" },
  { value: "24px", label: "H1" },
] as const;
export const NOTE_DEFAULT_FONT_SIZE = "12.6px";

const NOTE_RICH_TEXT_PREFIX = "<!--nest-rich-text:v1-->";
const NOTE_ALLOWED_FONT_SIZES = NOTE_FONT_SIZE_OPTIONS.map(
  (option) => option.value,
);
const NOTE_ROW_NODE_TYPES = new Set(["paragraph", "detailsSummary"]);
/** Every tag the editor schema can serialize. Anything else is stray markup. */
const NOTE_ALLOWED_TAGS = new Set([
  "P", "BR", "STRONG", "B", "EM", "I", "U", "S",
  "UL", "OL", "LI", "DIV", "SPAN", "LABEL", "INPUT",
  "DETAILS", "SUMMARY",
]);
const NOTE_DROPPED_TAGS = new Set([
  "SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "TEMPLATE",
]);

export type NoteListVariant = "toggle" | "task" | "bullet" | "ordered";

function normalizeNoteFontSize(value: string | null | undefined) {
  if (!value) return null;
  const numeric = Number.parseFloat(value);
  if (!Number.isFinite(numeric)) return null;
  let best = NOTE_ALLOWED_FONT_SIZES[0] ?? NOTE_DEFAULT_FONT_SIZE;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const option of NOTE_ALLOWED_FONT_SIZES) {
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
function explicitNoteFontSize(value: string | null | undefined) {
  const normalized = normalizeNoteFontSize(value);
  return normalized === NOTE_DEFAULT_FONT_SIZE ? null : normalized;
}

function isNoteRowSelectionSingle(editor: Editor) {
  const { selection } = editor.state;
  return selection.$from.sameParent(selection.$to);
}

function selectedNoteRowRanges(state: EditorState) {
  const ranges = new Map<number, { pos: number; type: string; attrs: Record<string, unknown> }>();
  state.doc.nodesBetween(state.selection.from, state.selection.to, (node, pos) => {
    if (!NOTE_ROW_NODE_TYPES.has(node.type.name)) return;
    ranges.set(pos, { pos, type: node.type.name, attrs: node.attrs });
  });
  if (ranges.size > 0) return Array.from(ranges.values());
  const parent = state.selection.$from.parent;
  if (!NOTE_ROW_NODE_TYPES.has(parent.type.name)) return [];
  return [
    {
      pos: state.selection.$from.before(),
      type: parent.type.name,
      attrs: parent.attrs,
    },
  ];
}

function setNoteRowFontSize(editor: Editor, fontSize: string | null) {
  const normalized = fontSize ? explicitNoteFontSize(fontSize) : null;
  return editor
    .chain()
    .focus()
    .command(({ state, tr }) => setSelectedNoteRowFontSize(state, tr, normalized))
    .run();
}

function setSelectedNoteRowFontSize(
  state: EditorState,
  tr: Transaction,
  fontSize: string | null,
) {
  const rows = selectedNoteRowRanges(state);
  if (rows.length === 0) return false;
  for (const row of rows) {
    tr.setNodeMarkup(row.pos, undefined, { ...row.attrs, fontSize });
  }
  return true;
}

export function selectedNoteFontSize(editor: Editor | null | undefined) {
  if (!editor) return NOTE_DEFAULT_FONT_SIZE;
  const parent = editor.state.selection.$from.parent;
  if (!NOTE_ROW_NODE_TYPES.has(parent.type.name)) return NOTE_DEFAULT_FONT_SIZE;
  return normalizeNoteFontSize(parent.attrs.fontSize) ?? NOTE_DEFAULT_FONT_SIZE;
}

export function applyNoteFontSize(
  editor: Editor,
  fontSize: string = NOTE_DEFAULT_FONT_SIZE,
) {
  return setNoteRowFontSize(editor, fontSize);
}

export function clearNoteFormatting(editor: Editor) {
  return editor
    .chain()
    .focus()
    .unsetAllMarks()
    .clearNodes()
    .command(({ state, tr }) => setSelectedNoteRowFontSize(state, tr, null))
    .run();
}

function applyToggleList(editor: Editor) {
  if (editor.isActive("details")) {
    editor.chain().focus().unsetDetails().run();
    return;
  }
  const { selection } = editor.state;
  if (!isNoteRowSelectionSingle(editor)) return;
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

export function applyNoteListVariant(
  editor: Editor,
  variant: NoteListVariant,
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

// Keep list creation explicit; markdown triggers like "- " can move the caret
// into a list while the user is just capturing a thought.
const ExplicitBulletList = BulletList.extend({
  addInputRules() {
    return [];
  },
});

const ExplicitOrderedList = OrderedList.extend({
  addInputRules() {
    return [];
  },
});

const ExplicitTaskItem = TaskItem.extend({
  addInputRules() {
    return [];
  },
}).configure({
  a11y: {
    checkboxLabel: (node, checked) =>
      `${checked ? "Completed" : "Open"} to-do item: ${node.textContent || "empty item"}`,
  },
});

export const noteEditorExtensions = [
  ExplicitBulletList,
  ExplicitOrderedList,
  TaskList,
  ExplicitTaskItem,
  Details.configure({
    persist: true,
    HTMLAttributes: { class: "note-details" },
    openClassName: "is-open",
    renderToggleButton: ({ element, isOpen, node }) => {
      element.className = "note-details__toggle";
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
    HTMLAttributes: { class: "note-details__summary" },
  }),
  DetailsContent.configure({
    HTMLAttributes: { class: "note-details__content" },
  }),
  Extension.create({
    name: "noteBlockFontSize",
    addGlobalAttributes() {
      return [
        {
          types: ["paragraph", "detailsSummary"],
          attributes: {
            fontSize: {
              default: null,
              // A fresh line starts as body text; only the split-off text of an
              // existing line keeps the size it was already rendered at.
              keepOnSplit: false,
              parseHTML: (element) =>
                explicitNoteFontSize((element as HTMLElement).style.fontSize),
              renderHTML: (attributes) => {
                const fontSize = explicitNoteFontSize(attributes.fontSize);
                return fontSize ? { style: `font-size: ${fontSize}` } : {};
              },
            },
          },
        },
      ];
    },
  }),
  Extension.create({
    name: "notePlainNewLine",
    // Tiptap keeps the active marks across a split, so a bolded line would keep
    // bolding every line after it. Emptying the splittable set drops them all.
    onBeforeCreate() {
      this.editor.extensionManager.splittableMarks = [];
    },
  }),
  Extension.create({
    name: "noteListShortcuts",
    addKeyboardShortcuts() {
      return {
        "Mod-Alt-7": () => {
          applyNoteListVariant(this.editor, "toggle");
          return true;
        },
        "Mod-Alt-8": () => {
          applyNoteListVariant(this.editor, "task");
          return true;
        },
        "Mod-Alt-9": () => {
          applyNoteListVariant(this.editor, "bullet");
          return true;
        },
        "Mod-Alt-0": () => {
          applyNoteListVariant(this.editor, "ordered");
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
 * Stored note HTML is handed to `dangerouslySetInnerHTML` in the log, so
 * anything the editor schema cannot produce is stripped rather than trusted.
 * Unwrapping (instead of removing) keeps the text of a stray wrapper; the
 * script-like tags carry no text worth keeping and go entirely.
 */
function replaceNoteAttributes(
  element: Element,
  attributes: Record<string, string>,
) {
  for (const name of element.getAttributeNames()) element.removeAttribute(name);
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value);
  }
}

function sanitizeNoteHtmlDocument(doc: Document, disableChecklistItems: boolean) {
  for (const element of Array.from(doc.body.querySelectorAll("*"))) {
    if (NOTE_DROPPED_TAGS.has(element.tagName)) {
      element.remove();
      continue;
    }
    if (!NOTE_ALLOWED_TAGS.has(element.tagName)) {
      unwrapElement(element);
      continue;
    }

    const fontSize = [
      element instanceof HTMLElement ? element.style.fontSize : "",
      ...Array.from(element.querySelectorAll<HTMLElement>("[style*='font-size']")).map(
        (descendant) => descendant.style.fontSize,
      ),
    ]
      .map((candidate) => explicitNoteFontSize(candidate))
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
        replaceNoteAttributes(element, fontSize ? { style: `font-size: ${fontSize}` } : {});
        break;
      case "SUMMARY":
        replaceNoteAttributes(element, {
          class: "note-details__summary",
          ...(fontSize ? { style: `font-size: ${fontSize}` } : {}),
        });
        break;
      case "DETAILS":
        replaceNoteAttributes(element, {
          class: "note-details",
          ...(wasOpen ? { open: "" } : {}),
        });
        break;
      case "UL":
        replaceNoteAttributes(element, isChecklist ? { "data-type": "taskList" } : {});
        break;
      case "OL":
        replaceNoteAttributes(
          element,
          Number.isInteger(orderedStart) && orderedStart > 1
            ? { start: String(orderedStart) }
            : {},
        );
        break;
      case "LI":
        replaceNoteAttributes(
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
          replaceNoteAttributes(element, {
            class: "note-details__content",
            "data-type": "detailsContent",
          });
        } else if (checklistItem) {
          replaceNoteAttributes(element, {});
        } else {
          unwrapElement(element);
        }
        break;
      case "LABEL":
      case "SPAN":
        if (checklistItem) replaceNoteAttributes(element, {});
        else unwrapElement(element);
        break;
      case "INPUT":
        if (!checklistItem) {
          element.remove();
          break;
        }
        replaceNoteAttributes(element, {
          type: "checkbox",
          ...(checklistItem.getAttribute("data-checked") === "true"
            ? { checked: "checked" }
            : {}),
          ...(disableChecklistItems ? { disabled: "disabled" } : {}),
        });
        break;
      default:
        replaceNoteAttributes(element, {});
    }
  }
}

function noteStorageToHtml(value: string, disableChecklistItems: boolean) {
  if (!isRichNoteHtml(value)) return plainTextToHtml(value);
  const html = value.slice(NOTE_RICH_TEXT_PREFIX.length);
  if (typeof DOMParser === "undefined") return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  sanitizeNoteHtmlDocument(doc, disableChecklistItems);
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

export function isRichNoteHtml(value: string) {
  return value.startsWith(NOTE_RICH_TEXT_PREFIX);
}

export function noteEditorHtmlToStorage(value: string) {
  return `${NOTE_RICH_TEXT_PREFIX}${value}`;
}

export function noteStorageToEditorHtml(value: string) {
  return noteStorageToHtml(value, false);
}

export function noteStorageToDisplayHtml(value: string) {
  return noteStorageToHtml(value, true);
}

export function noteHtmlToPlainText(value: string) {
  if (!isRichNoteHtml(value)) return value.replace(/\r/g, "");
  const html = value.slice(NOTE_RICH_TEXT_PREFIX.length);
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

export function trimNoteHtml(value: string) {
  return noteHtmlToPlainText(value).trim();
}

export function noteSummary(value: string) {
  const firstLine = noteHtmlToPlainText(value)
    .split("\n")
    .map((line: string) => line.trim())
    .find((line: string) => line.length > 0);
  return firstLine ?? "Note";
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
