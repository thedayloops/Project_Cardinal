// tools/repo-agent/src/core/Agent.ts
import fs from "node:fs/promises";
import path from "node:path";
import simpleGit from "simple-git";

import { ContextBuilder, type Trigger } from "./ContextBuilder.js";
import { createPlanner } from "./PlannerFactory.js";
import type { AgentConfig } from "./Config.js";
import { GitService } from "./GitService.js";
import { Guardrails } from "./Guardrails.js";
import type { PatchPlan, PatchOp } from "../schemas/PatchPlan.js";

import { loadLedger, type Ledger } from "../util/tokenLedger.js";

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

export class Agent {
  private cfg: AgentConfig;
  private gitSvc: GitService;
  private planner: ReturnType<typeof createPlanner>;
  private guardrails: Guardrails;

  // Absolute artifacts directory (locked)
  private artifactsAbsDir: string;

  private pendingPlan: PatchPlan | null = null;
  private pendingPlanId: string | null = null;

  constructor(cfg: AgentConfig) {
    this.cfg = cfg;
    this.gitSvc = new GitService(cfg.repoRoot);
    this.planner = createPlanner(cfg);

    // Lock artifacts dir to repoRoot + artifactsDir (absolute, deterministic)
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

    // Ensure artifacts directory exists
    void fs.mkdir(this.artifactsAbsDir, { recursive: true });
  }

  // -----------------------------
  // STATUS
  // -----------------------------
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

  // -----------------------------
  // TOKEN LEDGER (read-only)
  // -----------------------------
  async getTokenStats(): Promise<Ledger> {
    // Ledger stores to token_ledger.json inside artifacts dir
    return loadLedger(this.artifactsAbsDir);
  }

  // -----------------------------
  // PLAN GENERATION
  // -----------------------------
  async run(mode: string, reason: string | null): Promise<AgentProposal> {
    if (!this.cfg.enableLLM) {
      // Keep your output stable even if disabled
      const noop: PatchPlan = {
        meta: {
          goal: "No changes proposed",
          rationale: "LLM is disabled.",
          confidence: 0,
        },
        scope: { files: [], total_ops: 0, estimated_bytes_changed: 0 },
        expected_effects: [],
        ops: [],
        verification: { steps: [], success_criteria: [] },
      };

      this.pendingPlan = noop;
      this.pendingPlanId = `plan_${Date.now()}`;

      return { planId: this.pendingPlanId, patchPlan: noop };
    }

    const trigger: Trigger = {
      kind: "discord",
      command: "agent_run",
      mode,
    };

    // Use a real SimpleGit instance for ContextBuilder so it can resolve HEAD/branch
    const git = simpleGit(this.cfg.repoRoot);

    const ctxBuilder = new ContextBuilder(this.cfg.repoRoot, git, {
      maxFileBytes: this.cfg.guardrails.maxFileBytes,
    });

    const ctx = await ctxBuilder.buildMinimal(trigger);
    const planId = `plan_${Date.now()}`;

    const plannerInput = {
      repo: { root: ctx.repoRoot, headSha: ctx.headSha, branch: ctx.branch },
      scope: {
        files: ctx.files.map((f) => f.path),
        total_ops: 0,
        estimated_bytes_changed: 0,
      },
      reason: reason ?? undefined,
      mode,
      filesPreview: ctx.files,
    };

    const plan = (await this.planner.planPatch(plannerInput)) as PatchPlan;

    // Validate plan against Guardrails (ops count/bytes/paths/etc.)
    this.guardrails.validatePatchPlan(plan);

    this.pendingPlan = plan;
    this.pendingPlanId = planId;

    return { planId, patchPlan: plan };
  }

  // -----------------------------
  // PLAN ACCESS
  // -----------------------------
  getLastPlan(): PatchPlan | null {
    return this.pendingPlan;
  }

  clearPendingPlan() {
    this.pendingPlan = null;
    this.pendingPlanId = null;
  }

  // -----------------------------
  // APPROVE + EXECUTE
  // -----------------------------
  async executeApprovedPlan(): Promise<{
    branch: string;
    commit: string;
    filesChanged: string;
    diffSnippet: string;
    diffFull: string;
  }> {
    if (!this.pendingPlan || !this.pendingPlanId) {
      throw new Error("No pending plan to execute.");
    }

    // Validate again right before applying (defense in depth)
    this.guardrails.validatePatchPlan(this.pendingPlan);

    const baseRef = "HEAD";
    const branchName = `agent/${this.pendingPlanId}`;

    // Create branch off current HEAD
    await this.gitSvc.createBranch(branchName);

    // Apply ops to filesystem inside repoRoot
    await this.applyOps(this.pendingPlan.ops);

    // Commit changes
    const commit = await this.gitSvc.addAllAndCommit(
      `agent: apply ${this.pendingPlanId}`
    );

    // Summaries
    const filesChanged = await this.gitSvc.diffNameStatus(baseRef);
    const diffFull = await this.gitSvc.diffUnified(baseRef, 200_000);
    const diffSnippet = diffFull.length > 1800 ? diffFull.slice(0, 1800) + "\n...TRUNCATED..." : diffFull;

    // Clear pending plan
    this.clearPendingPlan();

    return {
      branch: branchName,
      commit,
      filesChanged: filesChanged.trim(),
      diffSnippet,
      diffFull,
    };
  }

  // -----------------------------
  // OP APPLIER (PatchOp)
  // -----------------------------
  private async applyOps(ops: PatchOp[]) {
    for (const op of ops) {
      const abs = this.absPath(op.file);

      switch (op.type) {
        case "create_file": {
          await fs.mkdir(path.dirname(abs), { recursive: true });
          await fs.writeFile(abs, op.patch ?? "", "utf8");
          break;
        }

        case "update_file": {
          await fs.mkdir(path.dirname(abs), { recursive: true });
          await fs.writeFile(abs, op.patch ?? "", "utf8");
          break;
        }

        case "replace_range":
        case "insert_after":
        case "delete_range": {
          const exists = await this.exists(abs);
          if (!exists) throw new Error(`Target file does not exist: ${op.file}`);

          const raw = await fs.readFile(abs, "utf8");
          const lines = raw.split(/\r?\n/);

          // start_line/end_line are 1-based and inclusive
          const startIdx = op.start_line - 1;

          if (startIdx < 0 || startIdx > lines.length) {
            throw new Error(`start_line out of bounds for ${op.file} (op ${op.id})`);
          }

          const newText = (op.patch ?? "");
          const newLines = newText.length ? newText.split(/\r?\n/) : [];

          if (op.type === "insert_after") {
            // Insert AFTER start_line -> insert at startIdx + 1
            const insertAt = startIdx + 1;
            lines.splice(insertAt, 0, ...newLines);
            await fs.writeFile(abs, lines.join("\n"), "utf8");
            break;
          }

          if (op.end_line === null) {
            throw new Error(`${op.type} requires end_line (op ${op.id})`);
          }

          const endIdx = op.end_line - 1;
          if (endIdx < startIdx || endIdx >= lines.length) {
            throw new Error(`end_line out of bounds for ${op.file} (op ${op.id})`);
          }

          if (op.type === "delete_range") {
            lines.splice(startIdx, endIdx - startIdx + 1);
            await fs.writeFile(abs, lines.join("\n"), "utf8");
            break;
          }

          // replace_range
          lines.splice(startIdx, endIdx - startIdx + 1, ...newLines);
          await fs.writeFile(abs, lines.join("\n"), "utf8");
          break;
        }

        default: {
          const _exhaustive: never = op.type;
          throw new Error(`Unknown op type: ${_exhaustive}`);
        }
      }
    }
  }

  private absPath(rel: string) {
    const abs = path.resolve(this.cfg.repoRoot, rel);
    const root = path.resolve(this.cfg.repoRoot);

    // sandbox: ensure file stays under repoRoot
    if (!abs.startsWith(root + path.sep) && abs !== root) {
      throw new Error(`Path escapes repoRoot: ${rel}`);
    }
    return abs;
  }

  private async exists(p: string) {
    try {
      await fs.stat(p);
      return true;
    } catch {
      return false;
    }
  }
}
