// tools/repo-agent/src/util/artifactsDir.ts
import path from "node:path";

/**
 * Resolve the agent artifacts directory to an absolute path.
 * If `artifactsDir` is already absolute, it is returned as-is (normalized).
 * Otherwise it is resolved relative to `repoRoot`.
 */
export function resolveArtifactsDirAbs(repoRoot: string, artifactsDir: string): string {
  const dir = artifactsDir?.trim() ? artifactsDir.trim() : "agent_artifacts";
  const abs = path.isAbsolute(dir) ? dir : path.resolve(repoRoot, dir);
  return path.resolve(abs);
}

/**
 * Create a stable filename for plan/diff artifacts.
 * Keeps names safe and predictable for Discord attachments.
 */
export function makeArtifactFileName(prefix: string, planId: string, ext: string): string {
  const safePlanId = (planId || "unknown").replace(/[^a-zA-Z0-9._-]+/g, "_");
  const safePrefix = (prefix || "artifact").replace(/[^a-zA-Z0-9._-]+/g, "_");
  const safeExt = ext.startsWith(".") ? ext.slice(1) : ext;
  return `${safePrefix}_${safePlanId}.${safeExt}`;
}
