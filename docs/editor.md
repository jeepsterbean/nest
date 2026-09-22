# Nest Brain dump editor

This is the authoritative reference for editor invariants, dependency findings,
diagnosis, and manual regression checks. Domain words live in
[CONTEXT.md](../CONTEXT.md); capture and Note Board behavior live in
[docs/brain-dump.md](./brain-dump.md); shared UI hooks live in [UI.md](../UI.md).

## Editor ownership and synchronization

`BrainDumpSurface` is the only component that mounts several times on one
screen and reaches for browser singletons, which is what turns its bugs into
cross-instance ones. Three kinds of instance can be live at once: the Overview
`brainDump` tile, one per expanded `.floating-brain-dump` sticky, and the popup
composer. Each owns a separate TipTap editor with its own document, selection,
and undo stack; there is no active-editor registry, and focus moves natively.

The rule: anything a surface does to a process-wide resource must be
conditional on that surface owning it. Both long-standing caret bugs were that
rule broken.

Process-wide resources it touches:

- The document selection (`window.getSelection()`). Only the focused surface
  may change it; see `dismissTransientUi`.
- Focus. `handleDOMEvents.focus` only reports it outward, so a sticky can raise
  its z-index.
- `document.body`. Every visible bubble menu is appended there through
  `appendTo`, so menus from different surfaces are siblings and a menu's
  `parentNode` is the body rather than its own surface.
- Document-level capture listeners for `pointerdown` and `focusin`, one per
  surface with `dismissPopupsOnOutsideInteraction`. Each fires for clicks
  landing in every other surface.
- `window` `keydown`, from `useRecentBrainDumpHistory`: Cmd/Ctrl+[ and ] are
  global and navigate the Overview dump's history even while a sticky is
  focused.

Invariants that are easy to break:

- `lastLocalTextRef` suppresses the echo of this surface's own
  `onTextChange`. Without it every keystroke re-enters through `text`, and
  `setContent` throws the caret to the end of the document.
- History browsing reuses the same editor read-only. `setEditable(!readOnly,
  false)` must keep `emitUpdate` false, or leaving history publishes the
  displayed saved dump into the live draft.
- Minimising a sticky, docking it on the Note Board, or hiding free stickies
  unmounts the surface, destroying its editor, selection, and undo stack.
  Expanding or dragging it out rebuilds from `text` with the caret at the start.

## Third-party editor behaviour

Behaviour we depend on that appears in neither the libraries' documentation nor
their types, only in their source. Each claim names the version it was read
from; re-verify them when bumping `@tiptap/*` or `prosemirror-*`.

- `commands.blur()` is deferred to `requestAnimationFrame` and then clears the
  whole document's selection rather than just this editor's (`@tiptap/core`
  3.31.3, `src/commands/blur.ts:18,24`). With more than one editor mounted it
  lands after a click has already placed a caret in another one. Use
  `editor.view.dom.blur()` instead: synchronous and local.
- The bubble menu cannot be relied on to hide when its editor blurs
  (`@tiptap/extension-bubble-menu` 3.31.3, `src/bubble-menu-plugin.ts:454,460`).
  It skips the hide while `preventHide` is set, which any mousedown on the menu
  sets (`:420`) and only the next blur clears; and again when the blur's
  `relatedTarget` sits inside `element.parentNode`, which is `document.body`
  whenever `appendTo` points there (`:599`). Hide it explicitly by dispatching
  the `'hide'` meta on a known plugin key (`:637`).
- `commands.focus()` is also deferred to `requestAnimationFrame`, and its
  `scrollIntoView` defaults to true (`@tiptap/core` 3.31.3,
  `src/commands/focus.ts:40,61`), so a toolbar press can scroll the surface.
- `commands.setContent()` replaces the whole document
  (`src/commands/setContent.ts:66`), so the selection maps to the end and the
  caret jumps there. Every external text sync pays this, which is why
  `lastLocalTextRef` exists.
- `useEditor(options, [])` keeps one instance but re-applies options whenever
  they compare unequal (`@tiptap/react` 3.31.3, `src/useEditor.ts:172,225`).
  Extension arrays and `editorProps` must be hoisted or memoized, or every
  render runs `setOptions` again.
- ProseMirror re-asserts the DOM selection 20ms after an editor gains focus
  (`prosemirror-view` 1.42.3, `src/input.ts:842`). A click that moves focus
  therefore repairs a broken caret by itself, while a click inside the already
  focused editor does not. A caret bug visible only in the second case points
  at something clearing the selection globally, not at click handling.

## Diagnosing caret and focus bugs

- First decide whether it is one surface or many: hide the stickies with
  `.floating-brain-dumps-toggle` so the Overview dump is the only live editor,
  then retry. A symptom that survives is local; one that disappears is a
  cross-instance problem with a browser singleton.
- Note whether the caret dies on a click that moves focus or on a click inside
  the already focused editor. Because of the 20ms repair above, only the second
  case exposes a global selection wipe.
- Paste this into the dev window's console (right-click, Inspect Element), then
  reproduce with a single click. The stack names whatever clears the selection.

```js
(() => {
  const at = () => "\n" + new Error().stack.split("\n").slice(2, 7).join("\n");
  const rar = Selection.prototype.removeAllRanges;
  Selection.prototype.removeAllRanges = function () {
    console.warn("WIPE removeAllRanges" + at());
    return rar.apply(this, arguments);
  };
  const bl = HTMLElement.prototype.blur;
  HTMLElement.prototype.blur = function () {
    console.warn("BLUR " + (this.className || this.tagName) + at());
    return bl.apply(this, arguments);
  };
  document.addEventListener("selectionchange", () => {
    const sel = getSelection();
    console.log("ranges=" + sel.rangeCount, document.activeElement?.className);
  });
  ["pointerdown", "mouseup", "focusin", "focusout"].forEach((type) =>
    document.addEventListener(type, (event) =>
      console.log(type, event.target.className || event.target.tagName), true));
})();
```

- `ranges=0` after mouseup means something cleared the selection, and the stack
  says who. A `focusout` on the editor means something blurred it. Neither,
  with the range still on the clicked node, means the selection is intact and
  the caret is simply not painted — a WKWebView rendering problem, so look at
  CSS rather than at handlers.

## Verification

After changing `BrainDumpSurface` or its editor helpers, run the frontend
checks in [AGENTS.md](../AGENTS.md#verification) and this manual pass in Nest's
native Tauri/WKWebView environment:

1. Two stickies plus the Overview dump open; click into each and type. The
   caret lands every time.
2. Click twice inside one editor. The caret lands where clicked.
3. Select text, press B, then click outside. The formatting menu closes.
4. Select text in one sticky, then click into another. The first menu closes.
5. Minimise and expand a sticky. Its text survives.
6. Type in the popup with the dashboard open. The main dump mirrors it and
   the popup caret stays put.

Vitest runs in the `node` environment, so caret placement, focus, selection,
and bubble menu visibility require manual verification. Keep these checks in
WKWebView; adding jsdom or happy-dom would not reproduce its caret behavior.
Report any manual checks that could not be performed.
