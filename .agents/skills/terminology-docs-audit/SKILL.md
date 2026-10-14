---
name: terminology-docs-audit
description: Audit Nest's terminology and documentation against product copy and implemented behavior to find inconsistencies and sources of confusion. Use when asked to review naming, domain language, documentation accuracy, or conflicting explanations across this codebase.
---

# Nest terminology and documentation audit

Produce a grounded review of language and documentation that could mislead a
user or contributor. An audit request authorizes investigation and findings;
apply corrections when the user also requests fixes.

## Establish the intended meaning

- Read root `AGENTS.md` for the current documentation map and repo constraints,
  then `CONTEXT.md` for domain definitions and resolved ambiguities.
- Use the documentation ownership table in `AGENTS.md` to locate each fact's
  authoritative source. Read relevant surface docs, `UI.md`, and
  `.impeccable.md` as the audit reaches those areas. Avoid copying a second
  glossary into this skill.
- For a whole-codebase audit, cover the domain glossary, surface docs, setup
  guidance, and agent instructions; trace their claims into corresponding
  frontend and backend source. For a scoped request, follow that surface and
  its shared concepts.
- Inspect the working tree before reviewing. Include current local changes in
  the evidence and preserve unrelated work.

## Compare language with behavior

Use `rg` to locate terms and claims in documentation, visible copy, accessible
names, tooltips, empty states, and related code. Follow each candidate into
its rendering or behavior before reporting it. Search matches are leads.

Prioritize distinctions that change the reader's understanding:

- persisted Task status versus derived Ready/Blocked and Working now;
- Parent/Child hierarchy versus Blocker/Dependent readiness and Scope;
- Work stretch, Worked time, Timer, Popup, Pulse, and Metric check-in;
- live Phase derivation versus historical display labels and recovery rules;
- formal **Section** destinations, layouts, saved views, Recap presentations,
  and Logs when the distinction changes behavior; lowercase "section" is a
  general-purpose word and does not need to identify a precise surface type;
- stored records versus the surfaces that display or capture them.

Check documentation for contradictory definitions, stale navigation or feature
claims, misleading examples, outdated setup commands, broken local links, and
duplicated rules that have drifted. Verify behavioral claims against command
handlers, domain logic, shared types, and focused tests as appropriate. Tests
provide supporting evidence; read the implementation behind a claim.

Distinguish current behavior, intended behavior, and historical or planned
behavior. Migrations, compatibility identifiers, dated backlog entries, and
internal technical names can legitimately use older vocabulary. Read the
exceptions in `CONTEXT.md` before proposing renames. Check the Sidebar in
code before describing a surface as currently reachable.

When docs and code disagree, state both sides and identify which decision
needs resolution. A mismatch alone does not establish whether the code or the
documentation should change. Separate demonstrated inconsistencies from
wording suggestions and questions about product intent.

Use source inspection for this audit. Honor the repository's restriction on
opening Chrome to check visual changes.

## Report actionable findings

Lead with the issues most likely to cause incorrect use or implementation.
For each finding, provide:

- the conflicting wording or behavior, with precise file and line links to
  both sides where available;
- the specific misunderstanding it creates;
- a minimal correction and the authoritative file that should own it;
- any uncertainty that requires a product decision.

Group repeated instances of the same conceptual issue. Prefer concrete
findings over a list of every search hit or stylistic preference. State the
scope reviewed and meaningful coverage limits. If the reviewed scope is
consistent, say so and identify any remaining uncertainties.

If fixes are requested, update the closest authoritative source and affected
copy or references together. Follow routed implementation skills when fixes
touch lifecycle, editor behavior, schema, or IPC. Check local links and the
diff for documentation-only edits; run the repository's required checks when
code changes. Keep audit findings in chat unless a saved artifact is requested.
