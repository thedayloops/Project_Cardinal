# Self-Improve Guidance (Repository Agent)

This file documents conservative, auditable guidance for automated "self_improve" changes made by the repository agent.

Purpose
- Provide a human-readable summary of the safety constraints and preferred behavior for automated changes to the agent's own code.
- Serve as an easy-to-find audit artifact when reviewing agent-created commits or branches.

Key constraints (conservative defaults)
- Minimal, low-risk changes only: prefer small, well-scoped updates over sweeping refactors.
- Reversible defaults: every automated change should be reversible (e.g. via a dedicated branch and a clear commit message).
- Avoid breaking public APIs: modifications to exported interfaces, CLI flags, or network contracts should be avoided unless explicitly reviewed.
- Restricted areas: integrations and external adapter code should be treated as higher-risk and remain off-limits for automatic self-improvement unless explicitly permitted.

Operational notes
- Branch lifecycle: the agent creates a branch for each plan (prefixed with `agent/`), and human review is expected before merging into `main`.
- Audit trail: keep a rationale and high-level summary in plan metadata; reviewers should check the commit and plan metadata.
- Prefer documentation and tests: when possible, automated changes should include small docs or tests to explain intent and verify behavior.

Where to configure these rules
- The guardrails and behavior are primarily configured in `src/core/Guardrails.ts` and `src/core/Config.ts`.
- This file is informational only and does not change runtime behavior.

This file was added to improve transparency around the agent's self-improvement behavior. Human reviewers should use it as a quick reference when assessing agent-created branches or commits.
