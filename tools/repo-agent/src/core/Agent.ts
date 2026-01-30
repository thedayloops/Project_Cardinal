import path from "node:path";
import { Logger } from "./Logger.js";
import { GitService } from "./GitService.js";
import { Guardrails } from "./Guardrails.js";
import { PatchApplier } from "./PatchApplier.js";
import { Verifier } from "./Verifier.js";
import { ContextBuilder, Trigger } from "./ContextBuilder.js";
import { Planner } from "./Planner.js";
import type { PatchPlan } from "../schemas/PatchPlan.js";
import type { VerificationReport } from "../schemas/VerificationReport.js";
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
      openai: { apiKey: string; model: string };
      watch: { includePrefixes: string[] };
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
      this.log.warn("Agent busy, queued trigger", trigger);
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

    // 1. Build context
    const contextBuilder = new ContextBuilder(this.cfg.repoRoot, git, {
      maxFiles: 12,
      maxBytesPerFile: 25_000,
      includePrefixes: this.cfg.watch.includePrefixes
    });

    const ctx = await contextBuilder.build(trigger);

    // 2. Planning
    const planner = new Planner(this.cfg.openai.apiKey, this.cfg.openai.model);
    const plan: PatchPlan = await planner.createPatchPlan(ctx);

    await ensureDir(this.cfg.artifactsDir);
    await this.persistJson(`plan_${plan.meta.planId}.json`, plan);

    // 3. Guardrails
    const guardrails = new Guardrails(this.cfg.repoRoot, this.cfg.guardrails);
    const verdict = guardrails.validatePlan(plan);

    if (!verdict.ok) {
      await this.persistText(
        `plan_${plan.meta.planId}_REJECTED.txt`,
        verdict.reason
      );
      throw new Error(`Guardrails rejected plan: ${verdict.reason}`);
    }

    // 4. Determine mode
    const mode =
      trigger.kind === "discord"
        ? trigger.args?.mode ?? "plan"
        : "plan";

    // 5. Dry run (no side effects)
    if (mode === "dry-run") {
      await this.deps.postProposal({
        planId: plan.meta.planId,
        branchName: "(dry-run)",
        baseRef: plan.meta.baseRef || headBefore,
        headBefore,
        summary: `[DRY RUN]\n${plan.notes.summary}`,
        diffSnippet: "(no diff — dry run)",
        verificationSummary: "Not executed (dry run)"
      });

      this.log.info("Dry run completed", { planId: plan.meta.planId });
      return;
    }

    // 6. Apply patch on new branch
    await git.createBranch(plan.meta.branchName);

    const applier = new PatchApplier(this.cfg.repoRoot);
    await applier.apply(plan);

    const commitSha = await git.addAllAndCommit(plan.meta.commitMessage);
    this.log.info("Plan committed", { commitSha });

    // 7. Verification (optional)
    let verification: VerificationReport | null = null;

    if (plan.verify.commands.length > 0) {
      const verifier = new Verifier(
        this.cfg.repoRoot,
        this.cfg.artifactsDir,
        this.cfg.commandsAllowlist
      );

      verification = await verifier.run(plan.verify.commands);
      await this.persistJson(
        `verify_${plan.meta.planId}.json`,
        verification
      );
    }

    // 8. Diff + report
    const diffSnippet = await git.diffUnified(
      plan.meta.baseRef || headBefore,
      7000
    );

    const verificationSummary = verification
      ? verification.results
          .map(
            (r) =>
              `- ${r.name}: ${r.ok ? "OK" : "FAIL"} (exit=${r.exitCode})`
          )
          .join("\n")
      : "- (no verification commands requested)";

    await this.deps.postProposal({
      planId: plan.meta.planId,
      branchName: plan.meta.branchName,
      baseRef: plan.meta.baseRef || headBefore,
      headBefore,
      summary: plan.notes.summary,
      diffSnippet,
      verificationSummary
    });
  }

  private async persistJson(name: string, data: unknown): Promise<void> {
    const filePath = path.join(this.cfg.artifactsDir, name);
    await writeFileAtomic(filePath, JSON.stringify(data, null, 2));
  }

  private async persistText(name: string, content: string): Promise<void> {
    const filePath = path.join(this.cfg.artifactsDir, name);
    await writeFileAtomic(filePath, content);
  }
}
