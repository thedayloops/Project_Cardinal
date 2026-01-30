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
    content: string;
  }[];
  trigger: Trigger;

  // ✅ Optional, injected by Agent when needed
  scope?: {
    files: string[];
    total_ops: number;
    estimated_bytes_changed: number;
  };
};

export class ContextBuilder {
  private git: SimpleGit | null;

  constructor(
    private repoRoot: string,
    git: SimpleGit | null,
    private opts: { maxFileBytes: number }
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

    const files: { path: string; content: string }[] = [];

    const walk = async (dir: string) => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const e of entries) {
        if (
          e.name === "node_modules" ||
          e.name.startsWith(".") ||
          e.name === "agent_artifacts"
        )
          continue;

        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          await walk(full);
        } else if (e.isFile()) {
          const stat = await fs.stat(full);
          if (stat.size > this.opts.maxFileBytes) continue;

          const content = await fs.readFile(full, "utf8");
          files.push({
            path: path.relative(this.repoRoot, full),
            content
          });
        }
      }
    };

    await walk(this.repoRoot);

    return {
      repoRoot: this.repoRoot,
      headSha,
      branch,
      files,
      trigger
    };
  }
}
