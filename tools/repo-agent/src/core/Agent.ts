import path from "node:path";
import fs from "node:fs/promises";
import simpleGit from "simple-git";

import { ContextBuilder, AgentContext } from "./ContextBuilder.js";
import { createPlanner } from "./PlannerFactory.js";
import { PatchPlan } from "../schemas/PatchPlan.js";

export type AgentRunMode = "scan" | "plan" | "verify" | "deep";

export type AgentProposal = {
  planId: string;
  plan: string;
  branch: string;
  base: string;
  summary: string;
  verification: string;
  diffSnippet: string;
  patchPlan?: PatchPlan;
};

export class Agent {
  private lastProposal: AgentProposal | null = null;
  private lastAppliedBranch: string | null = null;

  constructor(
    private cfg: {
      repoRoot: string;
      artifactsDir: string;
      guardrails: {
        maxOps: number;
        maxTotalWriteBytes: number;
        lockedPathPrefixes: string[];
        deniedPathPrefixes: string[];
      };
      commandsAllowlist: Record<string, unknown>;
    }
  ) {}

  async trigger(trigger: {
    kind: "discord" | "manual" | "watcher";
    command?: string;
    mode?: AgentRunMode;
  }) {
    const git = simpleGit({ baseDir: this.cfg.repoRoot });

    const ctxBuilder = new ContextBuilder(
      this.cfg.repoRoot,
      git,
      { maxFileBytes: 25_000 }
    );

    const ctx: AgentContext = await ctxBuilder.buildMinimal(trigger);

    ctx.scope = {
      files: ctx.files.map(f => f.path),
      total_ops: 0,
      estimated_bytes_changed: 0
    };

    const planner = createPlanner(
      trigger.mode ?? "scan",
      this.cfg.repoRoot,
      this.cfg.artifactsDir
    );

    const patchPlan = await planner.planPatch(ctx);
    const planId = `plan_${Date.now()}`;

    await this.persistPatch(planId, patchPlan);

    this.lastProposal = {
      planId,
      plan: patchPlan.meta.goal,
      branch: "(dry-run)",
      base: "HEAD",
      summary: patchPlan.meta.rationale,
      verification:
        patchPlan.verification.steps.length
          ? patchPlan.verification.steps.join(", ")
          : "Not executed",
      diffSnippet: "(no changes)",
      patchPlan
    };
  }

  getLastProposal() {
    return this.lastProposal;
  }

  async executeApproval(planId: string) {
    const git = simpleGit({ baseDir: this.cfg.repoRoot });
    const branch = `agent/${planId}`;

    await git.checkoutLocalBranch(branch);
    await git.add(".");
    await git.commit(`repo-agent: apply ${planId}`);

    this.lastAppliedBranch = branch;
    return { branch };
  }

  async mergeLastExecution() {
    if (!this.lastAppliedBranch) {
      throw new Error("No applied branch to merge");
    }

    const git = simpleGit({ baseDir: this.cfg.repoRoot });
    const base = (await git.revparse(["--abbrev-ref", "HEAD"])).trim();

    await git.checkout(base);
    await git.merge([this.lastAppliedBranch]);
    await git.branch(["-D", this.lastAppliedBranch]);

    this.lastAppliedBranch = null;
  }

  private async persistPatch(planId: string, plan: PatchPlan) {
    const file = path.join(
      this.cfg.artifactsDir,
      `${planId}_patch.json`
    );
    await fs.writeFile(file, JSON.stringify(plan, null, 2), "utf8");
  }
}
