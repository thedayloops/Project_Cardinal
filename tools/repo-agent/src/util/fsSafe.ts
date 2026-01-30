import fs from "node:fs/promises";
import path from "node:path";

export async function ensureDir(dirAbs: string): Promise<void> {
  await fs.mkdir(dirAbs, { recursive: true });
}

export async function writeFileAtomic(fileAbs: string, content: string): Promise<void> {
  const dir = path.dirname(fileAbs);
  await fs.mkdir(dir, { recursive: true });
  const tmp = fileAbs + ".tmp-" + Date.now();
  await fs.writeFile(tmp, content, "utf8");
  await fs.rename(tmp, fileAbs);
}

export async function fileExists(fileAbs: string): Promise<boolean> {
  try {
    await fs.stat(fileAbs);
    return true;
  } catch {
    return false;
  }
}
