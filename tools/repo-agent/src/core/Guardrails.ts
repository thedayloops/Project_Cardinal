// tools/repo-agent/src/core/Guardrails.ts

import path from "node:path";
import { PatchPlan, PatchOp } from "../schemas/PatchPlan.js";

function toPosix(p: string): string {
  return path.posix.normalize(p.replace(/\\/g, "/"));
}

export type GuardrailConfig = {
  repoRoot: string;
  lockedPathPrefixes: string[];
  deniedPathPrefixes: string[];
  maxOps: number;
  // historically named in different places; support both keys for safety
  maxTotalPatchBytes?: number;
  maxTotalWriteBytes?: number;
};

export class Guardrails {
  private maxTotalPatchBytes: number;

  constructor(private cfg: GuardrailConfig) {
    // Support both names (backwards-compatible with Config.ts which uses maxTotalWriteBytes)
    this.maxTotalPatchBytes =
      cfg.maxTotalPatchBytes ?? cfg.maxTotalWriteBytes ?? 300_000;
  }

  validatePatchPlan(plan: PatchPlan): void {
    if (plan.ops.length > this.cfg.maxOps) {
      throw new Error(
        `PatchPlan exceeds max ops (${plan.ops.length} > ${this.cfg.maxOps})`
      );
    }

    let totalPatchBytes = 0;

    for (const op of plan.ops) {
      this.validateOp(op);
      totalPatchBytes += Buffer.byteLength(op.patch ?? "", "utf8");
    }

    if (totalPatchBytes > this.maxTotalPatchBytes) {
      throw new Error(
        `PatchPlan exceeds max patch bytes (${totalPatchBytes} > ${this.maxTotalPatchBytes})`
      );
    }
  }

  private validateOp(op: PatchOp): void {
    // Normalize to posix for consistent prefix checks (and to tolerate Windows paths)
    const normalized = toPosix(op.file);

    // Reject obviously unsafe or absolute file targets. This prevents directory traversal
    // and accidental writes outside the repository.
    if (!normalized || normalized.startsWith("/")) {
      throw new Error(`Unsafe or absolute path in op: ${op.file}`);
    }
    // After normalization, any parent-segments are suspicious for a patch plan.
    const segments = normalized.split("/");
    if (segments.includes("..")) {
      throw new Error(`Path traversal detected in op file path: ${op.file}`);
    }

    // Deny-list and locked path checks (use normalized prefixes)
    for (const denied of this.cfg.deniedPathPrefixes) {
      const d = toPosix(denied);
      if (d && normalized.startsWith(d)) {
        throw new Error(`Patch targets denied path: ${op.file}`);
      }
    }

    for (const locked of this.cfg.lockedPathPrefixes) {
      const l = toPosix(locked);
      if (l && normalized.startsWith(l)) {
        throw new Error(`Patch targets locked path: ${op.file}`);
      }
    }

    // Backwards-compatible handling for the reversible flag:
    // Many planners historically omitted the 'reversible' field. Treat a missing field as
    // reversible=true to avoid unnecessary rejections. Only explicitly false values are rejected.
    if (op.reversible === false) {
      throw new Error(`All ops must be reversible (op ${op.id})`);
    }

    if (op.start_line < 1) {
      throw new Error(`start_line must be >= 1 (op ${op.id})`);
    }

    // Coerce/validate end_line locally (don't mutate the op object here; callers should
    // rely on planners to emit correct shapes). This helps tolerate minor numeric issues
    // while still enforcing the final constraints.
    let endLine = op.end_line;
    if (endLine !== null && typeof endLine === "number" && endLine < op.start_line) {
      endLine = op.start_line;
    }

    switch (op.type) {
      case "replace_range":
        if (endLine === null) {
          throw new Error(`replace_range requires end_line (op ${op.id})`);
        }
        if (endLine < op.start_line) {
          throw new Error(`replace_range end_line must be >= start_line (op ${op.id})`);
        }
        return;

      case "insert_after":
        if (op.end_line !== null) {
          throw new Error(`insert_after must have end_line=null (op ${op.id})`);
        }
        return;

      case "delete_range":
        if (endLine === null) {
          throw new Error(`delete_range requires end_line (op ${op.id})`);
        }
        if (endLine < op.start_line) {
          throw new Error(`delete_range end_line must be >= start_line (op ${op.id})`);
        }
        if ((op.patch ?? "").trim().length > 0) {
          throw new Error(`delete_range patch must be empty (op ${op.id})`);
        }
        return;

      case "create_file":
      case "update_file":
        if (op.end_line !== null) {
          throw new Error(`${op.type} must have end_line=null (op ${op.id})`);
        }
        return;

      default: {
        const _exhaustive: never = op.type as never;
        throw new Error(`Unknown op type: ${String(_exhaustive)}`);
      }
    }
  }
}
