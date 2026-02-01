# SELF_IMPROVE GUIDANCE

This document records the allowed, auditable scope for "self_improve" mode for the repository planning agent.

- Allowed: minimal, low-risk, and well-documented modifications inside tools/repo-agent/** (bug fixes, safety/guardrail improvements, logging, tests, and developer ergonomics).
- Disallowed: changes that affect external integrations, production credentials, or behaviour of external services. See SELF_IMPROVE_DENY_PREFIXES in src/core/Guardrails.ts for explicit blocked paths.
- Requirements for any self_improve change:
  - Make only minimal, reversible edits.
  - Include clear rationale in the commit message.
  - Ensure changes are type-checked and pass the repository's tests/lint before merging.
  - Avoid breaking public APIs; prefer additive, well-tested adjustments.

This file is informational and intended to make self-improvement decisions auditable and low-risk.