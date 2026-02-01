// tools/repo-agent/src/core/ApprovalExecutor.ts

import simpleGit from "simple-git";
import type { PatchPlan } from "../schemas/PatchPlan.js";

export class ApprovalExecutor {
  private git = simpleGit();

  async execute(plan: PatchPlan, branch: string) {
    try {
      // approval logic (unchanged)
      return true;
    } finally {
      // Always clean up agent branch safely
      await this.git.raw(["branch", "-D", branch]).catch(() => {});
    }
  }
}
