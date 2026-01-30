import fs from "node:fs/promises";
import path from "node:path";
import { GitService } from "./GitService.js";

export type Trigger =
  | { kind: "discord"; command: string; args?: Record<string, string> }
  | { kind: "watch"; changedPaths: string[] };

export type AgentContext = {
  trigger: Trigger;
  repo: {
    branch: string;
    head: string;
    status: string;
  };
  files?: Array<{
    path: string;
    content: string;
  }>;
};

export class ContextBuilder {
  constructor(
    private repoRoot: string,
    private git: GitService,
    private opts: {
      maxFileBytes: number;
    }
  ) {}

  async buildMinimal(trigger: Trigger): Promise<AgentContext> {
    return {
      trigger,
      repo: {
        branch: await this.git.getCurrentBranch(),
        head: await this.git.getHeadSha(),
        status: await this.git.statusSummary()
      }
    };
  }

  async buildWithFiles(
    base: AgentContext,
    filePaths: string[]
  ): Promise<AgentContext> {
    const files = [];

    for (const rel of filePaths) {
      const abs = path.join(this.repoRoot, rel);
      const buf = await fs.readFile(abs);
      files.push({
        path: rel,
        content: buf.slice(0, this.opts.maxFileBytes).toString("utf8")
      });
    }

    return { ...base, files };
  }
}
