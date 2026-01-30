import fs from "node:fs/promises";
import path from "node:path";

type CleanupOptions = {
  maxCount: number;
  maxAgeMs: number;
  keepPlanIds: Set<string>;
};

export async function cleanupArtifacts(
  artifactsDir: string,
  opts: CleanupOptions,
  log?: { info: (msg: string) => void }
): Promise<void> {
  let files: Array<{
    name: string;
    fullPath: string;
    mtimeMs: number;
  }> = [];

  try {
    const entries = await fs.readdir(artifactsDir);

    for (const name of entries) {
      const fullPath = path.join(artifactsDir, name);
      const stat = await fs.stat(fullPath);

      if (!stat.isFile()) continue;

      files.push({
        name,
        fullPath,
        mtimeMs: stat.mtimeMs
      });
    }
  } catch {
    return; // directory may not exist yet
  }

  const now = Date.now();

  // Oldest first
  files.sort((a, b) => a.mtimeMs - b.mtimeMs);

  const toDelete: string[] = [];

  // Rule 1: age-based
  for (const f of files) {
    if (
      now - f.mtimeMs > opts.maxAgeMs &&
      !opts.keepPlanIds.has(extractPlanId(f.name))
    ) {
      toDelete.push(f.fullPath);
    }
  }

  // Rule 2: count-based
  const remaining = files.filter(
    (f) => !toDelete.includes(f.fullPath)
  );

  if (remaining.length > opts.maxCount) {
    const overflow = remaining.length - opts.maxCount;
    for (let i = 0; i < overflow; i++) {
      const f = remaining[i];
      if (!opts.keepPlanIds.has(extractPlanId(f.name))) {
        toDelete.push(f.fullPath);
      }
    }
  }

  for (const p of toDelete) {
    await fs.unlink(p);
    log?.info(`artifact cleaned: ${path.basename(p)}`);
  }
}

function extractPlanId(filename: string): string {
  const match = filename.match(/^(plan_\d+)/);
  return match ? match[1] : "";
}
