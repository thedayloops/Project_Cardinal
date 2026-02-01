// tools/repo-agent/src/core/PatchExecutor.ts

import type { PatchOp } from "../schemas/PatchPlan.js";
import { PatchApplier } from "./PatchApplier.js";

export class PatchExecutor {
  private applier: PatchApplier;

  constructor(opts: { repoRoot: string }) {
    this.applier = new PatchApplier(opts.repoRoot);
  }

  async applyAll(ops: PatchOp[]) {
    for (const op of ops) {
      if (op.file.startsWith("tools/repo-agent/")) {
        throw new Error(
          `Invalid patch path (nested repo-agent): ${op.file}`
        );
      }
    }

    await this.applier.apply({ ops } as any);
  }
}
