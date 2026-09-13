# Functionality backlog

Track user-facing product work: behaviors, flows, and capabilities the app
should gain or change. Describe outcomes only — no implementation details,
APIs, schema, or code structure.

## P1 Currently when i start my session, it might take a while for me to switch my mind back into the right mode. like, what am i supposed to be doing? we should have a mechanism to keep track of this at a glance.

## Brain dump
- Keep a minimised floating Brain dump's expand button visible at every width; reserve its space and clip overflowing summary text to the remaining width.

## Metrics
- need to think how to make it useable. its currently weak
> as a user i rarely consider it/think of it

## Task section
- add task time feature
- user never ever states the value and effort. need to think about how to encourage user to use it more
- refine the visuals

## Dashboard sections
- Let every section except Overview use the full dashboard window for its own content; hide Reminders on Calendar, Insights, Log, and other non-overview sections.

## Inactivity pause and resume
- P2: When the user returns from inactivity, open a short prompt asking whether they are still working on the same Task(s); Yes resumes what was paused, No leaves them paused.

## Status
New data model. which basically, is textual summary of what the user is doing from time A to B


## insights page 
- currently useless, should probably be implemented when the LLM feature lands

## Text entry
- Turn off autocorrect, autocapitalisation and spellcheck in every text field
  the app has, so typed text stays exactly as typed. The Brain dump editor
  already behaves this way and is the only one that does. The fields that still
  rewrite what you type:
  - Tasks: task title rename, task description, the dashboard task composer, the
    popup's active-task box, new child task, new scope, and the task name in the
    timeline stretch editor.
  - Names and renames: tags, reminders, pulses, metrics, and saved grid layouts.
  - Brain dump: the "Find a tag" search box.
  - Assistant: the chat composer, chat title rename, option names, the option
    amount field, system instructions, prompt titles, prompt text, and the
    message template.
  - Settings: the OpenAI key field.
