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

const SELF_IMPROVE_DENY_PREFIXES = [
  "src/core/Agent.ts",
  "src/integrations/DiscordBot.ts",
  "src/core/PlannerFactory.ts",
  "src/core/ContextBuilder.ts",
  "src/index.ts",
];

export class Guardrails {
  constructor(private cfg: GuardrailConfig) {}

  validatePatchPlan(plan: PatchPlan, mode?: string): void {
    if (plan.ops.length > this.cfg.maxOps) {
      throw new Error(
        `PatchPlan exceeds max ops (${plan.ops.length} > ${this.cfg.maxOps})`
      );
    }

    let totalBytes = 0;

    for (const op of plan.ops) {
      this.validateOp(op, mode);
      totalBytes += Buffer.byteLength(op.patch ?? "", "utf8");
    }

    if (totalBytes > this.cfg.maxTotalWriteBytes) {
      throw new Error(
        `PatchPlan exceeds max write bytes (${totalBytes} > ${this.cfg.maxTotalWriteBytes})`
      );
    }
  }

  private validateOp(op: PatchOp, mode?: string): void {
    const normalized = toPosix(op.file);

    // Absolute / unsafe paths
    if (
      !normalized ||
      normalized.startsWith("/") ||
      /^[A-Za-z]:\//.test(normalized) ||
      normalized.includes("..")
    ) {
      throw new Error(`Unsafe path in op: ${op.file}`);
    }

    // Self-improve hard stop list
    if (mode === "self_improve") {
      for (const blocked of SELF_IMPROVE_DENY_PREFIXES) {
        if (normalized.startsWith(blocked)) {
          throw new Error(
            `self_improve is not allowed to modify core file: ${op.file}`
          );
        }
      }
    }

    // Locked paths
    for (const locked of this.cfg.lockedPathPrefixes) {
      if (normalized.startsWith(toPosix(locked))) {
        throw new Error(`Patch targets locked path: ${op.file}`);
      }
    }

    // Denied paths
    for (const denied of this.cfg.deniedPathPrefixes) {
      if (normalized.startsWith(toPosix(denied))) {
        throw new Error(`Patch targets denied path: ${op.file}`);
      }
    }

    // Line safety
    const start = Math.max(1, Number(op.start_line ?? 1));
    const end =
      op.end_line === null || op.end_line === undefined
        ? null
        : Math.max(start, Number(op.end_line));

    switch (op.type) {
      case "replace_range":
      case "delete_range":
        if (end === null) {
          throw new Error(`${op.type} requires end_line`);
        }
        return;

      case "insert_after":
        if (end !== null) {
          throw new Error(`insert_after must not have end_line`);
        }
        return;

      case "create_file":
      case "update_file":
        if (end !== null) {
          throw new Error(`${op.type} must have end_line=null`);
        }
        return;

      default:
        throw new Error(`Unknown op type: ${(op as any).type}`);
    }
  }
}
