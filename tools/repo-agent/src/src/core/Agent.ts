// tools/repo-agent/src/core/Agent.ts

import fs from "node:fs/promises";
import path from "node:path";
import simpleGit from "simple-git";

import { ContextBuilder, type Trigger } from "./ContextBuilder.js";
import { createPlanner } from "./PlannerFactory.js";
import type { AgentConfig } from "./Config.js";
import { GitService } from "./GitService.js";
import type { PatchPlan } from "../schemas/PatchPlan.js";
import { loadLedger, type Ledger } from "../util/tokenLedger.js";
import { resolveArtifactsDirAbs } from "../util/artifactsDir.js";
import { PatchExecutor } from "./PatchExecutor.js";

export class Agent {
  private cfg: AgentConfig;
  private planner: ReturnType<typeof createPlanner>;
  private artifactsAbsDir: string;

  private pendingPlan: PatchPlan | null = null;
  private pendingPlanId: string | null = null;

  constructor(cfg: AgentConfig) {
    this.cfg = cfg;
    this.planner = createPlanner(cfg);

    this.artifactsAbsDir = resolveArtifactsDirAbs(
      cfg.repoRoot,
      cfg.artifactsDir
    );

    fs.mkdir(this.artifactsAbsDir, { recursive: true }).catch(() => {});
  }

  private resolveActiveRepo(mode: string) {
    if (mode === "self_improve") {
      return {
        root: this.cfg.repoRoot, // tools/repo-agent
        git: new GitService(this.cfg.repoRoot),
        isSelfImprove: true,
      };
    }

    return {
      root: this.cfg.targetRepoRoot,
      git: new GitService(this.cfg.targetRepoRoot),
      isSelfImprove: false,
    };
  }

  async getStatus() {
    return {
      online: true,
      pending_plan: Boolean(this.pendingPlan),
      repo_agent_root: this.cfg.repoRoot,
      target_repo_root: this.cfg.targetRepoRoot,
    };
  }

  async getTokenStats(): Promise<Ledger> {
    return loadLedger(this.artifactsAbsDir);
  }

  getLastPlan() {
    return this.pendingPlan;
  }

  getPendingPlanId() {
    return this.pendingPlanId;
  }

  clearPendingPlan() {
    this.pendingPlan = null;
    this.pendingPlanId = null;
  }

  // -------------------------
  // PLAN PHASE
  // -------------------------
  async run(mode: string, reason: string | null) {
    const planId = `plan_${Date.now()}`;
    const active = this.resolveActiveRepo(mode);

    const trigger: Trigger = {
      kind: "discord",
      command: "agent_run",
      mode,
    };

    const git = simpleGit(active.root);

    const ctxBuilder = new ContextBuilder(active.root, git, {
      maxFileBytes: this.cfg.guardrails.maxFileBytes,
      maxFiles: this.cfg.planner.maxFiles,
      maxCharsPerFile: this.cfg.planner.maxCharsPerFile,
      maxTotalChars: this.cfg.planner.maxTotalChars,
    });

    const ctx = await ctxBuilder.buildMinimal(trigger);

    const plan = (await this.planner.planPatch({
      repo: {
        root: active.root,
        headSha: ctx.headSha,
        branch: ctx.branch,
      },
      scope: {
        files: ctx.files.map((f) => f.path),
        total_ops: 0,
        estimated_bytes_changed: 0,
      },
      mode,
      reason: reason ?? undefined,
      filesPreview: ctx.files,
    })) as PatchPlan;

    // Ensure the planner-produced PatchPlan records the mode that initiated planning.
    // Without this, later execution may not know we intended 'self_improve' and could
    // apply changes to the wrong repository root.
    (plan as any).meta = (plan as any).meta ?? {};
    (plan as any).meta.mode = mode;

    this.pendingPlan = plan;
    this.pendingPlanId = planId;

    return { planId, patchPlan: plan };
  }

  // -------------------------
  // EXECUTION PHASE (FIXED ROOT)
  // -------------------------
  async executeApprovedPlan() {
    if (!this.pendingPlan || !this.pendingPlanId) {
      throw new Error("No pending plan.");
    }

    const mode = (this.pendingPlan as any)?.meta?.mode ?? "unknown";
    const active = this.resolveActiveRepo(mode);

    const branch = `agent/${this.pendingPlanId}`;
    const gitSvc = new GitService(active.root);
    const git = simpleGit(active.root);

    const headBefore = await gitSvc.getHeadSha();

    await gitSvc.createBranch(branch);

    // 🔑 CRITICAL FIX:
    // self_improve ops are relative to tools/repo-agent
    const executorRoot = active.isSelfImprove
      ? this.cfg.repoRoot
      : active.root;

    const executor = new PatchExecutor({ repoRoot: executorRoot });
    await executor.applyAll(this.pendingPlan.ops);

    // Detect working-tree changes
    const status = await git.status();
    const hasChanges =
      status.not_added.length ||
      status.created.length ||
      status.modified.length ||
      status.deleted.length ||
      status.renamed.length;

    if (!hasChanges) {
      throw new Error("Execution produced no changes.");
    }

    const commit = await gitSvc.addAllAndCommit(
      `agent: ${this.pendingPlan.meta?.goal ?? "apply"} (${this.pendingPlanId})`
    );

    const diffNames = await gitSvc.diffNameStatus(headBefore);
    const diffFull = await gitSvc.diffUnified(headBefore, 400_000);

    const diffSnippet =
      diffFull.length > 1800
        ? diffFull.slice(0, 1800) + "\n…TRUNCATED…"
        : diffFull;

    this.clearPendingPlan();

    return {
      branch,
      commit,
      filesChanged: diffNames,
      diffSnippet,
      diffFull,
    };
  }
}
