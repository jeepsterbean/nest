# Assistant context

How a message to the Assistant is assembled, what the user controls, and where
each piece lives. Domain words follow [`CONTEXT.md`](../CONTEXT.md): Task,
Phase, Brain dump, Metric check-in. The Assistant Section definition is there
too; this file is the assembly.

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
14:05  active
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
- A new chat starts from the defaults. After each send the menus return to
  none, so a follow-up is the typed text unless the user attaches a signal
  again. The same assembly runs every turn; empty menus yield the bare
  message.

What is stored is text, not a query. Sending renders once and saves the
complete input on the message's `sent_message` column; nothing re-runs it later.
Selecting the source again is what gives the model current data.

## Signals and options

Each signal — Brain dump, Metric, Phase, Tasks — has a user-edited list of
named options. The chat's menu for that signal offers exactly those options,
by name, plus none ("No dumps", "No metrics", "No phase", "No tasks"). One
option per signal may be marked **default**: it is preselected on every new
chat. With no default, the menu starts at none.

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
chat, even though the Brain dump composer's history can show them. Dumps, metrics and phase
blocks are headed by the key's description ("Brain dumps · last 3"), never the
name, so a name cannot misstate the range. A Tasks block lists each selected
group under its own heading (`working now`, `active`, …). A Task that is
Working now is listed only under that heading when the option includes it, so
it is not repeated under Active. That heading also lists the Task's Work
stretches from the same 30-day history, oldest first: each closed stretch as
start – end, the open one as start – now.

Brain dumps cap at `MAX_CONTEXT_DUMPS` (20) per message, newest first,
because dumps run long and a wide window could otherwise flood the input. A
trimmed block says so in its heading ("Brain dumps · last 3h · newest 20 of
34"), and the Brain dump section notes the cap. Count options for Brain dump
stop at the cap too.

Adding an option starts from its name alone. It stays an unsaved draft until
what it covers is filled in and saved; editing an existing option works the
same way, with Revert instead of Discard.

Phase renders as a timeline of Phase sessions over the window, oldest first,
the same settled set Calendar and Insights build (`phaseSessionsInWindow`). The
other three render as lists, newest first. A row from an earlier day carries
its day ("Yesterday 9:05 AM"): a count option can reach back days, and a bare
clock time would pass the record off as today.

## Task detail

A Task has many attributes and most questions need few of them. The title is
always included. Under working now, Work stretches are always included too.
Everything else is one global set of toggles in the Tasks section, applied
whichever option picked the Tasks:

```
status · scope · description · blockers · parent · children
value · effort · worked time · created · updated
```

`blockers` carries Ready / Blocked with it. Readiness is derived from the
unresolved Blocker list, so a separate toggle could only produce a
contradiction.

## Config view

Settings → Assistant holds the OpenAI key. Rust keeps it in the system keychain
and the renderer never receives it. The Assistant Section switches Chat /
Config (`nest:assistant-pane`, Chat when unset); composer and prompt drafts
persist in `nest:assistant-chat-drafts` and `nest:assistant-prompt-drafts`.
Assistant Config has a sidebar:

| Section | What it holds |
|---|---|
| Chat: Brain dump · Metric · Phase · Tasks | The option list with defaults, a name field to start a new option, the option editor, and the exact block the option being edited renders. Tasks adds the detail toggles. An IconPicker at the top of the section sets the composer menu icon. |
| Chat: Prompt | The saved message-text library and editor. Selecting one fills the composer. An IconPicker sets the Prompt menu icon. |
| System: System instructions | One text sent as instructions on every request. Saved versions list in a sidebar and open in a right panel. |
| System: Model | GPT-5.6 Luna or Terra, used by every message sent from then on, in every chat. |
| System: Layout | The template editor with insertable tokens, beside the final output: instructions and input exactly as OpenAI receives them for a new chat. |

Signal previews render the current records the dashboard has loaded, using the
option being edited. The Layout preview uses each signal's default against
those same records, with a sample typed message so the template has something
to fold around.

## Chat view

One row of four signal menus plus Prompt inside the composer, under the text
box and left of Send. The empty choice is "No dumps" (and the same for the
others), not the menu name, so none is not confused with a missing option. Selections are not persisted: a new chat
resets them to the defaults. After a send, or when opening a saved chat,
they return to none. Changing a default in Config only moves the selection
on a new chat that has not been sent yet. Removing a selected option clears
that pick, including when the other window deleted it.

Selecting a Prompt replaces the composer draft with that Prompt's saved text.

On the dashboard, every user message has an `Open` control that reveals its
saved input in a right overlay panel.

## Storage

`assistant_messages.sent_message` holds the rendered input as sent, and each
user message also snapshots `system_instructions`. Together they make the
transcript honest about what the model saw.

Everything else is configuration in localStorage under
`nest:assistant-context`: option lists and defaults, Task detail, System
instructions, the template, the model, and the Nest icon for each Chat
composer menu. System instructions become active only when
saved; every Save appends an immutable timestamped version in SQLite. Each field falls back to its default on its
own, so Task detail from the earlier shape carries over.

## Backend

Context is rendered in TypeScript from data the dashboard already loads.
Phase sessions reuse `phaseSessionsInWindow` from
`src/dashboard/lib/timeline.ts`, the same collapse Timeline uses.

`send_assistant_message` takes `sent_message` and `system_instructions`, both
stored on the user message. Each message in the request input is prefixed with
its local `HH:MM`. Nest retains a sent message when OpenAI cannot complete its
reply, and marks any partial reply as incomplete. The Assistant never changes
Tasks.

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

Attaching the same wide selection on many turns still stacks those blocks in
history. Follow-ups start at none, so that only happens on purpose.
`HISTORY_MESSAGE_LIMIT` (40 messages) bounds it. If it bites, replay only the
most recent block per signal.
