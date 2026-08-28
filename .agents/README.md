# Documentation map

How Nest’s docs are layered. Update the **closest authoritative** file for
each kind of change — see `standards/coding-standards.md` for the full rule.

## Read order for UI work

1. **`.impeccable.md`** — how it should feel (tone, principles, aesthetic)
2. **`CONTEXT.md`** — what the product means and how views behave
3. **`standards/ui-standards.md`** — Nest-specific implementation hooks when
   touching dashboard or popup code

## Layers

| File | Layer | Update when |
|------|-------|-------------|
| `README.md` | Entry | Setup, repo-wide status, where to find other docs |
| `CONTEXT.md` | Domain | Product language, lifecycle rules, view behavior |
| `.impeccable.md` | Design | Brand personality, aesthetic direction, UX principles |
| `BACKLOG-FUNCTIONALITY.md` | Work | Product features parked, closed, or newly opened |
| `BACKLOG-BACKEND.md` | Work | Engineering backlog (backend, infra, cross-cutting) |
| `FEATURE-REQUESTS.md` | Work | Incoming ideas not yet triaged into a backlog |
| `standards/coding-standards.md` | Process | How assistants change code and which doc to edit |
| `standards/ui-standards.md` | Implementation | CSS hooks, component constraints, UI cleanup rules |

## What does not belong where

- **Domain behavior** (Logs filters, Calendar drag rules, Task statuses) →
  `CONTEXT.md`, not ui-standards or impeccable
- **Feel and heuristics** (calm, progressive disclosure, compact layout) →
  `.impeccable.md`, not ui-standards
- **Class names, file paths, prop discipline, `HOUR_PX`** →
  `standards/ui-standards.md`, not impeccable or CONTEXT
- **Open work** → backlogs, not CONTEXT

## Standards copies

`standards/coding-standards.md` and `standards/ui-standards.md` in this folder
are canonical. Keep identical copies in `.claude/standards/` and
`.codex/standards/` for tools that read those paths by default.

## Impeccable skills

Design skills (`frontend-design`, `polish`, `audit`, `teach-impeccable`, etc.)
read `.impeccable.md` at the project root. Keep that file short and
qualitative; do not move Nest implementation rules into it.
