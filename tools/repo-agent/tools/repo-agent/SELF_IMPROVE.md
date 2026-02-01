# Self-Improve Guidance for repo-agent

This document exists to record conservative, auditable guidance for automated "self_improve" operations that modify the repository-agent sources.

Principles
- Minimal, low-risk edits only: prefer documentation, tests, linting, or small refactors that do not change public APIs.
- Safety first: avoid touching integration code that interacts with external services unless explicitly reviewed.
- Reversible by default: changes should be easy to revert (small commits, clear summaries).
- Auditability: every automated change should include a rationale and verification steps in the plan metadata.

Allowed targets (by default)
- tools/repo-agent/src/core/**: small fixes, robustness improvements, and logging.
- tools/repo-agent/src/schemas/**: clarifications and minor safe adjustments.

Disallowed or restricted targets (conservative defaults)
- tools/repo-agent/src/integrations/** and src/integrations/**: network or external-service code requires human review.
- Any changes that broaden permissions, disable safety checks, or modify critical guardrails without explicit approval.

Verification expectations for automated changes
- Plans should include before/after summaries and verification steps.
- CI or a human should validate that the change compiles and tests (if present) pass.

If you are unsure whether a change is safe, open a manual PR and request human review.
