// tools/repo-agent/src/core/ApprovalExecutor.ts

import type { PatchPlan } from "../schemas/PatchPlan.js";

export class ApprovalExecutor {
  async execute(plan: PatchPlan, branch: string) {
    // ApprovalExecutor must NEVER mutate git state.
    // Branch lifecycle is owned exclusively by Agent.ts.
    // This executor only exists to encapsulate approval logic.

    // Currently approval is implicit once executeApprovedPlan is called.
    // This file intentionally does nothing destructive.

    return true;
  }
}
