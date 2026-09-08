import { EditorContent, useEditor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import {
  applyBrainDumpFontSize,
  applyBrainDumpListVariant,
  BRAIN_DUMP_DEFAULT_FONT_SIZE,
  BRAIN_DUMP_FONT_SIZE_OPTIONS,
  type BrainDumpListVariant,
  brainDumpEditorHtmlToStorage,
  brainDumpEditorExtensions,
  brainDumpStorageToEditorHtml,
  resetBrainDumpFontSize,
  selectedBrainDumpFontSize,
} from "../../lib/brainDumpRichText";
import type { Tag } from "../../lib/types";
import { chevronDownIcon, chevronRightIcon } from "./icons";
import { BrainDumpTags } from "./BrainDumpTags";
import "./BrainDumpSurface.css";

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
      className={`brain-dump-toolbar__dropdown brain-dump-toolbar__dropdown--${menuAlign}${
        open ? " is-open" : ""
      }${
        openUpward ? " brain-dump-toolbar__dropdown--upward" : ""
      }`}
    >
      <button
        type="button"
        className="brain-dump-toolbar__dropdown-trigger"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen((current) => !current)}
      >
        {currentIcon && (
          <span className="brain-dump-toolbar__dropdown-icon" aria-hidden="true">
            {currentIcon}
          </span>
        )}
        <span className="brain-dump-toolbar__dropdown-label">{currentLabel}</span>
        <span className="brain-dump-toolbar__dropdown-chevron" aria-hidden="true">
          {chevronDownIcon}
        </span>
      </button>
      {open && (
        <div
          className="brain-dump-toolbar__dropdown-menu"
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
                <span className="brain-dump-toolbar__dropdown-option-icon" aria-hidden="true">
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

export function BrainDumpSurface({
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
  draftRevision,
}: {
  text: string;
  tagIds: number[];
  tags: Tag[];
  tagsDisabled?: boolean;
  readOnly?: boolean;
  showTags?: boolean;
  layout?: "default" | "overview";
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
  draftRevision?: string;
}) {
  const hasHeader = headerStart || headerEnd;
  const usesOverviewChrome = layout === "overview";
  // useEditor consumes `content` only on creation; later changes to `text`
  // arrive through the sync effect below, so this deliberately runs once.
  const [initialContent] = useState(() => brainDumpStorageToEditorHtml(text));
  const [selectedFontSize, setSelectedFontSize] = useState(BRAIN_DUMP_DEFAULT_FONT_SIZE);
  const [dismissVersion, setDismissVersion] = useState(0);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const lastLocalTextRef = useRef<string | null>(null);

  const editor = useEditor({
    immediatelyRender: false,
    editable: !readOnly,
    extensions: [
      StarterKit.configure({
        blockquote: false,
        code: false,
        codeBlock: false,
        dropcursor: false,
        gapcursor: false,
        heading: false,
        horizontalRule: false,
        // Autolinked anchors are stripped by the storage round-trip, which would
        // rewrite the document mid-word; dumps have no use for live links.
        link: false,
        strike: false,
      }),
      ...brainDumpEditorExtensions,
    ],
    content: initialContent,
    editorProps: {
      attributes: {
        class: "brain-dump-surface__input",
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
          onFocus?.();
          return false;
        },
      },
    },
    onUpdate({ editor: current }) {
      const nextText = brainDumpEditorHtmlToStorage(current.getHTML());
      lastLocalTextRef.current = nextText;
      onTextChange?.(nextText);
    },
  });

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!readOnly);
  }, [editor, readOnly]);

  useEffect(() => {
    if (!editor) return;
    if (lastLocalTextRef.current === text) return;
    const next = brainDumpStorageToEditorHtml(text);
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
      setDismissVersion((current) => current + 1);
      editor?.commands.blur();
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
    if (draftRevision === undefined) return;
    lastLocalTextRef.current = null;
  }, [draftRevision]);

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
      setSelectedFontSize(selectedBrainDumpFontSize(editor));
    };
    syncSelectedFontSize();
    editor.on("selectionUpdate", syncSelectedFontSize);
    editor.on("update", syncSelectedFontSize);
    return () => {
      editor.off("selectionUpdate", syncSelectedFontSize);
      editor.off("update", syncSelectedFontSize);
    };
  }, [editor]);

  const runListCommand = (value: BrainDumpListVariant) => {
    if (!editor) return;
    applyBrainDumpListVariant(editor, value);
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
    BRAIN_DUMP_FONT_SIZE_OPTIONS.find((option) => option.value === selectedFontSize)?.label ??
    "Body";
  return (
    <div
      ref={surfaceRef}
      className={`brain-dump-surface${
        usesOverviewChrome ? " brain-dump-surface--overview" : ""
      }${className ? ` ${className}` : ""}`}
    >
      {hasHeader && (
        <header
          className={`${
            usesOverviewChrome ? "overview-panel__head" : "brain-dump-surface__head"
          }${
            onHeaderPointerDown
              ? usesOverviewChrome
                ? " overview-panel__head--draggable"
                : " brain-dump-surface__head--draggable"
              : ""
          }`}
          onPointerDown={onHeaderPointerDown}
        >
          <div
            className={
              usesOverviewChrome
                ? "overview-panel__head-start"
                : "brain-dump-surface__head-start"
            }
          >
            {headerStart}
          </div>
          <div
            className={
              usesOverviewChrome
                ? "overview-panel__head-end"
                : "brain-dump-surface__head-end"
            }
          >
            {headerEnd}
          </div>
        </header>
      )}
      <div
        className={
          usesOverviewChrome
            ? "overview-panel__scroll brain-dump-surface__scroll"
            : "brain-dump-surface__scroll"
        }
      >
        {editor && !readOnly ? (
          <BubbleMenu
            editor={editor}
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
              className="brain-dump-toolbar"
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
                onSelect={(value) => runListCommand(value as BrainDumpListVariant)}
              />
              <div className="brain-dump-toolbar__row">
                <ToolbarDropdown
                  label="Font size"
                  currentLabel={selectedFontSizeLabel}
                  menuAlign="end"
                  dismissVersion={dismissVersion}
                  options={BRAIN_DUMP_FONT_SIZE_OPTIONS.map((option) => ({
                    value: option.value,
                    label: option.label,
                    active: selectedFontSize === option.value,
                  }))}
                  onSelect={(value) => applyBrainDumpFontSize(editor, value)}
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
                  <span className="brain-dump-toolbar__underline-label">U</span>
                </button>
                <button
                  type="button"
                  aria-label="Clear formatting"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    editor.chain().focus().unsetAllMarks().clearNodes().run();
                    resetBrainDumpFontSize(editor);
                  }}
                >
                  Tx
                </button>
              </div>
            </div>
          </BubbleMenu>
        ) : null}
        <EditorContent
          className="brain-dump-surface__editor"
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
          <BrainDumpTags
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
