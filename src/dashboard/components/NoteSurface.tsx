import { EditorContent, useEditor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import type { EditorOptions } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import {
  applyNoteFontSize,
  applyNoteListVariant,
  NOTE_DEFAULT_FONT_SIZE,
  NOTE_FONT_SIZE_OPTIONS,
  clearNoteFormatting,
  type NoteListVariant,
  noteEditorHtmlToStorage,
  noteEditorExtensions,
  noteStorageToEditorHtml,
  selectedNoteFontSize,
} from "../../lib/noteRichText";
import type { Tag } from "../../lib/types";
import { chevronDownIcon, chevronRightIcon } from "./icons";
import { NoteTags } from "./NoteTags";
import "./NoteSurface.css";

const NOTE_STARTER_KIT = StarterKit.configure({
  blockquote: false,
  bulletList: false,
  code: false,
  codeBlock: false,
  dropcursor: false,
  gapcursor: false,
  heading: false,
  horizontalRule: false,
  // Autolinked anchors are stripped by the storage round-trip, which would
  // rewrite the document mid-word; notes have no use for live links.
  link: false,
  orderedList: false,
  strike: false,
});

const NOTE_EDITOR_EXTENSIONS = [
  NOTE_STARTER_KIT,
  ...noteEditorExtensions,
];

/** Lets an outside click hide the formatting menu directly. Its own blur handler
 * skips the hide after any toolbar press, and again whenever focus moves inside
 * the menu's container — which is <body> here, so that matches the whole page. */
const NOTE_BUBBLE_MENU_KEY = new PluginKey("noteBubbleMenu");

type ToolbarDropdownOption = {
  value: string;
  label: string;
  active: boolean;
};

function ToolbarDropdown({
  label,
  currentLabel,
  currentIcon,
  menuAlign = "start",
  dismissVersion = 0,
  options,
  onSelect,
}: {
  label: string;
  currentLabel: string;
  currentIcon?: ReactNode;
  menuAlign?: "start" | "end";
  dismissVersion?: number;
  options: ToolbarDropdownOption[];
  onSelect: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const [menuMaxHeight, setMenuMaxHeight] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const measureMenu = () => {
      const root = rootRef.current;
      if (!root) return;
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const spacing = 8;
      const rect = root.getBoundingClientRect();
      const availableBelow = Math.max(0, viewportHeight - rect.bottom - spacing);
      const availableAbove = Math.max(0, rect.top - spacing);
      // Roughly the tallest menu (four 28px rows plus padding and the gap).
      const menuHeight = 176;
      const nextOpenUpward =
        availableBelow < menuHeight && availableAbove > availableBelow;
      setOpenUpward(nextOpenUpward);
      setMenuMaxHeight(
        Math.max(96, Math.floor(nextOpenUpward ? availableAbove : availableBelow)),
      );
    };

    measureMenu();
    const dismissIfOutside = (target: EventTarget | null) => {
      if (rootRef.current?.contains(target as Node)) return false;
      setOpen(false);
      return true;
    };
    const onPointerDown = (event: PointerEvent) => {
      dismissIfOutside(event.target);
    };
    const onFocusIn = (event: FocusEvent) => {
      dismissIfOutside(event.target);
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
    };
    const onViewportChange = () => measureMenu();
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    window.visualViewport?.addEventListener("resize", onViewportChange);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
      window.visualViewport?.removeEventListener("resize", onViewportChange);
    };
  }, [open]);

  useEffect(() => {
    setOpen(false);
  }, [dismissVersion]);

  return (
    <div
      ref={rootRef}
      className={`note-toolbar__dropdown note-toolbar__dropdown--${menuAlign}${
        open ? " is-open" : ""
      }${
        openUpward ? " note-toolbar__dropdown--upward" : ""
      }`}
    >
      <button
        type="button"
        className="note-toolbar__dropdown-trigger"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen((current) => !current)}
      >
        {currentIcon && (
          <span className="note-toolbar__dropdown-icon" aria-hidden="true">
            {currentIcon}
          </span>
        )}
        <span className="note-toolbar__dropdown-label">{currentLabel}</span>
        <span className="note-toolbar__dropdown-chevron" aria-hidden="true">
          {chevronDownIcon}
        </span>
      </button>
      {open && (
        <div
          className="note-toolbar__dropdown-menu"
          role="listbox"
          aria-label={label}
          style={menuMaxHeight ? { maxHeight: `${menuMaxHeight}px` } : undefined}
        >
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.active}
              className={option.active ? "is-active" : undefined}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onSelect(option.value);
                setOpen(false);
              }}
            >
              <span>{option.label}</span>
              {option.active && (
                <span className="note-toolbar__dropdown-option-icon" aria-hidden="true">
                  {chevronRightIcon}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function NoteSurface({
  text,
  tagIds,
  tags,
  tagsDisabled = false,
  readOnly = false,
  showTags = true,
  layout = "default",
  textareaLabel,
  className = "",
  headerStart,
  headerEnd,
  onTextChange,
  onTagsChange,
  onKeyDown,
  onFocus,
  editorRef,
  onHeaderPointerDown,
  dismissPopupsOnOutsideInteraction = false,
}: {
  text: string;
  tagIds: number[];
  tags: Tag[];
  tagsDisabled?: boolean;
  readOnly?: boolean;
  showTags?: boolean;
  layout?: "default" | "panel";
  textareaLabel: string;
  className?: string;
  headerStart?: ReactNode;
  headerEnd?: ReactNode;
  onTextChange?: (text: string) => void;
  onTagsChange?: (tagIds: number[]) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void;
  onFocus?: () => void;
  editorRef?: RefObject<HTMLElement | null>;
  onHeaderPointerDown?: (event: ReactPointerEvent<HTMLElement>) => void;
  dismissPopupsOnOutsideInteraction?: boolean;
}) {
  const hasHeader = headerStart || headerEnd;
  const usesPanelChrome = layout === "panel";
  // useEditor consumes `content` only on creation; later changes to `text`
  // arrive through the sync effect below, so this deliberately runs once.
  const [initialContent] = useState(() => noteStorageToEditorHtml(text));
  const [selectedFontSize, setSelectedFontSize] = useState(NOTE_DEFAULT_FONT_SIZE);
  const [dismissVersion, setDismissVersion] = useState(0);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const lastLocalTextRef = useRef<string | null>(null);
  const onTextChangeRef = useRef(onTextChange);
  const onFocusRef = useRef(onFocus);
  const readOnlyRef = useRef(readOnly);
  onTextChangeRef.current = onTextChange;
  onFocusRef.current = onFocus;
  readOnlyRef.current = readOnly;

  const dismissTransientUi = () => {
    setDismissVersion((current) => current + 1);
    if (!editor) return;
    // Every surface watches for outside clicks, so one click runs this on all of
    // them. TipTap's blur() waits a frame and then clears the whole document's
    // selection, wiping the caret the click just placed in another editor.
    if (editor.isFocused) editor.view.dom.blur();
    editor.view.dispatch(editor.state.tr.setMeta(NOTE_BUBBLE_MENU_KEY, "hide"));
  };

  const editorProps = useMemo<NonNullable<EditorOptions["editorProps"]>>(
    () => ({
      attributes: {
        class: "note-surface__input",
        "aria-label": textareaLabel,
        autocapitalize: "off",
        autocomplete: "off",
        autocorrect: "off",
        spellcheck: "false",
      },
      handlePaste(view, event) {
        const plain = event.clipboardData?.getData("text/plain");
        if (!plain) return false;
        event.preventDefault();
        // pasteText splits on newlines into real blocks; inserting the raw
        // string would bury them in one text node and lose them on reload.
        view.pasteText(plain);
        return true;
      },
      handleDOMEvents: {
        focus: () => {
          onFocusRef.current?.();
          return false;
        },
      },
    }),
    [textareaLabel],
  );

  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    editable: !readOnly,
    extensions: NOTE_EDITOR_EXTENSIONS,
    content: initialContent,
    editorProps,
    onUpdate({ editor: current }) {
      // History browse reuses this editor as read-only; never publish those
      // content swaps (or TipTap editable toggles) into the live draft.
      if (readOnlyRef.current) return;
      const nextText = noteEditorHtmlToStorage(current.getHTML());
      lastLocalTextRef.current = nextText;
      onTextChangeRef.current?.(nextText);
    },
  });

  useEffect(() => {
    if (!editor) return;
    // TipTap defaults emitUpdate to true; that would fire onUpdate with the
    // still-visible saved note when leaving history and overwrite the draft.
    editor.setEditable(!readOnly, false);
  }, [editor, readOnly]);

  useEffect(() => {
    if (!editor) return;
    if (lastLocalTextRef.current === text) return;
    const next = noteStorageToEditorHtml(text);
    if (editor.getHTML() === next) return;
    editor.commands.setContent(next, { emitUpdate: false });
    // External swaps can alternate back to a value this editor last emitted.
    // Track the applied text so the next external change is not mistaken for
    // stale local input and skipped.
    lastLocalTextRef.current = text;
  }, [editor, text]);

  useEffect(() => {
    if (!dismissPopupsOnOutsideInteraction) return;
    const dismissIfOutside = (target: EventTarget | null) => {
      const node = target as Node | null;
      if (
        surfaceRef.current?.contains(node) ||
        toolbarRef.current?.contains(node)
      ) {
        return;
      }
      dismissTransientUi();
    };
    const onPointerDown = (event: PointerEvent) => {
      dismissIfOutside(event.target);
    };
    const onFocusIn = (event: FocusEvent) => {
      dismissIfOutside(event.target);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("focusin", onFocusIn, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("focusin", onFocusIn, true);
    };
  }, [dismissPopupsOnOutsideInteraction, editor]);

  useEffect(() => {
    if (!editorRef) return;
    editorRef.current = editor?.view.dom ?? null;
    return () => {
      editorRef.current = null;
    };
  }, [editor, editorRef]);

  useEffect(() => {
    if (!editor) return;
    const syncSelectedFontSize = () => {
      setSelectedFontSize(selectedNoteFontSize(editor));
    };
    syncSelectedFontSize();
    editor.on("selectionUpdate", syncSelectedFontSize);
    editor.on("update", syncSelectedFontSize);
    return () => {
      editor.off("selectionUpdate", syncSelectedFontSize);
      editor.off("update", syncSelectedFontSize);
    };
  }, [editor]);

  const runListCommand = (value: NoteListVariant) => {
    if (!editor) return;
    applyNoteListVariant(editor, value);
  };
  const listOptions = editor
    ? [
        {
          value: "bullet",
          label: "Bulleted list",
          active: editor.isActive("bulletList"),
        },
        {
          value: "ordered",
          label: "Numbered list",
          active: editor.isActive("orderedList"),
        },
        {
          value: "task",
          label: "To-do list",
          active: editor.isActive("taskList"),
        },
        {
          value: "toggle",
          label: "Toggle list",
          active: editor.isActive("details"),
        },
      ]
    : [];
  const activeListLabel =
    listOptions.find((option) => option.active)?.label ?? "List";
  const selectedFontSizeLabel =
    NOTE_FONT_SIZE_OPTIONS.find((option) => option.value === selectedFontSize)?.label ??
    "Body";
  return (
    <div
      ref={surfaceRef}
      className={`note-surface${
        usesPanelChrome ? " note-surface--panel" : ""
      }${className ? ` ${className}` : ""}`}
    >
      {hasHeader && (
        <header
          className={`${
            usesPanelChrome ? "surface-panel__head" : "note-surface__head"
          }${
            onHeaderPointerDown ? " note-surface__head--draggable" : ""
          }`}
          onPointerDown={onHeaderPointerDown}
        >
          <div
            className={
              usesPanelChrome
                ? "surface-panel__head-start"
                : "note-surface__head-start"
            }
          >
            {headerStart}
          </div>
          <div
            className={
              usesPanelChrome
                ? "surface-panel__head-end"
                : "note-surface__head-end"
            }
          >
            {headerEnd}
          </div>
        </header>
      )}
      <div
        className={
          usesPanelChrome
            ? "surface-panel__scroll note-surface__scroll"
            : "note-surface__scroll"
        }
      >
        {editor && !readOnly ? (
          <BubbleMenu
            editor={editor}
            pluginKey={NOTE_BUBBLE_MENU_KEY}
            updateDelay={0}
            appendTo={() => document.body}
            options={{
              strategy: "fixed",
              placement: "top",
              flip: { padding: 8 },
              shift: { padding: 8 },
            }}
          >
            <div
              ref={toolbarRef}
              className="note-toolbar"
              role="toolbar"
              aria-label="Text formatting"
            >
              <ToolbarDropdown
                label="List style"
                currentLabel={activeListLabel}
                currentIcon={chevronRightIcon}
                menuAlign="start"
                dismissVersion={dismissVersion}
                options={listOptions}
                onSelect={(value) => runListCommand(value as NoteListVariant)}
              />
              <div className="note-toolbar__row">
                <ToolbarDropdown
                  label="Font size"
                  currentLabel={selectedFontSizeLabel}
                  menuAlign="end"
                  dismissVersion={dismissVersion}
                  options={NOTE_FONT_SIZE_OPTIONS.map((option) => ({
                    value: option.value,
                    label: option.label,
                    active: selectedFontSize === option.value,
                  }))}
                  onSelect={(value) => applyNoteFontSize(editor, value)}
                />
                <button
                  type="button"
                  className={editor.isActive("bold") ? "is-active" : undefined}
                  aria-pressed={editor.isActive("bold")}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => editor.chain().focus().toggleBold().run()}
                >
                  B
                </button>
                <button
                  type="button"
                  className={editor.isActive("italic") ? "is-active" : undefined}
                  aria-pressed={editor.isActive("italic")}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => editor.chain().focus().toggleItalic().run()}
                >
                  <em>I</em>
                </button>
                <button
                  type="button"
                  className={editor.isActive("underline") ? "is-active" : undefined}
                  aria-pressed={editor.isActive("underline")}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => editor.chain().focus().toggleUnderline().run()}
                >
                  <span className="note-toolbar__underline-label">U</span>
                </button>
                <button
                  type="button"
                  aria-label="Clear formatting"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => clearNoteFormatting(editor)}
                >
                  Tx
                </button>
              </div>
            </div>
          </BubbleMenu>
        ) : null}
        <EditorContent
          className="note-surface__editor"
          editor={editor}
          onKeyDown={onKeyDown}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              event.preventDefault();
              editor?.commands.focus("end");
            }
          }}
        />
        {showTags && onTagsChange && (
          <NoteTags
            tags={tags}
            selectedIds={tagIds}
            disabled={tagsDisabled || readOnly}
            dismissVersion={dismissVersion}
            onChange={onTagsChange}
          />
        )}
      </div>
    </div>
  );
}
