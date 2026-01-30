// tools/repo-agent/src/core/StubPlanner.ts
import type { IPlanner, PlannerInput } from "./PlannerFactory.js";

export class StubPlanner implements IPlanner {
  async planPatch(_input: PlannerInput) {
    return {
      meta: {
        goal: "noop",
        rationale: "LLM disabled – stub planner produced no changes.",
        confidence: 0.0,
      },
      scope: {
        files: [],
        total_ops: 0,
        estimated_bytes_changed: 0,
      },
      expected_effects: [],
      ops: [],
      verification: {
        steps: [],
        success_criteria: [],
      },
    };
  }
}
