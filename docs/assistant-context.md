# Assistant context

How a message to the Assistant is assembled, what the user controls, and where
each piece lives. Domain words follow `CONTEXT.md`: Task, Phase, Brain dump,
Metric check-in.

## The model

A request to OpenAI has two parts:

- **instructions** — Config's System instructions only.
- **input** — earlier turns of the chat, then this message rendered through
  the Layout template, stamped with the local `HH:MM`.

The template is text with tokens. Each signal token is replaced by that
signal's block for the option selected on this message; `{message}` is the
typed text:

```
{tasks}

{phase}

{dumps}

{metrics}

{message}
```

renders, with Tasks · Active and Dumps · Last 3 selected, as:

```
14:05  Tasks · active
- Ship the map view
  status: active · scope: Nest
  blocked by: Fix the pan jitter

Brain dumps · last 3
- 1:58 PM  the api refactor is bigger than I thought
- 1:37 PM  remember to check the migration order
- 1:13 PM  feeling scattered, too many tabs open

What should I pick up next?
```

- A signal with nothing selected, or with no records in range, renders empty,
  and the blank lines around it fold to one gap.
- A template without `{message}` still sends the message, appended at the end.
- Every turn is assembled the same way; there is no first-turn special case.

What is stored is text, not a query. Sending renders once and saves the
complete input on the message's `context` column; nothing re-runs it later.
Selecting the source again is what gives the model current data.

## Signals and options

Each signal — Brain dump, Metric, Phase, Tasks — has a user-edited list of
named options. The chat's menu for that signal offers exactly those options,
by name, plus none. One option per signal may be marked **default**: it is
preselected on every new chat. With no default, the menu starts at none.

| Signal | What an option covers | Seeded options |
|---|---|---|
| Brain dump | last N dumps · last N minutes | 1 · 3 · 5 · 15m · 1h · 3h |
| Metric | last N check-ins · last N minutes | 1 · 3 · 30m · 1h |
| Phase | last N minutes | 15m · 30m · 1h |
| Tasks | any mix of Working now / Active / Up next / Backlog | Working now · Active · Active + Up next · Active + Up next + Backlog |

An option is `{ id, name, key }`. The key is what it covers: `last:3`,
`window:60` (minutes), `active+up_next`. Windows cap at 1440 minutes. Chat
reads only the history the dashboard loads (`HISTORY_WINDOW_DAYS`, 30 days), so
"last N" means the newest N within the last 30 days; older records never reach
chat, even though the Brain dump composer's history can show them. The block sent to the model is headed by the
key's description ("Brain dumps · last 3"), never the name, so a name cannot
misstate the range.

Brain dumps cap at `MAX_CONTEXT_DUMPS` (20) per message, newest first,
because dumps run long and a wide window could otherwise flood the input. A
trimmed block says so in its heading ("Brain dumps · last 3h · newest 20 of
34"), and the Brain dump section notes the cap. Count options for Brain dump
stop at the cap too.

Adding an option starts from its name alone. It stays an unsaved draft until
what it covers is filled in and saved; editing an existing option works the
same way, with Revert instead of Discard.

Phase renders as the session timeline over the window, oldest first, using the
same settled stretches Logs builds (`phaseSessionsInWindow`). The other three
render as lists, newest first. A row from an earlier day carries its day
("Yesterday 9:05 AM"): a count option can reach back days, and a bare clock
time would pass the record off as today.

## Task detail

A Task has many attributes and most questions need few of them. The title is
always included; everything else is one global set of toggles in the Tasks
section, applied whichever option picked the Tasks:

```
status · scope · description · blockers · parent · children
value · effort · worked time · created · updated
```

`blockers` carries Ready / Blocked with it. Readiness is derived from the
unresolved Blocker list, so a separate toggle could only produce a
contradiction.

## Config view

Settings → Assistant holds the OpenAI key. Assistant Config has a sidebar:

| Section | What it holds |
|---|---|
| Chat: Brain dump · Metric · Phase · Tasks | The option list with defaults, a name field to start a new option, the option editor, and the exact block the option being edited renders. Tasks adds the detail toggles. |
| Chat: Prompt | The saved message-text library and editor. Selecting one fills the composer. |
| System: System instructions | One text sent as instructions on every request. |
| System: Layout | The template editor with insertable tokens, beside the final output: instructions and input exactly as OpenAI receives them for a new chat. |

The Brain dump, Metric, and Phase previews render the current records the
dashboard has loaded, using the option being edited. Tasks renders against
sample data (`sampleData(now)` in `src/dashboard/lib/assistantContext.ts`), so
a stable sample shows every option's shape side by side. Sample records are
timed back from the current clock; a fixed sample day made "last 1h" list clock
times that read as hours old. The Layout preview uses each signal's default.

## Chat view

One row of four menus above the composer, one per signal. Selections are not
persisted: a new chat resets them to the defaults, and changing a default in
Config also moves the current selection.

Selecting a Prompt replaces the composer draft with that Prompt's saved text.

In the thread, a message whose input differs from the typed text shows a
collapsed chip, expandable to audit exactly what was sent.

## Storage

`assistant_messages.context` holds the rendered input as sent. It is the only
durable artifact: it makes the transcript honest about what the model saw.

Everything else is configuration in localStorage under
`nest:assistant-context`: option lists and defaults, Task detail, System
instructions, and the template. Each field falls back to its default on its
own, so Task detail from the earlier shape carries over.

## Backend

Context is rendered in TypeScript from data the dashboard already loads.
Phase sessions reuse `phaseSessionsInWindow` from
`src/dashboard/lib/timeline.ts`, the same collapse Logs uses.

`send_assistant_message` takes `context` (stored on the user message) and
`system_instructions` (the complete request instructions, not stored). Each
message in the request input is prefixed with its local `HH:MM`.

Saved chats are shared SQLite. After a turn is saved, or a chat is renamed or
deleted, Rust emits `assistant-history-changed` so both windows refresh the
list and the open thread. The emit happens before `send_assistant_message`
returns, so a refresh that started mid-send must not replace the thread this
window just wrote. Each window keeps its own selection. Window focus is a
backup refresh, because the popup stays mounted while hidden.

## Out of scope

- **Presets** — saved combinations of prompt and selections.
- **Configurable rendering for Phase, Brain dump and Metric** — their records
  carry almost nothing to choose between.
- **Per-option Task detail** — one global set covers the questions raised.

## Known ceiling

Context replays on every subsequent turn, so attaching a wide selection across
ten turns re-sends ten blocks. `HISTORY_MESSAGE_LIMIT` (40 messages) bounds
it. If it bites, replay only the most recent block per signal.
