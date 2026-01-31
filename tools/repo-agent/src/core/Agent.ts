// tools/repo-agent/src/core/Agent.ts
import simpleGit from "simple-git";
import type { AgentConfig } from "./Config.js";
import { ContextBuilder } from "./ContextBuilder.js";
import { createPlanner } from "./PlannerFactory.js";
import {
  loadLedger,
  recordTokenCall,
  type Ledger,
} from "../util/tokenLedger.js";

export class Agent {
  private cfg: AgentConfig;
  private planner;
  private lastPlan: {
    planId: string;
    patchPlan: any;
  } | null = null;

  constructor(cfg: AgentConfig) {
    this.cfg = cfg;
    this.planner = createPlanner(cfg);
  }

  // ─────────────────────────────────────────────
  // Agent status (/agent_status)
  // ─────────────────────────────────────────────
  async getStatus() {
    const git = simpleGit(this.cfg.repoRoot);

    let branch = "unknown";
    let head = "unknown";
    let git_status = "unavailable";

    try {
      branch = (await git.revparse(["--abbrev-ref", "HEAD"])).trim();
      head = (await git.revparse(["HEAD"])).trim();

      const s = await git.status();
      git_status = `ahead=${s.ahead} behind=${s.behind} modified=${s.modified.length} created=${s.created.length} deleted=${s.deleted.length}`;
    } catch {
      // git unavailable → safe fallback
    }

    return {
      online: true,
      llm_enabled: this.cfg.enableLLM,
      planner: this.cfg.enableLLM ? "openai" : "stub",
      repoRoot: this.cfg.repoRoot,
      branch,
      head,
      git_status,
      pending_plan: !!this.lastPlan,
    };
  }

  // ─────────────────────────────────────────────
  // Token stats (/agent_tokens)
  // ─────────────────────────────────────────────
  async getTokenStats(): Promise<Ledger> {
    return loadLedger(this.cfg.artifactsDir);
  }

  // ─────────────────────────────────────────────
  // Last plan memory (/agent_explain)
  // ─────────────────────────────────────────────
  getLastPlan() {
    return this.lastPlan;
  }

  clearPendingPlan() {
    this.lastPlan = null;
  }

  // ─────────────────────────────────────────────
  // Main execution (/agent_run)
  // ─────────────────────────────────────────────
  async run(mode: string, reason: string | null) {
    if (!this.cfg.enableLLM) {
      return {
        planId: undefined,
        patchPlan: undefined,
        reason: "planning is disabled",
      };
    }

    const git = simpleGit(this.cfg.repoRoot);

    const ctxBuilder = new ContextBuilder(
      this.cfg.repoRoot,
      git,
      { maxFileBytes: this.cfg.guardrails.maxFileBytes }
    );

    const ctx = await ctxBuilder.buildMinimal({
      kind: "discord",
      command: "agent_run",
      mode,
    });

    const plannerInput = {
      repo: {
        root: ctx.repoRoot,
        headSha: ctx.headSha,
        branch: ctx.branch,
      },
      mode,
      reason: reason ?? undefined,
      scope: {
        files: ctx.files.map((f) => f.path),
        total_ops: 0,
        estimated_bytes_changed: 0,
      },
      filesPreview: ctx.files,
    };

    const startedAt = new Date().toISOString();
    const patchPlan = await this.planner.planPatch(plannerInput);

    const planId = `plan_${Date.now()}`;

    this.lastPlan = {
      planId,
      patchPlan,
    };

    // Best-effort token accounting
    try {
      const usage = (patchPlan as any)?.usage;
      if (usage) {
        await recordTokenCall(this.cfg.artifactsDir, {
          at: startedAt,
          model: this.cfg.openai.model,
          inputTokens: usage.input_tokens ?? 0,
          outputTokens: usage.output_tokens ?? 0,
          totalTokens: usage.total_tokens ?? 0,
        });
      }
    } catch {
      // ledger failure must never break agent flow
    }

    return {
      planId,
      patchPlan,
    };
  }
}
