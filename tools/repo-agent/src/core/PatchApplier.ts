import fs from "node:fs/promises";
import { PatchPlan } from "../schemas/PatchPlan.js";
import { resolveRepoPath } from "../util/paths.js";
import { writeFileAtomic, fileExists } from "../util/fsSafe.js";

export class PatchApplier {
  constructor(private repoRoot: string) {}

  async apply(plan: PatchPlan): Promise<void> {
    for (const op of plan.ops) {
      if (op.type === "create") {
        const abs = resolveRepoPath(this.repoRoot, op.path);
        if (await fileExists(abs)) {
          throw new Error(`Create failed; file already exists: ${op.path}`);
        }
        await writeFileAtomic(abs, op.content);
      }

      if (op.type === "update") {
        const abs = resolveRepoPath(this.repoRoot, op.path);
        await writeFileAtomic(abs, op.content);
      }

      if (op.type === "delete") {
        const abs = resolveRepoPath(this.repoRoot, op.path);
        if (await fileExists(abs)) await fs.rm(abs);
      }

      if (op.type === "rename") {
        const fromAbs = resolveRepoPath(this.repoRoot, op.from);
        const toAbs = resolveRepoPath(this.repoRoot, op.to);
        await fs.mkdir(new URL(".", `file://${toAbs}`).pathname, { recursive: true }).catch(() => {});
        await fs.rename(fromAbs, toAbs);
      }
    }
  }
}
