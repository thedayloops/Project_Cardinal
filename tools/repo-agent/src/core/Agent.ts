// src/core/Agent.ts
import simpleGit, { SimpleGit } from "simple-git";

import { createPlanner } from "./PlannerFactory.js";
import { ContextBuilder } from "./ContextBuilder.js";
import type { Trigger } from "./ContextBuilder.js";
import { GitService } from "./GitService.js";
import { Guardrails } from "./Guardrails.js";

export class Agent {
  private planner: any;
  private lastPlan: any | null = null;
  private config: any;

  private gitService: GitService;
  private simpleGit: SimpleGit;
  private guardrails: Guardrails;

  constructor(config: any) {
    this.config = config;

    this.gitService = new GitService(config.repoRoot);
    this.simpleGit = simpleGit(config.repoRoot, { binary: "git" });
    this.guardrails = new Guardrails(config.guardrails);

    this.planner = createPlanner(config);
  }

  async getStatus() {
    const head = await this.gitService.getHeadSha();
    const branch = await this.gitService.getCurrentBranch();
    const status = await this.gitService.statusSummary();

    return {
      online: true,
      llm_enabled: this.config.enableLLM,
      planner: this.config.enableLLM ? "openai" : "stub",
      repoRoot: this.config.repoRoot,
      branch,
      head,
      git_status: status,
      pending_plan: !!this.lastPlan,
    };
  }

  async run(mode: string, reason: string | null) {
    const ctxBuilder = new ContextBuilder(
      this.config.repoRoot,
      this.simpleGit,
      {
        maxFileBytes: this.config.guardrails.maxFileBytes,
      }
    );

    const ctx = await ctxBuilder.buildMinimal(
      "agent_run" as unknown as Trigger
    );

    const plan = await this.planner.planPatch({
      ...ctx,
      mode,
      reason,
    });

    this.lastPlan = plan;
    return plan;
  }

  getPendingPlan() {
    return this.lastPlan;
  }

  clearPendingPlan() {
    this.lastPlan = null;
  }
}
