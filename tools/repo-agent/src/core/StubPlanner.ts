import { IPlanner, FilePlan } from "./IPlanner.js";
import { AgentContext } from "./ContextBuilder.js";
import { PatchPlan } from "../schemas/PatchPlan.js";

export class StubPlanner implements IPlanner {
  async planFiles(_: AgentContext): Promise<FilePlan> {
    return {
      intent: "stub-no-op",
      files: []
    };
  }

  async planPatch(_: AgentContext): Promise<PatchPlan> {
    return {
      meta: {
        planId: "stub",
        createdAtIso: new Date().toISOString(),
        baseRef: "HEAD",
        branchName: "agent/stub",
        commitMessage: "stub: no-op",
        unlockPathPrefixes: [],
        rollback: {
          strategy: "git_branch",
          baseHead: "HEAD",
          instructions: "Delete branch"
        }
      },
      intent: "No-op stub",
      ops: [],
      verify: { commands: [] },
      notes: {
        summary: "Stub planner produced no changes.",
        risks: [],
        followups: []
      }
    };
  }
}
