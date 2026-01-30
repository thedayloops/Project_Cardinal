import path from "node:path";
import { Logger } from "./Logger.js";
import { GitService } from "./GitService.js";
import { ContextBuilder, Trigger } from "./ContextBuilder.js";
import { createPlanner } from "./PlannerFactory.js";
import { ensureDir, writeFileAtomic } from "../util/fsSafe.js";
import { cleanupArtifacts } from "../util/cleanupArtifacts.js";

export type AgentRunMode = "dry-run" | "plan" | "plan+verify";

export type AgentProposal = {
  planId: string;
  plan: string;
  branch: string;
  base: string;
  headBefore: string;
  summary: string;
  verification: string;
  diffSnippet: string;
};

export class Agent {
  private busy = false;
  private queuedTrigger: Trigger | null = null;

  private lastSummary: string | null = null;
  private lastProposal: AgentProposal | null = null;

  constructor(
    private cfg: {
      repoRoot: string;
      artifactsDir: string;
      guardrails: {
        lockedPathPrefixes: string[];
        deniedPathPrefixes: string[];
        maxTotalWriteBytes: number;
        maxOps: number;
      };
      commandsAllowlist: Record<
        string,
        { cmd: string; args: string[]; cwd?: string }
      >;
    },
    private log: Logger,
    private deps: {
      postProposal: (p: AgentProposal) => Promise<void>;
    }
  ) {}

  /* ---------- Introspection ---------- */

  getLastSummary(): string | null {
    return this.lastSummary;
  }

  getLastProposal(): AgentProposal | null {
    return this.lastProposal;
  }

  getStatus() {
    return {
      busy: this.busy,
      pendingProposal: this.lastProposal
        ? {
            planId: this.lastProposal.planId,
            plan: this.lastProposal.plan
          }
        : null,
      lastSummary: this.lastSummary,
      planner:
        process.env.AGENT_ENABLE_LLM === "true"
          ? "OpenAI (file-selection only)"
          : "Stub (no-op)",
      writeEnabled: false,
      autoMergeEnabled: false
    };
  }

  /* ---------- Execution ---------- */

  async trigger(
    trigger: Trigger & { mode?: AgentRunMode }
  ): Promise<void> {
    if (this.busy) {
      this.queuedTrigger = trigger;
      return;
    }

    this.busy = true;
    try {
      await this.runOnce(trigger);
    } finally {
      this.busy = false;
      if (this.queuedTrigger) {
        const next = this.queuedTrigger;
        this.queuedTrigger = null;
        await this.trigger(next);
      }
    }
  }

  private async runOnce(
    trigger: Trigger & { mode?: AgentRunMode }
  ): Promise<void> {
    const mode: AgentRunMode = trigger.mode ?? "dry-run";

    const git = new GitService(this.cfg.repoRoot);
    const headBefore = await git.getHeadSha();

    const contextBuilder = new ContextBuilder(this.cfg.repoRoot, git, {
      maxFileBytes: 25_000
    });

    const planner = createPlanner();
    const baseCtx = await contextBuilder.buildMinimal(trigger);
    const filePlan = await planner.planFiles(baseCtx);

    const planId = `plan_${Date.now()}`;

    let summary = "No files require changes.";
    let planLabel = "noop";

    if (filePlan.files.length > 0) {
      planLabel = "files-selected";
      summary =
        "Agent identified the following file(s) as potentially relevant:\n" +
        filePlan.files.map((f) => `- ${f}`).join("\n");
    }

    const proposal: AgentProposal = {
      planId,
      plan: planLabel,
      branch: "(dry-run)",
      base: "HEAD",
      headBefore,
      summary,
      verification: "Not executed",
      diffSnippet: "(no changes)"
    };

    this.lastSummary = summary;
    this.lastProposal = proposal;

    // Persist artifact
    await ensureDir(this.cfg.artifactsDir);
    await writeFileAtomic(
      path.join(this.cfg.artifactsDir, `${planId}_files.json`),
      JSON.stringify({ mode, ...filePlan }, null, 2)
    );

    // Emit proposal to Discord
    await this.deps.postProposal(proposal);

    // Cleanup old artifacts safely
    await cleanupArtifacts(
      this.cfg.artifactsDir,
      {
        maxCount: Number(process.env.AGENT_ARTIFACT_MAX_COUNT ?? 25),
        maxAgeMs:
          Number(process.env.AGENT_ARTIFACT_MAX_AGE_DAYS ?? 7) *
          24 *
          60 *
          60 *
          1000,
        keepPlanIds: new Set([planId])
      },
      this.log
    );
  }
}
