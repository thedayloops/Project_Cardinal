import path from "node:path";

export function toPosix(p: string): string {
  return p.replaceAll("\\", "/");
}

export function isSubPath(repoRoot: string, targetAbs: string): boolean {
  const rel = path.relative(repoRoot, targetAbs);
  return !!rel && !rel.startsWith("..") && !path.isAbsolute(rel);
}

export function resolveRepoPath(repoRoot: string, relPath: string): string {
  const safeRel = toPosix(relPath).replace(/^\/+/, "");
  return path.resolve(repoRoot, safeRel);
}
