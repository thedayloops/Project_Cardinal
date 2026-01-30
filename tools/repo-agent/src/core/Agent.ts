// tools/repo-agent/src/core/Agent.ts
import fs from "node:fs/promises";
import path from "node:path";
import type { AgentConfig } from "./Config.js";
import { createPlanner } from "./PlannerFactory.js";
import type { PlannerInput } from "./PlannerFactory.js";
import { GitService } from "./GitService.js";

export type AgentStatus = {
  online: boolean;
  llm_enabled: boolean;
  planning_model: string;
  patch_model: string;
  repoRoot: string;
  branch: string;
  head: string;
  git_status: string;
  pending_plan: boolean;
  pending_plan_id: string | null;
};

export type AgentProposal = {
  planId: string;
  mode: string;
  reason: string | null;
  patchPlan: any;
};

function nowId(prefix: string) {
  return `${prefix}_${Date.now()}`;
}

async function ensureDir(p: string) {
  await fs.mkdir(p, { recursive: true });
}

function isDenied(p: string, denied: string[]) {
  const norm = p.replaceAll("\\", "/");
  return denied.some((d) => norm.startsWith(d.replaceAll("\\", "/")));
}

export class Agent {
  private planner;
  private git: GitService;

  private pending: AgentProposal | null = null;
  private appliedBranch: string | null = null;

  constructor(private cfg: AgentConfig) {
    this.planner = createPlanner(cfg);
    this.git = new GitService(cfg.repoRoot);
  }

  async getStatus(): Promise<AgentStatus> {
    const head = await this.git.getHeadSha();
    const branch = await this.git.getCurrentBranch();
    const status = await this.git.statusSummary();

    return {
      online: true,
      llm_enabled: this.cfg.enableLLM,
      planning_model: this.cfg.openai.model,
      patch_model: this.cfg.openai.patchModel,
      repoRoot: this.cfg.repoRoot,
      branch,
      head,
      git_status: status,
      pending_plan: !!this.pending,
      pending_plan_id: this.pending?.planId ?? null,
    };
  }

  getPending(): AgentProposal | null {
    return this.pending;
  }

  async run(mode: string, reason: string | null): Promise<AgentProposal> {
    const planId = nowId("plan");

    // Lightweight file preview: top N small files under repoRoot/src + tools/repo-agent/src
    const previews: Array<{ path: string; content: string }> = [];
    const maxFiles = 20;
    const maxBytes = this.cfg.guardrails.maxFileBytes;

    const roots = [
      path.join(this.cfg.repoRoot, "src"),
      path.join(this.cfg.repoRoot, "tools", "repo-agent", "src"),
    ];

    for (const r of roots) {
      await this.walkPreview(r, previews, maxFiles, maxBytes);
      if (previews.length >= maxFiles) break;
    }

    const headSha = await this.git.getHeadSha();
    const branch = await this.git.getCurrentBranch();

    const input: PlannerInput = {
      repo: { root: this.cfg.repoRoot, headSha, branch },
      scope: {
        files: previews.map((p) => p.path),
        total_ops: 0,
        estimated_bytes_changed: 0,
      },
      mode,
      reason: reason ?? undefined,
      filesPreview: previews,
    };

    const patchPlan = await this.planner.planPatch(input);

    const proposal: AgentProposal = {
      planId,
      mode,
      reason,
      patchPlan,
    };

    this.pending = proposal;

    await ensureDir(this.cfg.artifactsDir);
    await fs.writeFile(
      path.join(this.cfg.artifactsDir, `${planId}_patch.json`),
      JSON.stringify(patchPlan, null, 2),
      "utf8"
    );

    return proposal;
  }

  async approveAndApply(planId: string): Promise<{ branch: string; commit: string }> {
    if (!this.pending || this.pending.planId !== planId) {
      throw new Error("No matching pending plan to approve.");
    }

    // NOTE: This is an "apply scaffold" only. It creates an isolated branch and commits current state.
    // Patch application (ops -> file edits) can be wired next once PatchApplier is stable.
    const branch = `agent/${planId}`;
    const base = await this.git.getCurrentBranch();

    await this.git.createBranch(branch);
    const commit = await this.git.addAllAndCommit(`repo-agent: apply ${planId}`);
    this.appliedBranch = branch;

    // return to base so user repo stays on base in normal dev flow
    await this.git.checkout(base);

    return { branch, commit };
  }

  async mergeLastApplied(): Promise<void> {
    if (!this.appliedBranch) throw new Error("No applied branch to merge.");
    const target = await this.git.getCurrentBranch();
    const source = this.appliedBranch;

    await this.git.mergeInto(target, source);
    this.appliedBranch = null;
    this.pending = null;
  }

  rejectPending(): void {
    this.pending = null;
    this.appliedBranch = null;
  }

  private async walkPreview(
    root: string,
    out: Array<{ path: string; content: string }>,
    maxFiles: number,
    maxBytes: number
  ) {
    try {
      const st = await fs.stat(root);
      if (!st.isDirectory()) return;
    } catch {
      return;
    }

    const stack: string[] = [root];
    while (stack.length && out.length < maxFiles) {
      const dir = stack.pop()!;
      let entries: Array<import("node:fs").Dirent> = [];
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const e of entries) {
        if (out.length >= maxFiles) break;
        if (e.name === "node_modules" || e.name.startsWith(".") || e.name === this.cfg.artifactsDir) continue;

        const full = path.join(dir, e.name);
        const rel = path.relative(this.cfg.repoRoot, full).replaceAll("\\", "/");

        if (isDenied(rel, this.cfg.guardrails.deniedPathPrefixes)) continue;

        if (e.isDirectory()) {
          stack.push(full);
        } else if (e.isFile()) {
          if (!/\.(ts|js|json|md)$/i.test(e.name)) continue;

          let stat;
          try {
            stat = await fs.stat(full);
          } catch {
            continue;
          }
          if (stat.size > maxBytes) continue;

          let content = "";
          try {
            content = await fs.readFile(full, "utf8");
          } catch {
            continue;
          }

          out.push({ path: rel, content });
        }
      }
    }
  }
}
