# SELF_IMPROVE NOTICE

This file documents conservative, auditable rules for the agent's "self_improve" mode.

Key points:

- The agent is allowed to modify files under tools/repo-agent/** when running in self_improve mode.
- Changes must be minimal, low-risk, and prioritize safety, correctness, and auditability.
- The agent must avoid changing public APIs in breaking ways.
- High-risk or external integration code (for example: src/integrations/) is intentionally denied by default.
- All changes should be reversible by default; the system prefers edits that can be undone or committed to an agent/* branch for review.

If you are reviewing an agent-generated branch, prefer to:

1. Inspect the branch and commit(s) carefully.
2. Run unit tests and linters before merging.
3. Prefer non-breaking refactors and small, well-documented improvements.

This notice is intentionally brief and informational. It exists to improve human understanding of why limited self-modification is permitted and to reduce accidental modifications to sensitive integration code.
