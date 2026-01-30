import { IPlanner, FilePlan } from "./IPlanner.js";
import { AgentContext } from "./ContextBuilder.js";
import { PatchPlan } from "../schemas/PatchPlan.js";

export class StubPlanner implements IPlanner {
  async planFiles(_ctx: AgentContext): Promise<FilePlan> {
    return {
      intent: "noop",
      files: []
    };
  }

  async planPatch(_ctx: AgentContext): Promise<PatchPlan> {
    return {
      meta: {
        goal: "No changes",
        rationale: "Stub planner does not propose patches",
        confidence: 1.0
      },
      scope: {
        files: [],
        total_ops: 0,
        estimated_bytes_changed: 0
      },
      ops: [],
      expected_effects: [],
      verification: {
        steps: [],
        success_criteria: []
      }
    };
  }
}
