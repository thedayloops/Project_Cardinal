// tools/repo-agent/src/core/Agent.ts

import fs from "node:fs/promises";
import simpleGit from "simple-git";
import path from "node:path";

import { ContextBuilder, type Trigger } from "./ContextBuilder.js";
import { createPlanner } from "./PlannerFactory.js";
import type { AgentConfig } from "./Config.js";
import { GitService } from "./GitService.js";
import type { PatchPlan } from "../schemas/PatchPlan.js";
import { loadLedger } from "../util/tokenLedger.js";
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
    this.artifactsAbsDir = resolveArtifactsDirAbs(cfg.repoRoot, cfg.artifactsDir);
    fs.mkdir(this.artifactsAbsDir, { recursive: true }).catch(() => {});
  }

  /* ---------------- STATUS ---------------- */

  async getStatus() {
    return {
      online: true,
      pending_plan: Boolean(this.pendingPlan),
      pending_plan_id: this.pendingPlanId,
      repo_agent_root: this.cfg.repoRoot,
      target_repo_root: this.cfg.targetRepoRoot,
    };
  }

  async getTokenStats() {
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

  /* ---------------- PLAN ---------------- */

  async run(mode: string, reason: string | null) {
    const planId = `plan_${Date.now()}`;
    const root =
      mode === "self_improve" ? this.cfg.repoRoot : this.cfg.targetRepoRoot;

    const trigger: Trigger = {
      kind: "discord",
      command: "agent_run",
      mode,
    };

    const git = simpleGit(root);

    const ctxBuilder = new ContextBuilder(root, git, {
      maxFileBytes: this.cfg.guardrails.maxFileBytes,
      maxFiles: this.cfg.planner.maxFiles,
      maxCharsPerFile: this.cfg.planner.maxCharsPerFile,
      maxTotalChars: this.cfg.planner.maxTotalChars,
    });

    const ctx = await ctxBuilder.buildMinimal(trigger);

    const plan = (await this.planner.planPatch({
      repo: { root, headSha: ctx.headSha, branch: ctx.branch },
      scope: {
        files: ctx.files.map((f) => f.path),
        total_ops: 0,
        estimated_bytes_changed: 0,
      },
      mode,
      reason: reason ?? undefined,
      filesPreview: ctx.files,
    })) as PatchPlan;

    (plan as any).meta = (plan as any).meta ?? {};
    (plan as any).meta.mode = mode;

    this.pendingPlan = plan;
    this.pendingPlanId = planId;

    return { planId, patchPlan: plan };
  }

  /* ---------------- EXECUTE ---------------- */

  async executeApprovedPlan() {
    if (!this.pendingPlan || !this.pendingPlanId) {
      throw new Error("No pending plan.");
    }

    const planId = this.pendingPlanId;
    const mode = (this.pendingPlan as any)?.meta?.mode;
    const root =
      mode === "self_improve" ? this.cfg.repoRoot : this.cfg.targetRepoRoot;

    const git = simpleGit(root);
    const gitSvc = new GitService(root);
    const originalHead = await gitSvc.getHeadSha();
    const branch = `agent/${planId}`;

    try {
      await gitSvc.createBranch(branch);

      const executor = new PatchExecutor({ repoRoot: root });
      await executor.applyAll(this.pendingPlan.ops);

      const status = await git.status();
      if (
        !status.not_added.length &&
        !status.created.length &&
        !status.modified.length &&
        !status.deleted.length &&
        !status.renamed.length
      ) {
        throw new Error("Execution produced no changes.");
      }

      const commit = await gitSvc.addAllAndCommit(
        `agent: ${this.pendingPlan.meta?.goal ?? "apply"} (${planId})`
      );

      this.clearPendingPlan();

      return {
        branch,
        commit,
        filesChanged: await gitSvc.diffNameStatus(originalHead),
        diffSnippet: "",
        diffFull: "",
      };
    } catch (err) {
      await git.checkout("main").catch(() => {});
      await git.raw(["reset", "--hard", originalHead]).catch(() => {});
      await git.deleteLocalBranch(branch, true).catch(() => {});
      this.clearPendingPlan();
      throw err;
    }
  }

  /* ---------------- MERGE ---------------- */

  async mergeLastAgentBranch() {
    const git = new GitService(this.cfg.repoRoot);
    const branches = await git.listLocalBranches();

    const last = branches
      .filter((b: string) => b.startsWith("agent/"))
      .sort()
      .at(-1);

    if (!last) {
      throw new Error("No agent branch available to merge.");
    }

    await git.checkout("main");
    await git.merge(last);

    return { mergedBranch: last };
  }

  /* ---------------- CLEANUP ---------------- */

  async cleanupAgentBranches() {
    const git = new GitService(this.cfg.repoRoot);
    const branches = await git.listLocalBranches();

    const toDelete = branches.filter(
      (b: string) => b !== "main" && b.startsWith("agent/")
    );

    for (const b of toDelete) {
      await git.deleteBranch(b, true);
    }

    return { deleted: toDelete };
  }
}
