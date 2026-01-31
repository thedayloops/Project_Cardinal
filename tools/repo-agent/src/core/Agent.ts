// tools/repo-agent/src/core/Agent.ts
import fs from "node:fs/promises";
import simpleGit from "simple-git";

import { ContextBuilder, type Trigger } from "./ContextBuilder.js";
import { createPlanner } from "./PlannerFactory.js";
import type { AgentConfig } from "./Config.js";
import { GitService } from "./GitService.js";
import { Guardrails } from "./Guardrails.js";
import type { PatchPlan } from "../schemas/PatchPlan.js";
import { loadLedger, type Ledger } from "../util/tokenLedger.js";
import { resolveArtifactsDirAbs } from "../util/artifactsDir.js";
import { PatchExecutor } from "./PatchExecutor.js";

export type AgentProposal = {
  planId: string;
  patchPlan: PatchPlan;
};

export type StatusResult = {
  online: boolean;
  llm_enabled: boolean;
  planner: string;
  repoRoot: string;
  branch: string;
  head: string;
  git_status: string;
  pending_plan: boolean;
};

function normalizePlanForGuardrails(plan: PatchPlan): PatchPlan {
  // Hardening: ensure planner outputs always satisfy Guardrails' minimum shape.
  // This is intentionally conservative and only normalizes known footguns.
  for (const op of plan.ops ?? []) {
    if ((op as any).start_line == null || (op as any).start_line < 1) {
      (op as any).start_line = 1;
    }
    if (op.type === "create_file" || op.type === "update_file") {
      (op as any).end_line = null;
    }
    // Normalize Windows paths to forward slashes for consistency.
    if (typeof (op as any).file === "string") {
      (op as any).file = (op as any).file.replace(/\\/g, "/");
    }
  }
  // Keep scope in sync (avoid misleading summaries)
  if (!plan.scope.total_ops || plan.scope.total_ops <= 0) {
    plan.scope.total_ops = plan.ops?.length ?? 0;
  }
  if ((plan.scope.files?.length ?? 0) === 0 && (plan.ops?.length ?? 0) > 0) {
    plan.scope.files = Array.from(new Set((plan.ops ?? []).map((o: any) => o.file))).filter(Boolean);
  }
  return plan;
}

export class Agent {
  private cfg: AgentConfig;
  private gitSvc: GitService;
  private planner: ReturnType<typeof createPlanner>;
  private guardrails: Guardrails;

  private artifactsAbsDir: string;
  private pendingPlan: PatchPlan | null = null;
  private pendingPlanId: string | null = null;

  constructor(cfg: AgentConfig) {
    this.cfg = cfg;
    this.gitSvc = new GitService(cfg.repoRoot);
    this.planner = createPlanner(cfg);

    this.artifactsAbsDir = resolveArtifactsDirAbs(cfg.repoRoot, cfg.artifactsDir);

    this.guardrails = new Guardrails({
      repoRoot: cfg.repoRoot,
      lockedPathPrefixes: cfg.guardrails.lockedPathPrefixes,
      deniedPathPrefixes: cfg.guardrails.deniedPathPrefixes,
      maxOps: cfg.guardrails.maxOps,
      maxTotalPatchBytes: cfg.guardrails.maxTotalWriteBytes,
    });

    fs.mkdir(this.artifactsAbsDir, { recursive: true }).catch(() => {});
  }

  async getStatus() {
    return {
      online: true,
      llm_enabled: this.cfg.enableLLM,
      planner: this.cfg.enableLLM ? "openai" : "stub",
      repoRoot: this.cfg.repoRoot,
      branch: await this.gitSvc.getCurrentBranch(),
      head: await this.gitSvc.getHeadSha(),
      git_status: await this.gitSvc.statusSummary(),
      pending_plan: Boolean(this.pendingPlan),
    };
  }

  async getTokenStats(): Promise<Ledger> {
    return loadLedger(this.artifactsAbsDir);
  }

  getLastPlan(): PatchPlan | null {
    return this.pendingPlan;
  }

  getPendingPlanId(): string | null {
    return this.pendingPlanId;
  }

  clearPendingPlan() {
    this.pendingPlan = null;
    this.pendingPlanId = null;
  }

  async run(mode: string, reason: string | null): Promise<AgentProposal> {
    const planId = `plan_${Date.now()}`;

    const trigger: Trigger = {
      kind: "discord",
      command: "agent_run",
      mode,
    };

    const git = simpleGit(this.cfg.repoRoot);
    const ctxBuilder = new ContextBuilder(this.cfg.repoRoot, git, {
      maxFileBytes: this.cfg.guardrails.maxFileBytes,
      maxFiles: this.cfg.planner.maxFiles,
      maxCharsPerFile: this.cfg.planner.maxCharsPerFile,
      maxTotalChars: this.cfg.planner.maxTotalChars,
    });

    const ctx = await ctxBuilder.buildMinimal(trigger);

    const plan = (await this.planner.planPatch({
      repo: { root: this.cfg.repoRoot, headSha: ctx.headSha, branch: ctx.branch },
      scope: {
        files: ctx.files.map((f) => f.path),
        total_ops: 0,
        estimated_bytes_changed: 0,
      },
      mode,
      reason: reason ?? undefined,
      filesPreview: ctx.files,
    } as any)) as PatchPlan;

    normalizePlanForGuardrails(plan);

    // Confidence gate for self-improvement
    if (mode === "self_improve" && (plan.meta?.confidence ?? 0) < 0.6) {
      throw new Error("Self-improvement confidence too low.");
    }

    this.guardrails.validatePatchPlan(plan);
    this.pendingPlan = plan;
    this.pendingPlanId = planId;

    return { planId, patchPlan: plan };
  }

  async executeApprovedPlan() {
    if (!this.pendingPlan || !this.pendingPlanId) {
      throw new Error("No pending plan to execute.");
    }

    this.guardrails.validatePatchPlan(this.pendingPlan);

    const planId = this.pendingPlanId;
    const branchName = `agent/${planId}`;
    const baseRef = "HEAD";

    await this.gitSvc.createBranch(branchName);

    const executor = new PatchExecutor({ repoRoot: this.cfg.repoRoot });
    await executor.applyAll(this.pendingPlan.ops);

    // 🔒 ENFORCE NON-EMPTY DIFF
    const diffNames = await this.gitSvc.diffNameStatus(baseRef);
    if (!diffNames.trim()) {
      throw new Error(
        "Patch execution produced no file changes. Commit aborted."
      );
    }

    const goal = this.pendingPlan.meta?.goal ?? "apply patch";
    const commit = await this.gitSvc.addAllAndCommit(
      `agent: ${goal} (${planId})`
    );

    const diffFull = await this.gitSvc.diffUnified(baseRef, 400_000);
    const diffSnippet =
      diffFull.length > 1800
        ? diffFull.slice(0, 1800) + "\n…TRUNCATED…"
        : diffFull;

    this.clearPendingPlan();

    return {
      planId,
      branch: branchName,
      commit,
      filesChanged: diffNames.trim(),
      diffSnippet,
      diffFull,
    };
  }
}
