# Dashboard agent guide

This guide applies under `src/dashboard/`. Read the root `AGENTS.md` first,
then only the surface document it routes for the task.

## Structure and data flow

- Dashboard code is grouped into `views/`, `task/`, `context/`, `lib/`,
  `components/`, `hooks/`, and `styles/`.
- Sections are Recap and Core. Recap switches between Calendar and
  Timeline. Insights can sit beside either. Core contains Brain dump, Tasks, Metrics,
  and Phases. The Sidebar's Settings button opens the Settings overlay.
- Keep view files focused on composition. Load and mutate shared application
  data through `DashboardDataContext`.
- Put pure derivations in `lib/` and reusable stateful behavior in `hooks/`.
  Extend an existing helper before growing a view or creating a parallel
  implementation.
- Frontend IPC goes through the helpers exported by `src/lib/commands/`.
  Shared DTOs come from `src/lib/types/`.

## Presentation

- Dashboard CSS enters through `Dashboard.css`; its ordered imports under
  `styles/` define the cascade. Extend the existing surface stylesheet and
  class pattern.
- Read `.agents/standards/ui-standards.md` and `.impeccable.md` before visual
  changes. `UI.md` covers shared controls and cross-surface rules; a surface's
  storage keys live in its `docs/` file, and non-obvious class or layout
  constraints are commented beside their rules in `styles/`.
- Preserve accessible names, keyboard interaction, visible focus, drafts, and
  narrow-width behavior.
- Reuse shared controls and icons before adding another implementation. Do not
  add a CSS framework unless explicitly requested.

## Domain behavior

- Use `CONTEXT.md` vocabulary in user-facing copy and types.
- Prefer the shared formatters in `lib/time.ts` for dashboard dates and times.
- Keep shared record rules, lifecycle, and calculations in `docs/domain/`;
  use the root ownership table to choose the topic. Frontend preferences and
  interactions belong in `docs/interface/`.
- Keep Day, Table, and Map behavior in `docs/interface/tasks.md`, Calendar behavior in
  `docs/interface/calendar.md`, rules shared by
  time surfaces in `docs/interface/time-surfaces.md`, Metrics behavior in `docs/interface/metrics.md`, and Brain dump
  behavior in `docs/interface/brain-dump.md`.
- For editor selection, focus, draft synchronization, TipTap, or ProseMirror,
  follow `.agents/skills/brain-dump-text-editor/SKILL.md`.

## Verification

Run from the repository root:

```sh
npm run test:typecheck
npm test
```

Also run `npm run build` when changes can affect bundling, CSS imports, or
TypeScript project references. Follow any additional manual checks in the
routed surface guide or skill.
