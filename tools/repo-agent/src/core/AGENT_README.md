# repo-agent: core overview

This file provides a lightweight, internal summary of the core components in tools/repo-agent/src/core.

Purpose
- Provide quick orientation for contributors working on the planning/execution pipeline.
- Call out observability helpers (defaultLogger) and safe self_improve guidance.

Key notes
- This is a non-functional, documentation-only change. It does not modify code or public APIs.
- Logger: use `defaultLogger` from src/core/Logger.ts for consistent structured output.
- Guardrails: modifications that affect integrations/external surfaces are intentionally restricted in self_improve mode — prefer manual review for high-risk changes.

Where to look
- Context building: src/core/ContextBuilder.ts
- Planning: src/core/OpenAIPlanner.ts
- Guardrails/validation: src/core/Guardrails.ts
- Patch application: src/core/PatchApplier.ts

If you need to expand this file, keep changes minimal and document rationale for future reviewers.
