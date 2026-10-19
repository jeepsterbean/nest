# Coding standards

These standards apply to every coding assistant working in a repository.
Repository-specific domain language, architecture, commands, and documentation
paths belong in the root `AGENTS.md` or equivalent project guide.

## Self-documenting code

- Prefer descriptive, domain-aligned names.
- Keep function and type names intention-revealing.
- Add comments only for non-obvious decisions, invariants, and tradeoffs.
- Explain why a constraint exists instead of narrating an obvious operation.

Example: Document the Why, Not the Obvious What

Low-value comment:
  // Increment retry count
  retry_count = retry_count + 1

High-value comment:
  // Billing provider closes refunds at next-day midnight, so keep a one-day grace period.
  refund_grace_period_days = 1
  is_refund_eligible = days_since_purchase <= refund_window_days + refund_grace_period_days

## Documentation stays current

- Update the closest authoritative documentation with each code change.
- Record durable facts, invariants, workflows, and rationale rather than
  changelog-style summaries.
- Remove or correct documentation made stale by the change.
- Documentation-only changes need no companion documentation update.

## Implementation

- Reuse existing helpers, types, and patterns before adding new ones.
- Prefer clear, typed interfaces and preserve strict type checking.
- Validate untrusted or user-provided input at application seams.
- Keep modules focused and avoid duplicated constants, configuration, and
  business rules.
- Preserve existing behavior and unrelated user changes unless the request
  intentionally updates them.

## Verification

- Run checks proportionate to the change before handing it off.
- Report skipped checks and known warnings explicitly.
