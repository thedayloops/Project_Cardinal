import simpleGit from "simple-git";
import { PatchPlan } from "../schemas/PatchPlan.js";
import { Guardrails } from "./Guardrails.js";
import { PatchApplier } from "./PatchApplier.js";
import { VerificationRunner, VerificationResult } from "./VerificationRunner.js";

export type ApprovalExecutionResult = {
  branch: string;
  committed: boolean;
  commitSha?: string;
  diff: string;
  verification?: VerificationResult;
};

export class ApprovalExecutor {
  private git;

  constructor(
    private repoRoot: string,
    private guardrails: Guardrails,
    private verifier?: VerificationRunner
  ) {
    this.git = simpleGit({ baseDir: repoRoot });
  }

  async execute(planId: string, plan: PatchPlan): Promise<ApprovalExecutionResult> {
    this.guardrails.validatePatchPlan(plan);

    const baseBranch = (await this.git.revparse(["--abbrev-ref", "HEAD"])).trim();
    const headBefore = (await this.git.revparse(["HEAD"])).trim();
    const branch = `agent/${planId}`;

    try {
      await this.git.checkoutLocalBranch(branch);

      const applier = new PatchApplier(this.repoRoot);
      await applier.apply(plan);

      await this.git.add(["-A"]);
      const commitMsg = `repo-agent: ${plan.meta.goal} (${planId})`;
      const commitRes = await this.git.commit(commitMsg);

      let verification: VerificationResult | undefined;

      if (this.verifier && plan.verification.steps.length > 0) {
        verification = await this.verifier.run(plan.verification.steps[0]);
        if (!verification.success) {
          throw new Error("Verification failed");
        }
      }

      const diff = await this.git.diff([`${headBefore}..HEAD`]);

      return {
        branch,
        committed: true,
        commitSha: commitRes.commit,
        diff: diff || "(no diff)",
        verification
      };
    } catch (err) {
      await this.git.reset(["--hard"]).catch(() => {});
      await this.git.checkout(baseBranch).catch(() => {});
      await this.git.branch(["-D", branch]).catch(() => {});
      throw err;
    } finally {
      await this.git.checkout(baseBranch).catch(() => {});
    }
  }
}
