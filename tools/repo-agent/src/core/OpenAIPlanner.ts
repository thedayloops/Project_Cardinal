import { AgentContext } from "./ContextBuilder.js";
import { PatchPlan } from "../schemas/PatchPlan.js";
import { IPlanner } from "./PlannerFactory.js";

export class OpenAIPlanner implements IPlanner {
  constructor(
    private repoRoot: string,
    private artifactsDir: string
  ) {}

  async planPatch(ctx: AgentContext): Promise<PatchPlan> {
    const scope = ctx.scope ?? {
      files: [],
      total_ops: 0,
      estimated_bytes_changed: 0
    };

    return {
      meta: {
        goal: "noop",
        rationale: "OpenAI planning is not enabled yet.",
        confidence: 0.0
      },

      scope,

      // ✅ MUST be string[]
      expected_effects: [],

      ops: [],

      verification: {
        steps: [],
        success_criteria: []
      }
    };
  }
}
