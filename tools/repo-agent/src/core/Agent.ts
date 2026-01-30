// tools/repo-agent/src/core/Agent.ts
import simpleGit, { SimpleGit } from "simple-git";

import type { AgentConfig } from "./Config.js";
import { GitService } from "./GitService.js";
import { ContextBuilder, type Trigger } from "./ContextBuilder.js";
import { createPlanner } from "./PlannerFactory.js";
import type { PlannerInput } from "./PlannerFactory.js";
import type { PatchPlan } from "../schemas/PatchPlan.js";

export type AgentRunResult = {
  planId: string;
  patchPlan: PatchPlan;
};

export class Agent {
  private gitService: GitService;
  private git: SimpleGit;
  private pendingPlan: PatchPlan | null = null;

  constructor(private readonly config: AgentConfig) {
    this.gitService = new GitService(config.repoRoot);
    this.git = simpleGit(config.repoRoot, { binary: "git" });
  }

  async getStatus() {
    return {
      online: true,
      llm_enabled: this.config.enableLLM,
      planner: this.config.enableLLM ? "openai" : "stub",
      repoRoot: this.config.repoRoot,
      branch: await this.gitService.getCurrentBranch(),
      head: await this.gitService.getHeadSha(),
      git_status: await this.gitService.statusSummary(),
      pending_plan: Boolean(this.pendingPlan),
    };
  }

  async run(mode: string, reason: string | null): Promise<AgentRunResult> {
    // Always produce a planId so Discord never shows undefined
    const planId = `plan_${Date.now()}`;

    // Build context using the real ContextBuilder signature
    const trigger: Trigger = {
      kind: "discord",
      command: "/agent_run",
      mode,
    };

    const builder = new ContextBuilder(this.config.repoRoot, this.git, {
      maxFileBytes: this.config.guardrails.maxFileBytes,
    });

    const ctx = await builder.buildMinimal(trigger);

    // Adapt AgentContext -> PlannerInput (exact required shape)
    const filesPreview = ctx.files.map((f) => ({
      path: f.path.replaceAll("\\", "/"),
      content: f.content,
    }));

    const scope = ctx.scope ?? {
      files: filesPreview.map((f) => f.path),
      total_ops: 0,
      estimated_bytes_changed: 0,
    };

    const input: PlannerInput = {
      repo: {
        root: ctx.repoRoot,
        headSha: ctx.headSha,
        branch: ctx.branch,
      },
      scope,
      mode,
      reason: reason ?? undefined,
      filesPreview,
    };

    // Planner selection is already handled by createPlanner(config)
    // If enableLLM=false => StubPlanner still returns a valid PatchPlan (noop)
    const planner = createPlanner(this.config);

    const patchPlan = (await planner.planPatch(input)) as PatchPlan;

    this.pendingPlan = patchPlan;

    return { planId, patchPlan };
  }

  clearPendingPlan() {
    this.pendingPlan = null;
  }

  getPendingPlan() {
    return this.pendingPlan;
  }
}
