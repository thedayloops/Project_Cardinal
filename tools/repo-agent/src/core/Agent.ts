import path from "node:path";
import { Logger } from "./Logger.js";
import { GitService } from "./GitService.js";
import { Guardrails } from "./Guardrails.js";
import { PatchApplier } from "./PatchApplier.js";
import { Verifier } from "./Verifier.js";
import { ContextBuilder, Trigger } from "./ContextBuilder.js";
import { createPlanner } from "./PlannerFactory.js";
import { ensureDir, writeFileAtomic } from "../util/fsSafe.js";

export class Agent {
  private busy = false;
  private queuedTrigger: Trigger | null = null;

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
      commandsAllowlist: Record<string, { cmd: string; args: string[]; cwd?: string }>;
    },
    private log: Logger,
    private deps: {
      postProposal: (p: {
        planId: string;
        branchName: string;
        baseRef: string;
        headBefore: string;
        summary: string;
        diffSnippet: string;
        verificationSummary: string;
      }) => Promise<void>;
    }
  ) {}

  async trigger(trigger: Trigger): Promise<void> {
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

  private async runOnce(trigger: Trigger): Promise<void> {
    const git = new GitService(this.cfg.repoRoot);
    const headBefore = await git.getHeadSha();

    const contextBuilder = new ContextBuilder(this.cfg.repoRoot, git, {
      maxFileBytes: 25_000
    });

    const planner = createPlanner();

    // Phase 1 — minimal context
    const baseCtx = await contextBuilder.buildMinimal(trigger);
    const filePlan = await planner.planFiles(baseCtx);

    if (filePlan.files.length === 0) {
      await this.deps.postProposal({
        planId: "noop",
        branchName: "(dry-run)",
        baseRef: "HEAD",
        headBefore,
        summary: "No files require changes.",
        diffSnippet: "(no changes)",
        verificationSummary: "Not executed"
      });
      return;
    }

    // Phase 2 — targeted files
    const ctxWithFiles = await contextBuilder.buildWithFiles(
      baseCtx,
      filePlan.files
    );

    const plan = await planner.planPatch(ctxWithFiles);

    await ensureDir(this.cfg.artifactsDir);
    await this.persistJson(`plan_${plan.meta.planId}.json`, plan);

    const guardrails = new Guardrails(this.cfg.repoRoot, this.cfg.guardrails);
    const verdict = guardrails.validatePlan(plan);

    if (!verdict.ok) {
      throw new Error(verdict.reason);
    }

    // Dry-run only (safe default)
    await this.deps.postProposal({
      planId: plan.meta.planId,
      branchName: "(dry-run)",
      baseRef: plan.meta.baseRef || headBefore,
      headBefore,
      summary: `[DRY RUN]\n${plan.notes.summary}`,
      diffSnippet: "(no diff — dry run)",
      verificationSummary: "Not executed"
    });
  }

  private async persistJson(name: string, data: unknown): Promise<void> {
    const p = path.join(this.cfg.artifactsDir, name);
    await writeFileAtomic(p, JSON.stringify(data, null, 2));
  }
}
