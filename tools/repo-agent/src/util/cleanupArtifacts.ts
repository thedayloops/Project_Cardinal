import fs from "node:fs/promises";
import path from "node:path";

type CleanupOptions = {
  maxCount: number;
  maxAgeMs: number;
  keepPlanIds: Set<string>;
};

type ArtifactFile = {
  name: string;
  fullPath: string;
  mtimeMs: number;
  planId: string;
};

export async function cleanupArtifacts(
  artifactsDir: string,
  opts: CleanupOptions,
  log?: { info: (msg: string) => void }
): Promise<void> {
  let files: ArtifactFile[] = [];

  try {
    const entries = await fs.readdir(artifactsDir);

    for (const name of entries) {
      const fullPath = path.join(artifactsDir, name);
      const stat = await fs.stat(fullPath);

      if (!stat.isFile()) continue;

      const planId = extractPlanId(name);

      files.push({
        name,
        fullPath,
        mtimeMs: stat.mtimeMs,
        planId
      });
    }
  } catch {
    return; // artifacts dir may not exist yet
  }

  const now = Date.now();

  // Oldest first
  files.sort((a, b) => a.mtimeMs - b.mtimeMs);

  const toDelete = new Set<string>();

  /* ---------------------------------- */
  /* Rule 1: age-based cleanup           */
  /* ---------------------------------- */

  for (const f of files) {
    if (
      f.planId &&
      opts.keepPlanIds.has(f.planId)
    ) {
      continue;
    }

    if (now - f.mtimeMs > opts.maxAgeMs) {
      toDelete.add(f.fullPath);
    }
  }

  /* ---------------------------------- */
  /* Rule 2: count-based cleanup         */
  /* Count by unique plan IDs, not files */
  /* ---------------------------------- */

  const remaining = files.filter(
    (f) => !toDelete.has(f.fullPath)
  );

  const plansInOrder: string[] = [];
  for (const f of remaining) {
    if (f.planId && !plansInOrder.includes(f.planId)) {
      plansInOrder.push(f.planId);
    }
  }

  if (plansInOrder.length > opts.maxCount) {
    const overflowPlans = plansInOrder.slice(
      0,
      plansInOrder.length - opts.maxCount
    );

    for (const f of remaining) {
      if (
        f.planId &&
        overflowPlans.includes(f.planId) &&
        !opts.keepPlanIds.has(f.planId)
      ) {
        toDelete.add(f.fullPath);
      }
    }
  }

  /* ---------------------------------- */
  /* Execute deletes                     */
  /* ---------------------------------- */

  for (const p of toDelete) {
    await fs.unlink(p);
    log?.info(`artifact cleaned: ${path.basename(p)}`);
  }
}

/**
 * Extracts the plan ID from any artifact belonging to a plan.
 *
 * Examples:
 *  - plan_123_files.json  → plan_123
 *  - plan_123_patch.json  → plan_123
 *  - plan_123.json        → plan_123
 */
function extractPlanId(filename: string): string {
  const match = filename.match(/^(plan_\d+)/);
  return match ? match[1] : "";
}
