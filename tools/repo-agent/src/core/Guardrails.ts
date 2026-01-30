import path from "node:path";
import { PatchPlan, PatchOp } from "../schemas/PatchPlan.js";

export type GuardrailConfig = {
  repoRoot: string;

  lockedPathPrefixes: string[];
  deniedPathPrefixes: string[];

  maxOps: number;
  maxTotalPatchBytes: number;
};

export class Guardrails {
  constructor(private cfg: GuardrailConfig) {}

  validatePatchPlan(plan: PatchPlan): void {
    if (plan.ops.length > this.cfg.maxOps) {
      throw new Error(
        `PatchPlan exceeds max ops (${plan.ops.length} > ${this.cfg.maxOps})`
      );
    }

    let totalPatchBytes = 0;

    for (const op of plan.ops) {
      this.validateOp(op);
      totalPatchBytes += Buffer.byteLength(op.patch, "utf8");
    }

    if (totalPatchBytes > this.cfg.maxTotalPatchBytes) {
      throw new Error(
        `PatchPlan exceeds max patch bytes (${totalPatchBytes} > ${this.cfg.maxTotalPatchBytes})`
      );
    }
  }

  private validateOp(op: PatchOp): void {
    const normalized = path.normalize(op.file);

    // deny/lock prefixes are relative-path checks (repo-root sandbox is enforced elsewhere)
    for (const denied of this.cfg.deniedPathPrefixes) {
      if (normalized.startsWith(denied)) {
        throw new Error(`Patch targets denied path: ${op.file}`);
      }
    }

    for (const locked of this.cfg.lockedPathPrefixes) {
      if (normalized.startsWith(locked)) {
        throw new Error(`Patch targets locked path: ${op.file}`);
      }
    }

    if (op.reversible !== true) {
      throw new Error(`All ops must be reversible (op ${op.id})`);
    }

    // Basic line sanity (even for file ops we keep start_line=1)
    if (op.start_line < 1) {
      throw new Error(`start_line must be >= 1 (op ${op.id})`);
    }
    if (op.end_line !== null && op.end_line < op.start_line) {
      throw new Error(`end_line must be >= start_line (op ${op.id})`);
    }

    switch (op.type) {
      case "replace_range":
        if (op.end_line === null) {
          throw new Error(`replace_range requires end_line (op ${op.id})`);
        }
        return;

      case "insert_after":
        if (op.end_line !== null) {
          throw new Error(`insert_after must have end_line=null (op ${op.id})`);
        }
        return;

      case "delete_range":
        if (op.end_line === null) {
          throw new Error(`delete_range requires end_line (op ${op.id})`);
        }
        if (op.patch.trim().length > 0) {
          throw new Error(`delete_range patch must be empty (op ${op.id})`);
        }
        return;

      case "create_file":
        if (op.end_line !== null) {
          throw new Error(`create_file must have end_line=null (op ${op.id})`);
        }
        // allow any patch content (may be empty but usually not)
        return;

      case "update_file":
        if (op.end_line !== null) {
          throw new Error(`update_file must have end_line=null (op ${op.id})`);
        }
        return;

      default: {
        const _exhaustive: never = op.type;
        throw new Error(`Unknown op type: ${_exhaustive}`);
      }
    }
  }
}
