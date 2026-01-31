// tools/repo-agent/src/core/Agent.ts
import fs from "node:fs/promises";
import path from "node:path";
import simpleGit from "simple-git";

import { ContextBuilder, type Trigger } from "./ContextBuilder.js";
import { createPlanner } from "./PlannerFactory.js";
import type { AgentConfig } from "./Config.js";
import { GitService } from "./GitService.js";
import { Guardrails } from "./Guardrails.js";
import type { PatchPlan } from "../schemas/PatchPlan.js";
import { loadLedger, type Ledger } from "../util/tokenLedger.js";
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

function estimateTokensFromChars(chars: number): number {
  return Math.ceil(chars / 4);
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

    this.artifactsAbsDir = path.isAbsolute(cfg.artifactsDir)
      ? cfg.artifactsDir
      : path.resolve(cfg.repoRoot, cfg.artifactsDir);

    this.guardrails = new Guardrails({
      repoRoot: cfg.repoRoot,
      lockedPathPrefixes: cfg.guardrails.lockedPathPrefixes,
      deniedPathPrefixes: cfg.guardrails.deniedPathPrefixes,
      maxOps: cfg.guardrails.maxOps,
      maxTotalPatchBytes: cfg.guardrails.maxTotalWriteBytes,
    });

    void fs.mkdir(this.artifactsAbsDir, { recursive: true });
  }

  async getStatus(): Promise<StatusResult> {
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

    if (!this.cfg.enableLLM) {
      const noop: PatchPlan = {
        meta: { goal: "noop", rationale: "LLM disabled", confidence: 0 },
        scope: { files: [], total_ops: 0, estimated_bytes_changed: 0 },
        expected_effects: [],
        ops: [],
        verification: { steps: [], success_criteria: [] },
      };
      this.pendingPlan = noop;
      this.pendingPlanId = planId;
      return { planId, patchPlan: noop };
    }

    const git = simpleGit(this.cfg.repoRoot);

    const buildCtx = async (maxFiles: number) => {
      const ctxBuilder = new ContextBuilder(this.cfg.repoRoot, git, {
        maxFileBytes: this.cfg.guardrails.maxFileBytes,
        maxFiles,
        maxCharsPerFile: this.cfg.planner.maxCharsPerFile,
        maxTotalChars: this.cfg.planner.maxTotalChars,
      });
      return ctxBuilder.buildMinimal(trigger);
    };

    const ctx1 = await buildCtx(this.cfg.planner.maxFiles);

    const trimToBudget = (files: { path: string; content: string }[]) => {
      let out = [...files];
      while (out.length > 1) {
        const payloadStr = JSON.stringify({
          repo: { root: this.cfg.repoRoot, headSha: ctx1.headSha, branch: ctx1.branch },
          mode,
          reason: reason ?? undefined,
          scope: { files: out.map((f) => f.path), total_ops: 0, estimated_bytes_changed: 0 },
          filesPreview: out,
        });
        const est = estimateTokensFromChars(payloadStr.length + 800);
        if (est <= this.cfg.planner.maxInputTokens) return out;
        out.pop();
      }

      const payloadStr = JSON.stringify({
        repo: { root: this.cfg.repoRoot, headSha: ctx1.headSha, branch: ctx1.branch },
        mode,
        reason: reason ?? undefined,
        scope: { files: out.map((f) => f.path), total_ops: 0, estimated_bytes_changed: 0 },
        filesPreview: out,
      });

      const est = estimateTokensFromChars(payloadStr.length + 800);
      if (est > this.cfg.planner.maxInputTokens) {
        throw new Error(
          `Planner input budget exceeded even after trimming (est ${est} > ${this.cfg.planner.maxInputTokens}). ` +
            `Reduce AGENT_PLANNER_MAX_CHARS_PER_FILE or AGENT_PLANNER_MAX_TOTAL_CHARS.`
        );
      }
      return out;
    };

    // pass 1
    const pass1Files = trimToBudget(ctx1.files);

    const plannerInput1 = {
      repo: { root: this.cfg.repoRoot, headSha: ctx1.headSha, branch: ctx1.branch },
      scope: { files: pass1Files.map((f) => f.path), total_ops: 0, estimated_bytes_changed: 0 },
      reason: reason ?? undefined,
      mode,
      filesPreview: pass1Files,
    };

    const plan1 = (await this.planner.planPatch(plannerInput1 as any)) as PatchPlan;
    this.guardrails.validatePatchPlan(plan1);

    const wantsSecond =
      ["plan", "verify", "deep"].includes(mode) &&
      (plan1.ops?.length ?? 0) === 0 &&
      this.cfg.planner.secondPassMaxFiles > this.cfg.planner.maxFiles;

    if (wantsSecond) {
      try {
        const ctx2 = await buildCtx(this.cfg.planner.secondPassMaxFiles);
        const pass2Files = trimToBudget(ctx2.files);

        const plannerInput2 = {
          repo: { root: this.cfg.repoRoot, headSha: ctx2.headSha, branch: ctx2.branch },
          scope: { files: pass2Files.map((f) => f.path), total_ops: 0, estimated_bytes_changed: 0 },
          reason: reason ?? undefined,
          mode,
          filesPreview: pass2Files,
        };

        const plan2 = (await this.planner.planPatch(plannerInput2 as any)) as PatchPlan;
        this.guardrails.validatePatchPlan(plan2);

        if (
          (plan2.ops?.length ?? 0) > 0 ||
          (plan2.meta?.confidence ?? 0) >= (plan1.meta?.confidence ?? 0)
        ) {
          this.pendingPlan = plan2;
          this.pendingPlanId = planId;
          return { planId, patchPlan: plan2 };
        }
      } catch {
        // ignore; keep plan1
      }
    }

    this.pendingPlan = plan1;
    this.pendingPlanId = planId;
    return { planId, patchPlan: plan1 };
  }

  /**
   * Executes the currently pending plan on a NEW branch: agent/<planId>.
   * Always validates guardrails before touching disk.
   */
  async executeApprovedPlan(): Promise<{
    planId: string;
    branch: string;
    commit: string;
    filesChanged: string;
    diffSnippet: string;
    diffFull: string;
  }> {
    if (!this.pendingPlan || !this.pendingPlanId) {
      throw new Error("No pending plan to execute.");
    }

    // defense-in-depth: validate again
    this.guardrails.validatePatchPlan(this.pendingPlan);

    const planId = this.pendingPlanId;
    const baseRef = "HEAD";
    const branchName = `agent/${planId}`;

    // Create branch off current HEAD
    await this.gitSvc.createBranch(branchName);

    // Apply patch ops
    const executor = new PatchExecutor({ repoRoot: this.cfg.repoRoot });
    await executor.applyAll(this.pendingPlan.ops);

    // Commit
    const goal = this.pendingPlan.meta?.goal ?? "apply patch";
    const commit = await this.gitSvc.addAllAndCommit(`agent: ${goal} (${planId})`);

    // Diff summary
    const filesChanged = await this.gitSvc.diffNameStatus(baseRef);
    const diffFull = await this.gitSvc.diffUnified(baseRef, 400_000);
    const diffSnippet =
      diffFull.length > 1800 ? diffFull.slice(0, 1800) + "\n...TRUNCATED..." : diffFull;

    // Clear pending plan once committed
    this.clearPendingPlan();

    return {
      planId,
      branch: branchName,
      commit,
      filesChanged: filesChanged.trim(),
      diffSnippet,
      diffFull,
    };
  }
}
