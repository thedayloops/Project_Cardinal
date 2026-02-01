# Repo-Agent Self-Improve Guidance

This file documents the intended safety boundaries and guidance for the repository planning agent's `self_improve` mode.

Purpose
- Provide a short, discoverable note for maintainers and auditors explaining what is allowed and what is intentionally blocked when the agent runs in `self_improve` mode.
- Non-executable documentation only — changes here do not affect runtime behavior.

Key constraints (summary)
- Minimal, low-risk changes only: the agent should avoid broad sweeping edits and prefer small, reversible updates.
- Deny prefixes: certain areas are intentionally off-limits in `self_improve` mode (examples below). This prevents the agent from autonomously modifying high-risk or external integration code.
- Locked paths: some repository paths (e.g. `node_modules/`, `.git/`) are treated as locked and must never be modified.
- Reversible defaults: planned operations should prefer reversible edits. The planner should mark `reversible: true` by default.

Example deny prefixes (canonical values maintained in code)
- src/integrations/
- tools/repo-agent/src/integrations/

Guidance for maintainers
- If a change to the deny list is necessary, prefer a manual review and an explicit config change rather than enabling the agent to edit those paths automatically.
- Keep self-improvement patches small and well-documented in the plan rationale and verification steps.
- Use standard code review and CI to validate any agent-produced branch before merging.

Verification steps the agent should include in its plans
1. Confirm the created/updated files are within the repository and not under locked or denied prefixes.
2. Ensure total changed bytes and number of ops are within configured guardrails.
3. Provide clear before/after summaries for human reviewers.

This file is intentionally informational and can be modified or removed by maintainers at any time.
