// tools/repo-agent/src/core/ContextBuilder.ts
import fs from "node:fs/promises";
import path from "node:path";
import { SimpleGit } from "simple-git";

export type Trigger = {
  kind: "discord" | "watcher" | "manual";
  command?: string;
  mode?: string;
};

export type AgentContext = {
  repoRoot: string;
  headSha: string;
  branch: string;
  files: {
    path: string;
    content: string; // excerpt (NOT full file)
  }[];
  trigger: Trigger;
};

export type ContextBuildOpts = {
  maxFileBytes: number;
  maxFiles: number;
  maxCharsPerFile: number;
  maxTotalChars: number;
};

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "agent_artifacts",
  "coverage",
  ".next",
  ".turbo",
  ".cache",
]);

const ALLOW_EXT = new Set([".ts", ".js", ".json", ".md", ".yml", ".yaml"]);

function scorePath(p: string): number {
  const n = p.replace(/\\/g, "/");
  if (n.startsWith("src/core/")) return 0;
  if (n.startsWith("src/schemas/")) return 1;
  if (n.startsWith("src/integrations/")) return 2;
  if (n.startsWith("src/")) return 3;
  if (n.startsWith("tools/repo-agent/src/")) return 4;
  return 10;
}

function makeExcerpt(raw: string, maxChars: number): string {
  // Keep headers + first chunk; strip huge whitespace runs
  let s = raw.replace(/\r\n/g, "\n");
  // Collapse very long whitespace runs to reduce tokens
  s = s.replace(/[ \t]{4,}/g, "  ");
  if (s.length <= maxChars) return s;
  return s.slice(0, maxChars) + "\n…TRUNCATED…";
}

export class ContextBuilder {
  private git: SimpleGit | null;

  constructor(
    private repoRoot: string,
    git: SimpleGit | null,
    private opts: ContextBuildOpts
  ) {
    this.git = git ?? null;
  }

  async buildMinimal(trigger: Trigger): Promise<AgentContext> {
    let headSha = "unknown";
    let branch = "unknown";

    if (this.git) {
      try {
        headSha = (await this.git.revparse(["HEAD"])).trim();
        branch = (await this.git.revparse(["--abbrev-ref", "HEAD"])).trim();
      } catch {
        // Git unavailable → safe fallback
      }
    }

    // 1) Collect candidate file paths first (cheap)
    const candidates: string[] = [];
    const root = this.repoRoot;

    const walk = async (dir: string) => {
      // Stop early if already enough candidates (we still sort later)
      if (candidates.length >= this.opts.maxFiles * 6) return;

      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const e of entries) {
        // hidden dirs/files
        if (e.name.startsWith(".")) continue;

        if (e.isDirectory()) {
          if (SKIP_DIRS.has(e.name)) continue;

          // Safety: avoid traversing the repo-agent sources unless explicitly in self_improve mode.
          // This prevents planners from accidentally including the agent code when planning for other repos.
          // We detect the canonical layout tools/repo-agent by checking the parent directory name here.
          try {
            if (
              e.name === "repo-agent" &&
              path.basename(dir) === "tools" &&
              trigger.mode !== "self_improve"
            ) {
              // Skip the agent sources in normal runs
              continue;
            }
          } catch {
            // defensive: if path operations fail, don't block traversal
          }

          await walk(path.join(dir, e.name));
          continue;
        }

        if (!e.isFile()) continue;

        const ext = path.extname(e.name).toLowerCase();
        if (!ALLOW_EXT.has(ext)) continue;

        const full = path.join(dir, e.name);
        candidates.push(full);
      }
    };

    await walk(root);

    // 2) Sort by relevance
    candidates.sort((a, b) => {
      const ra = scorePath(path.relative(root, a));
      const rb = scorePath(path.relative(root, b));
      if (ra !== rb) return ra - rb;
      return a.localeCompare(b);
    });

    // 3) Read excerpts under strict budgets
    const files: { path: string; content: string }[] = [];

    let totalChars = 0;
    for (const full of candidates) {
      if (files.length >= this.opts.maxFiles) break;
      if (totalChars >= this.opts.maxTotalChars) break;

      let stat;
      try {
        stat = await fs.stat(full);
      } catch {
        continue;
      }
      if (!stat.isFile()) continue;
      if (stat.size > this.opts.maxFileBytes) continue;

      let raw: string;
      try {
        raw = await fs.readFile(full, "utf8");
      } catch {
        continue;
      }

      const rel = path.relative(root, full);
      const excerpt = makeExcerpt(raw, this.opts.maxCharsPerFile);

      // Enforce total character budget
      const remaining = this.opts.maxTotalChars - totalChars;
      if (remaining <= 0) break;

      const finalExcerpt =
        excerpt.length <= remaining
          ? excerpt
          : excerpt.slice(0, Math.max(0, remaining)) + "\n…TRUNCATED…";

      files.push({ path: rel, content: finalExcerpt });
      totalChars += finalExcerpt.length;

      if (totalChars >= this.opts.maxTotalChars) break;
    }

    return {
      repoRoot: this.repoRoot,
      headSha,
      branch,
      files,
      trigger,
    };
  }
}
