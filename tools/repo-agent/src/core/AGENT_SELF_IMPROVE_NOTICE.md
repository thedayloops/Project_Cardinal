# repo-agent: self_improve guidance (internal)

This short note is intended for contributors working on tools/repo-agent/src/core who are performing small, auditable self_improve edits.

Key principles
- Minimal, low-risk changes only: prefer documentation, logging, and non-breaking additions.
- Prioritize safety and auditability: include rationale in commits and avoid changing external integrations or public APIs without explicit manual review.
- Reversible defaults: make changes easy to revert (small, single-purpose commits; avoid wide refactors).
- Observability: prefer using the shared `defaultLogger` from src/core/Logger.ts for structured output.

Safe edit examples
- Add or update small documentation files (like this one).
- Add non-breaking helper methods that do not alter public signatures.
- Improve logging messages, add debug logs that do not throw.

High-risk changes (avoid without review)
- Modifying integration code under src/integrations/ or external adapters.
- Changing API surface or exported types consumed by other repositories.
- Changes that alter authentication, secrets handling, or network integrations.

Remember: this file is purely documentation and introduces no runtime behavior changes. If you need to expand self_improve edits beyond documentation or small helpers, create a clear PR with tests and an explanation of why the change is safe.
