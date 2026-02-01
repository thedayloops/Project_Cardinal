# repo-agent: core overview

This file provides a lightweight, internal summary of the core components in tools/repo-agent/src/core.

Purpose
- Provide quick orientation for contributors working on the planning/execution pipeline.
- Call out observability helpers (defaultLogger) and safe self_improve guidance.

Key notes
- This is a non-functional, documentation-only change. It does not modify code or public APIs.
- Logger: use `defaultLogger` from src/core/Logger.ts for consistent structured output.
  - The repository exposes a shared singleton `defaultLogger` to make it easy to emit info/debug/warn/error
  messages consistently across modules. Prefer `defaultLogger` instead of ad-hoc console calls.
  - The Logger includes a `debug` method that falls back to console.log where console.debug is not available.
  - The module also exports a small constant `defaultLogLevel` (e.g. `"debug"`) to document the intended
  log level for local development and debugging without changing runtime behavior. Consumers can reference
  this constant to align tooling or tests with the project's suggested verbosity.
  - Note: prefer reading `defaultLogLevel` alongside `defaultLogger` when writing or testing code that depends on verbosity.
- Guardrails: modifications that affect integrations/external surfaces are intentionally restricted in self_improve mode — prefer manual review for high-risk changes.

Where to look
- Context building: src/core/ContextBuilder.ts
- Planning: src/core/OpenAIPlanner.ts
- Guardrails/validation: src/core/Guardrails.ts
- Patch application: src/core/PatchApplier.ts

Observability & troubleshooting tips
- Use defaultLogger.info/debug/warn/error for structured logs.
- Logging is intentionally non-fatal across the agent; code tries to ensure logging failures never throw.
- If you need more verbose output while developing, inspect debug logs (the Logger has a debug method that is safe to call in all environments).

If you need to expand this file, keep changes minimal and document rationale for future reviewers.

Quick reminder (non-functional): prefer the shared `defaultLogger` for structured output across modules. Keep self_improve edits minimal, auditable, and reversible — avoid changes that modify external integrations or public APIs without manual review.

Note: The Logger module (src/core/Logger.ts) exports a named singleton `defaultLogger` and a small constant `defaultLogLevel`. Prefer using these shared exports for consistent structured logging and to align tooling or tests with the intended verbosity. This README update is purely informational and does not change runtime behavior.
