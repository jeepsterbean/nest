# Brain dump domain

Saved content and Tag rules shared by capture and history surfaces. Composers,
drafts, stickies, and Note Board live in
[Brain dump interface](../interface/brain-dump.md); editor mechanics live in
[Editor implementation](../interface/editor.md).

## Saved content

A brain dump records text, a creation timestamp, and Tags, independently of
Tasks and Pulses. It has no title field. Saving requires non-empty textual
content, including when the text contains rich-text markup. Content and Tag
associations save atomically. Saved checklist states remain part of the content.
Forking a saved dump creates a separate draft and preserves the saved record.

## Tags

A Tag is a reusable label. Its name is trimmed, non-empty, and unique ignoring
case. Each dump can carry several distinct, existing Tags. Replacing a dump's
Tags preserves its text and creation time. Renaming a Tag updates the shared
label; deleting it removes its associations from every saved dump.
