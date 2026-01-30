import fs from "node:fs/promises";
import path from "node:path";
import { GitService } from "./GitService.js";

export type Trigger =
  | { kind: "discord"; command: string; args?: Record<string, string> }
  | { kind: "watch"; changedPaths: string[] };

export type AgentContext = {
  trigger: Trigger;
  repo: {
    status: string;
    headSha: string;
    branch: string;
  };
  diffHint: {
    // Optional: last N changed file names (no content)
    changedFiles: string[];
  };
  files: Array<{
    path: string;
    content: string;
  }>;
};

export class ContextBuilder {
  constructor(
    private repoRoot: string,
    private git: GitService,
    private opts: {
      maxFiles: number;
      maxBytesPerFile: number;
      includePrefixes: string[];
    }
  ) {}

  async build(trigger: Trigger): Promise<AgentContext> {
    const status = await this.git.statusSummary();
    const headSha = await this.git.getHeadSha();
    const branch = await this.git.getCurrentBranch();

    const changedFiles = trigger.kind === "watch" ? trigger.changedPaths : [];

    // Minimal, safe sampling: pick up to maxFiles from includePrefixes.
    const sampled = await this.sampleFiles();

    return {
      trigger,
      repo: { status, headSha, branch },
      diffHint: { changedFiles: changedFiles.slice(0, 50) },
      files: sampled
    };
  }

  private async sampleFiles(): Promise<Array<{ path: string; content: string }>> {
    // Simple: walk includePrefixes and pick a few files, bounded.
    const out: Array<{ path: string; content: string }> = [];
    for (const prefix of this.opts.includePrefixes) {
      const abs = path.resolve(this.repoRoot, prefix);
      const exists = await fs
        .stat(abs)
        .then(() => true)
        .catch(() => false);
      if (!exists) continue;

      const files = await this.walk(abs);
      for (const f of files) {
        if (out.length >= this.opts.maxFiles) return out;
        const rel = path.relative(this.repoRoot, f).replaceAll("\\", "/");
        const buf = await fs.readFile(f);
        const sliced = buf.subarray(0, this.opts.maxBytesPerFile);
        out.push({ path: rel, content: sliced.toString("utf8") });
      }
    }
    return out;
  }

  private async walk(dirAbs: string): Promise<string[]> {
    const ents = await fs.readdir(dirAbs, { withFileTypes: true });
    const out: string[] = [];
    for (const e of ents) {
      const p = path.join(dirAbs, e.name);
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name === ".git" || e.name === "dist") continue;
        out.push(...(await this.walk(p)));
      } else if (e.isFile()) {
        if (e.name.endsWith(".png") || e.name.endsWith(".jpg") || e.name.endsWith(".lock")) continue;
        out.push(p);
      }
    }
    return out;
  }
}
