# Frontend and UI standards

Repository-specific brand direction, domain vocabulary, component names, CSS
hooks, and layout constants belong in the project's root documentation.

## Copy: say it once

- Avoid labels or subtitles that restate a heading in other words.
- Remove descriptions that only enumerate content or states already visible
  nearby. Keep unique context such as time ranges and caveats.
- Do not caption self-explanatory controls with extra headings or helper text.
- Use the repository's established domain vocabulary in user-facing copy.

## Components: no speculative flexibility

- Add a prop only when a caller passes a meaningful non-default value.
- Delete unused props.
- Build shared primitives only when a current product surface needs them.
- Reuse existing controls before adding parallel implementations.

## Duplication

- Extract only the identical logic shared by near-duplicate components.
- Keep caller-specific data, fields, and copy local when the flows can diverge.
- Avoid generic components whose configuration is larger than the duplication
  they replace.

## Interaction

- Preserve accessible names, keyboard access, visible focus, and usable target
  sizes.
- Keep destructive actions explicit and recoverable where practical.
- Preserve user input across navigation and changes in presentation.
- Never start a drag from a nested interactive control.

## Cleanup

- Work biggest-cut-first: dead files and dependencies, dead props, duplication,
  then copy.
- Apply safe deletions directly and verify them with the repository's checks.
- Flag changes to business behavior before including them in a cleanup pass.
