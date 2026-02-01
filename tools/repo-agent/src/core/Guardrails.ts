// tools/repo-agent/src/core/Guardrails.ts

import path from "node:path";
import type { PatchPlan, PatchOp } from "../schemas/PatchPlan.js";

function toPosix(p: string): string {
  return path.posix.normalize(p.replace(/\\/g, "/"));
}

export type GuardrailConfig = {
  repoRoot: string;
  lockedPathPrefixes: string[];
  deniedPathPrefixes: string[];
  maxOps: number;
  maxTotalWriteBytes: number;
};

export class Guardrails {
  constructor(private cfg: GuardrailConfig) {}

  validatePatchPlan(plan: PatchPlan, mode?: string): void {
    if (plan.ops.length > this.cfg.maxOps) {
      throw new Error(`PatchPlan exceeds max ops`);
    }

    let totalBytes = 0;
    for (const op of plan.ops) {
      this.validateOp(op);
      totalBytes += Buffer.byteLength(op.patch ?? "", "utf8");
    }

    if (totalBytes > this.cfg.maxTotalWriteBytes) {
      throw new Error(`PatchPlan exceeds max write bytes`);
    }
  }

  private validateOp(op: PatchOp): void {
    const normalized = toPosix(op.file);

    // Absolute / traversal / Windows drive paths
    if (
      !normalized ||
      normalized.startsWith("/") ||
      /^[A-Za-z]:\//.test(normalized) ||
      normalized.includes("..")
    ) {
      throw new Error(`Unsafe path in op: ${op.file}`);
    }

    // 🚫 CRITICAL: prevent recursive repo-agent nesting
    if (normalized.startsWith("tools/repo-agent/")) {
      throw new Error(
        `Invalid patch path. Paths must be relative to repo-agent root: ${op.file}`
      );
    }

    for (const locked of this.cfg.lockedPathPrefixes) {
      if (normalized.startsWith(toPosix(locked))) {
        throw new Error(`Patch targets locked path: ${op.file}`);
      }
    }

    for (const denied of this.cfg.deniedPathPrefixes) {
      if (normalized.startsWith(toPosix(denied))) {
        throw new Error(`Patch targets denied path: ${op.file}`);
      }
    }
  }
}
