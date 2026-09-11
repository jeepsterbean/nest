# Assistant context

How a message to the Assistant is assembled, what the user controls, and where
each piece lives. Domain words follow `CONTEXT.md`: Task, Phase, Brain dump,
Metric check-in.

## The model

A sent message is built from ordered **parts**. Each part renders its own text
independently; the sent message is their concatenation.

Four parts draw on Nest data — Task, Phase, Brain dump, Metric — and each one
is off by default. One part is the text typed in the composer. The user may
add literal text parts anywhere between them.

```
Tasks · active
  Ship the map view
    status: active · scope: nest
    blocked by: Fix the pan jitter
  Write the migration
    status: active · scope: nest

Phase · last 1h
  Doing 34m · Scoping 15m · Resting 8m · Offline 3m

Brain dumps · last 3
  13:58  the api refactor is bigger than I thought
  12:40  remember to check the migration order
  11:02  feeling scattered, too many tabs

Metrics · last 1h
  14:02  focus 5  control 3  energy 4
  13:15  focus 4  control 3  energy 4

──
what should I pick up next?
```

Every turn is assembled the same way. There is no first-turn special case and
no conversation-level context state: each message carries whatever was selected
when it was sent, or nothing.

What is stored is text, not a query. Sending runs the selection once and saves
the complete assembled user input on that message; nothing re-runs it later. A
block attached at turn three still shows turn three's figures when the model
reads it at turn ten. Selecting the source again is what gives the model
current data.

## Sources and selections

Each source has one selection, chosen per message. `None` is the default.

| Source | Selections |
|---|---|
| Task | none · active · working now · active + up next · active + up next + backlog |
| Phase | none · last 15m · last 30m · last 1h |
| Brain dump | none · last 1/3/5 · last 15m · 30m · 1h · 3h |
| Metric | none · last 1/2/3 check-ins · last 15m · 30m · 1h |

Phase renders as aggregated totals over the window, matching how Logs
summarises Phase. The other three render as lists, newest first.

Rendering is fixed for Phase, Brain dump and Metric — their records carry
almost nothing to choose between. Task is the exception, below.

## Task detail

Task rendering is configurable, because a Task has many attributes and most
questions need few of them. The title is always included; everything else is a
toggle:

```
status · scope · description · blockers · parent · children
value · effort · worked time · created · updated
```

`blockers` carries Ready / Blocked with it. Readiness is derived from the
unresolved Blocker list, so a separate toggle could only produce a
contradiction.

Detail is one global set, not per message. The dropdown row picks *which*
Tasks; Config decides *what* each one shows.

## Layout

The order of parts, and what sits between them, is user-configured. A layout is
an ordered list where each entry is either a source block or literal text:

```ts
type LayoutPart =
  | { kind: "block"; block: "task" | "phase" | "dump" | "metric" | "message" }
  | { kind: "text"; text: string };
```

- `message` is required and appears exactly once.
- A source block set to `none` renders nothing and leaves no gap.
- Text parts always render, whatever the blocks around them do. They are for
  standing framing ("Answer in two sentences"), and the preview shows exactly
  what a given arrangement produces, so a stranded separator is visible before
  it is ever sent.

Default: the four source blocks, then `message`.

Reordering uses the existing `useListSort` hook (`src/dashboard/hooks/useListSort.ts`),
the same drag behaviour as the Pulse and Metric lists.

## Chat view

One row of four dropdowns above the composer, terse labels:

```
┌───────────────────────────────────────────────────────────────────┐
│  Tasks [Active ▾]   Phase [1h ▾]   Dumps [3 ▾]   Metrics [1h ▾]   │
├───────────────────────────────────────────────────────────────────┤
│  Message Assistant                                                │
│  [Thinking partner ▾]                       [5.6 Luna ▾]    [→]   │
└───────────────────────────────────────────────────────────────────┘
```

Prompt and model move into the composer and stay live on every turn. The
current `assistant-chat__toolbar` branch that renders them read-only once a
conversation exists is removed — prompt is per message now, like everything
else.

Dropdowns use the existing `MenuSelect`. Selections persist in localStorage
beside the pane and drafts already there.

In the thread, a message with extra Nest data or literal layout text shows a
collapsed chip, expandable to audit exactly what was sent.

## Config view

A preview browser. Pick a source, pick a selection, read the exact text that
selection produces against live data. No editing, no saving, no naming.

Two sections beyond that:

- **Task detail** — the toggles above, with the preview updating live.
- **Layout** — the ordered part list, drag to reorder, text parts editable in
  place, with a preview of the whole assembled message.

Prompts keep their existing list-and-editor.

## Storage

One migration:

```sql
ALTER TABLE assistant_messages ADD COLUMN context TEXT;
```

That column holds the assembled context text as sent, separate from the typed
message. It is the only durable artifact: it makes the transcript honest about
what the model actually saw.

Everything else is configuration and lives in localStorage next to
`nest:assistant-pane` and `nest:assistant-chat-drafts`:

- current dropdown selections
- Task detail toggles
- layout

No preset table, no settings row, no per-source tables.

## Backend

Context is assembled in TypeScript. The queries already exist and take the
ranges these selections need:

- `list_brain_dumps(from, to, limit)` — covers both the count and window forms
- `list_metric_check_ins(from, to)` — check-ins with ratings attached
- `list_phase_check_ins(from, to)` — already includes the checkpoint before the
  range, so an ongoing Phase carries into the window
- `list_tasks()` — filtered by status client-side

Phase aggregation reuses `phaseSessions`, `phaseSessionTotals` and
`foldIdleIntoOffline` from `src/dashboard/lib/timeline.ts`, the same fold Logs
uses. Reimplementing that in Rust would duplicate subtle behaviour — leading
phase carry-in, gap handling, idle folding — for no gain.

Rust changes are small:

- `send_assistant_message` takes `context: Option<String>`, stored on the user
  message by `start_turn`.
- Each message in the request input is prefixed with its local `HH:MM`, so the
  model can reason about elapsed time. The frontend passes its UTC offset with
  the send; formatting is integer arithmetic on `created_at`, which avoids a
  date dependency (`Cargo.toml` has none today).
- `instructions` carries the selected prompt alone.
- `active_task_context` and `response_instructions` are deleted. Their
  hardcoded injection guard moves into prompt text, where the user owns it.

## Out of scope

Dropped deliberately, listed so they are not re-derived:

- **Presets** — saved named combinations of prompt and selections. The
  dropdowns remember their last values; revisit only if that proves annoying.
- **A global preamble** — one always-applied text above the prompt. The
  selected prompt is the system instructions, full stop.
- **Configurable rendering for Phase, Brain dump and Metric.**
- **A template language** for block shape. Layout ordering plus text parts
  covers the cases raised; a template engine does not earn its cost.
- **Per-source libraries of saved, named selections.** The selections are short
  fixed lists; a library over an enum is ceremony.

## Known ceiling

Context blocks replay on every subsequent turn, so attaching a wide selection
across ten turns re-sends ten blocks. `HISTORY_MESSAGE_LIMIT` (40 messages)
bounds it, and nothing has hit that bound yet. If it bites, the fix is to
replay only the most recent block per source and drop superseded ones — the
`context` column already stores what is needed to do that.
