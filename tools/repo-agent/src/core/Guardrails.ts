import path from "node:path";
import { PatchPlan } from "../schemas/PatchPlan.js";
import { toPosix } from "../util/paths.js";

export class Guardrails {
  constructor(
    private repoRoot: string,
    private opts: {
      lockedPathPrefixes: string[];
      deniedPathPrefixes: string[];
      maxTotalWriteBytes: number;
      maxOps: number;
    }
  ) {}

  validatePlan(plan: PatchPlan): { ok: true } | { ok: false; reason: string } {
    if (plan.ops.length > this.opts.maxOps) {
      return { ok: false, reason: `Too many ops (${plan.ops.length} > ${this.opts.maxOps})` };
    }

    const unlocks = new Set(plan.meta.unlockPathPrefixes.map((p) => normalizePrefix(p)));
    const denied = this.opts.deniedPathPrefixes.map(normalizePrefix);
    const locked = this.opts.lockedPathPrefixes.map(normalizePrefix);

    let totalWriteBytes = 0;

    for (const op of plan.ops) {
      const pathsToCheck: string[] =
        op.type === "rename"
          ? [op.from, op.to]
          : op.type === "delete"
            ? [op.path]
            : [op.path];

      for (const rel of pathsToCheck) {
        const relPosix = toPosix(rel).replace(/^\/+/, "");
        if (!relPosix || relPosix.includes("..")) {
          return { ok: false, reason: `Invalid path traversal: ${rel}` };
        }
        if (path.isAbsolute(relPosix)) {
          return { ok: false, reason: `Absolute paths not allowed: ${rel}` };
        }

        // denylist
        for (const d of denied) {
          if (relPosix.startsWith(d)) return { ok: false, reason: `Denied path: ${relPosix}` };
        }

        // locked paths require explicit unlock
        const isLocked = locked.some((l) => relPosix.startsWith(l));
        if (isLocked) {
          const unlocked = Array.from(unlocks).some((u) => relPosix.startsWith(u));
          if (!unlocked) return { ok: false, reason: `Locked path without unlock: ${relPosix}` };
        }

        // must be within repo (relative check done above; enforce repoRoot joining discipline elsewhere)
        const abs = path.resolve(this.repoRoot, relPosix);
        const relBack = path.relative(this.repoRoot, abs);
        if (relBack.startsWith("..") || path.isAbsolute(relBack)) {
          return { ok: false, reason: `Path escapes repo: ${relPosix}` };
        }
      }

      if (op.type === "create" || op.type === "update") {
        totalWriteBytes += Buffer.byteLength(op.content, "utf8");
      }
    }

    if (totalWriteBytes > this.opts.maxTotalWriteBytes) {
      return {
        ok: false,
        reason: `Too much write content (${totalWriteBytes} bytes > ${this.opts.maxTotalWriteBytes})`
      };
    }

    // Rollback must be present and plausible
    if (!plan.meta.rollback?.instructions || plan.meta.rollback.instructions.length < 10) {
      return { ok: false, reason: "Missing rollback instructions" };
    }

    return { ok: true };
  }
}

function normalizePrefix(p: string): string {
  const posix = toPosix(p).replace(/^\/+/, "");
  return posix;
}
