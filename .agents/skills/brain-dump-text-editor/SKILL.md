---
name: brain-dump-text-editor
description: Change or diagnose Nest's Brain dump rich-text editors, caret or focus behavior, formatting menus, draft synchronization, sticky editor mounting, or TipTap and ProseMirror upgrades. Skip saved-dump layout, Tags, and sticky geometry changes that leave editor behavior untouched.
---

# Nest editor

Preserve each editor's selection and undo state across Overview, floating
stickies, and the Popup while keeping the shared draft synchronized.

1. Read [editor ownership and synchronization](../../../docs/editor.md#editor-ownership-and-synchronization)
   before changing editor behavior. Trace the affected helper's callers and the
   relevant surface's text, focus, and mount/unmount flow.
2. For caret, focus, or formatting-menu bugs, also read the dependency findings
   and diagnosis sections. Distinguish a local failure from a cross-instance
   selection or focus change before choosing a fix.
3. For `@tiptap/*` or `prosemirror-*` upgrades, re-check every dependency
   claim in the guide against the new installed source and update the guide in
   the same change.
4. Follow the guide's verification section after editor changes. Use Nest's
   native WKWebView for manual checks and report any checks left unperformed.

Read the Brain dump and Tag definitions in `CONTEXT.md` and
[docs/brain-dump.md](../../../docs/brain-dump.md) when changing capture,
history, or draft behavior. Read `.impeccable.md` and `UI.md` when changing
presentation.
