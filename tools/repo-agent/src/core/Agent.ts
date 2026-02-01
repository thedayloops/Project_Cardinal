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
import { runCmdNoShell } from "../util/childProc.js";
import { ensureDir, writeFileAtomic, fileExists } from "../util/fsSafe.js";

type LastBranchState = {
  branch: string;
  planId: string;
  atIso: string;
};

type VerificationState = {
  branch: string;
  planId: string;
  atIso: string;
  ok: boolean;
  exitCode: number | null;
  durationMs: number;
  stdoutPath: string;
  stderrPath: string;
};

function npmCmd(): string {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

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

  private resolveActiveRepo(mode: string) {
    if (mode === "self_improve") {
      return {
        root: this.cfg.repoRoot,
        isSelfImprove: true,
      };
    }

    return {
      root: this.cfg.targetRepoRoot,
      isSelfImprove: false,
    };
  }

  private lastBranchFileAbs(): string {
    return path.join(this.artifactsAbsDir, "last_agent_branch.json");
  }

  private lastVerificationFileAbs(): string {
    return path.join(this.artifactsAbsDir, "last_agent_verification.json");
  }

  private async writeLastBranch(state: LastBranchState) {
    await ensureDir(this.artifactsAbsDir);
    await writeFileAtomic(this.lastBranchFileAbs(), JSON.stringify(state, null, 2));
  }

  private async readLastBranch(): Promise<LastBranchState | null> {
    const p = this.lastBranchFileAbs();
    if (!(await fileExists(p))) return null;
    const raw = await fs.readFile(p, "utf8");
    return JSON.parse(raw) as LastBranchState;
  }

  private async clearLastBranch() {
    await fs.rm(this.lastBranchFileAbs(), { force: true }).catch(() => {});
  }

  private async writeLastVerification(state: VerificationState) {
    await ensureDir(this.artifactsAbsDir);
    await writeFileAtomic(this.lastVerificationFileAbs(), JSON.stringify(state, null, 2));
  }

  private async readLastVerification(): Promise<VerificationState | null> {
    const p = this.lastVerificationFileAbs();
    if (!(await fileExists(p))) return null;
    const raw = await fs.readFile(p, "utf8");
    return JSON.parse(raw) as VerificationState;
  }

  private async clearLastVerification() {
    await fs.rm(this.lastVerificationFileAbs(), { force: true }).catch(() => {});
  }

  async getStatus() {
    const lastBranch = await this.readLastBranch().catch(() => null);
    const lastVerify = await this.readLastVerification().catch(() => null);

    return {
      online: true,
      pending_plan: Boolean(this.pendingPlan),
      pending_plan_id: this.pendingPlanId,
      repo_agent_root: this.cfg.repoRoot,
      target_repo_root: this.cfg.targetRepoRoot,
      last_agent_branch: lastBranch?.branch ?? null,
      last_agent_branch_plan_id: lastBranch?.planId ?? null,
      last_agent_verification: lastVerify
        ? {
            ok: lastVerify.ok,
            planId: lastVerify.planId,
            branch: lastVerify.branch,
            atIso: lastVerify.atIso,
            stdoutPath: lastVerify.stdoutPath,
            stderrPath: lastVerify.stderrPath,
          }
        : null,
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

    (plan as any).meta = (plan as any).meta ?? {};
    (plan as any).meta.mode = mode;

    this.pendingPlan = plan;
    this.pendingPlanId = planId;

    return { planId, patchPlan: plan };
  }

  // -------------------------
  // EXECUTION PHASE
  // -------------------------
  async executeApprovedPlan(): Promise<{
    branch: string;
    commit: string;
    filesChanged: string;
    diffSnippet: string;
    diffFull: string;
    verification?: VerificationState;
  }> {
    if (!this.pendingPlan || !this.pendingPlanId) {
      throw new Error("No pending plan.");
    }

    const planId = this.pendingPlanId;
    const mode = (this.pendingPlan as any)?.meta?.mode ?? "unknown";
    const active = this.resolveActiveRepo(mode);

    const branch = `agent/${planId}`;
    const gitSvc = new GitService(active.root);
    const git = simpleGit(active.root);

    const headBefore = await gitSvc.getHeadSha();

    await gitSvc.createBranch(branch);

    const executor = new PatchExecutor({ repoRoot: active.root });
    await executor.applyAll(this.pendingPlan.ops);

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
      `agent: ${this.pendingPlan.meta?.goal ?? "apply"} (${planId})`
    );

    // Persist last branch (for /agent_merge and /agent_cleanup)
    await this.writeLastBranch({
      branch,
      planId,
      atIso: new Date().toISOString(),
    });

    const diffNames = await gitSvc.diffNameStatus(headBefore);
    const diffFull = await gitSvc.diffUnified(headBefore, 400_000);

    const diffSnippet =
      diffFull.length > 1800
        ? diffFull.slice(0, 1800) + "\n…TRUNCATED…"
        : diffFull;

    // NEW: self-improve verification (TypeScript build)
    let verification: VerificationState | undefined;

    if (active.isSelfImprove) {
      verification = await this.verifyRepoAgentBuild(planId, branch);
      await this.writeLastVerification(verification);
    }

    this.clearPendingPlan();

    return {
      branch,
      commit,
      filesChanged: diffNames,
      diffSnippet,
      diffFull,
      verification,
    };
  }

  private async verifyRepoAgentBuild(planId: string, branch: string): Promise<VerificationState> {
    await ensureDir(this.artifactsAbsDir);

    const stdoutPath = path.join(
      this.artifactsAbsDir,
      `verify_build_${planId}_stdout.log`
    );
    const stderrPath = path.join(
      this.artifactsAbsDir,
      `verify_build_${planId}_stderr.log`
    );

    const r = await runCmdNoShell({
      cmd: npmCmd(),
      args: ["run", "build"],
      cwd: this.cfg.repoRoot,
      timeoutMs: 20 * 60 * 1000,
    });

    await writeFileAtomic(stdoutPath, r.stdout ?? "");
    await writeFileAtomic(stderrPath, r.stderr ?? "");

    return {
      branch,
      planId,
      atIso: new Date().toISOString(),
      ok: r.ok,
      exitCode: r.exitCode,
      durationMs: r.durationMs,
      stdoutPath,
      stderrPath,
    };
  }

  // -------------------------
  // MERGE COMMAND (gated by verification)
  // -------------------------
  async mergeLastAgentBranch() {
    const lastBranch = await this.readLastBranch();
    if (!lastBranch?.branch) {
      throw new Error("No agent branch available to merge.");
    }

    const lastVerify = await this.readLastVerification();

    // Require successful verification for self-improve merges
    if (!lastVerify || lastVerify.branch !== lastBranch.branch || !lastVerify.ok) {
      throw new Error(
        "Last self-improve branch is not verified (npm run build failed or was not run). Fix the branch, then re-run /agent_run self_improve and approve, or re-run build locally and re-execute a verified plan."
      );
    }

    const branch = lastBranch.branch;
    const git = new GitService(this.cfg.repoRoot);

    const status = await git.status();
    if (status.files.length > 0) {
      throw new Error("Working tree is not clean.");
    }

    await git.checkout("main");
    await git.merge(branch);

    return { mergedBranch: branch };
  }

  // -------------------------
  // CLEANUP COMMAND
  // -------------------------
  async cleanupAgentBranches() {
    const git = new GitService(this.cfg.repoRoot);
    const branches = await git.listLocalBranches();

    const toDelete = branches.filter(
      (b) => b !== "main" && b.startsWith("agent/")
    );

    for (const branch of toDelete) {
      await git.deleteBranch(branch, true);
    }

    await this.clearLastBranch();
    await this.clearLastVerification();

    return { deleted: toDelete };
  }
}
